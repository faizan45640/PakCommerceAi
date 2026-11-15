from __future__ import annotations

import asyncio

import httpx
import pytest
import respx
from app.checkpoint import open_checkpointer
from app.intents import INTENTS, classifier_system_prompt
from app.llm import LLMConfigError, get_chat_model
from app.tools_client import ToolsClient, sanitize_schema
from langchain_core.tools import StructuredTool, ToolException
from langchain_deepseek import ChatDeepSeek
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from tests.conftest import API_URL, TOKEN, TOOL_SPECS


def test_provider_factory_per_env() -> None:
    ds = get_chat_model({"DEEPSEEK_API_KEY": "k"})
    assert isinstance(ds, ChatDeepSeek) and ds.model_name == "deepseek-chat"

    g = get_chat_model({"AI_PROVIDER": "google", "GOOGLE_GENERATIVE_AI_API_KEY": "k"})
    assert isinstance(g, ChatGoogleGenerativeAI)

    orr = get_chat_model(
        {"AI_PROVIDER": "openrouter", "OPENROUTER_API_KEY": "k", "AI_MODEL": "meta/llama"}
    )
    assert isinstance(orr, ChatOpenAI) and orr.model_name == "meta/llama"
    assert "openrouter.ai" in str(orr.openai_api_base)

    ol = get_chat_model({"AI_PROVIDER": "ollama", "OLLAMA_BASE_URL": "http://h:11434/api"})
    assert isinstance(ol, ChatOllama) and ol.base_url == "http://h:11434"


def test_provider_factory_errors() -> None:
    with pytest.raises(LLMConfigError, match="DEEPSEEK_API_KEY"):
        get_chat_model({})
    with pytest.raises(LLMConfigError, match="Unknown AI_PROVIDER"):
        get_chat_model({"AI_PROVIDER": "nope"})


def test_every_intent_has_multilingual_examples() -> None:
    assert set(INTENTS) == {
        "greeting",
        "product_search",
        "stock_check",
        "policy",
        "order_interest",
        "handoff",
        "other",
    }
    prompt = classifier_system_prompt()
    assert "kisi insaan se baat karao" in prompt and "ye kurta medium mein hai?" in prompt


def test_tool_spec_to_structured_tool() -> None:
    client = ToolsClient(API_URL, TOKEN, client=httpx.AsyncClient())
    tools = client.build_tools(TOOL_SPECS, "conv-1")
    assert [t.name for t in tools] == ["searchProducts", "checkInventory"]
    assert all(isinstance(t, StructuredTool) for t in tools)
    schema = tools[0].tool_call_schema
    assert schema["properties"] == {"query": {"type": "string"}}
    assert schema["required"] == ["query"]
    # conversationId is bound, never exposed to the model
    assert "conversationId" not in str(schema)


def test_approval_tools_are_not_exposed() -> None:
    spec = {**TOOL_SPECS[0], "name": "createDraftOrder", "needsApproval": True}
    client = ToolsClient(API_URL, TOKEN, client=httpx.AsyncClient())
    assert client.build_tools([spec], "c") == []


@respx.mock
def test_tool_error_passthrough_and_network_failure() -> None:
    respx.post(f"{API_URL}/api/v1/agent/tools/searchProducts").mock(
        return_value=httpx.Response(
            200, json={"ok": False, "error": {"code": "FORBIDDEN", "message": "nope"}}
        )
    )
    respx.post(f"{API_URL}/api/v1/agent/tools/checkInventory").mock(
        side_effect=httpx.ConnectTimeout("t")
    )
    client = ToolsClient(API_URL, TOKEN, client=httpx.AsyncClient())
    search, inv = client.build_tools(TOOL_SPECS, "c")

    with pytest.raises(ToolException, match="FORBIDDEN: nope"):
        asyncio.run(search.ainvoke({"query": "x"}))
    with pytest.raises(ToolException, match="unavailable"):
        asyncio.run(inv.ainvoke({"productId": "p"}))


def test_checkpointer_defaults_to_memory() -> None:
    async def go() -> str:
        async with open_checkpointer("") as saver:
            return type(saver).__name__

    assert "InMemory" in asyncio.run(go())


def test_schema_is_sanitized_for_provider_converters() -> None:
    raw = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "additionalProperties": False,
        "properties": {"query": {"type": "string", "default": "x"}},
        "required": ["query"],
    }
    clean = sanitize_schema(raw)
    assert clean == {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    }
    spec = {**TOOL_SPECS[0], "inputSchema": raw}
    tool = ToolsClient(API_URL, TOKEN, client=httpx.AsyncClient()).build_tools([spec], "c")[0]
    from langchain_core.utils.function_calling import convert_to_openai_tool

    assert "$schema" not in str(convert_to_openai_tool(tool))
    from langchain_google_genai._function_utils import convert_to_genai_function_declarations

    convert_to_genai_function_declarations([tool])


def test_deepseek_thinking_off_by_default_and_configurable():
    ds = get_chat_model({"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "k"})
    assert ds.extra_body == {"thinking": {"type": "disabled"}}
    on = get_chat_model(
        {"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "k", "DEEPSEEK_THINKING": "enabled"}
    )
    assert on.extra_body == {"thinking": {"type": "enabled"}}
    with pytest.raises(LLMConfigError):
        get_chat_model(
            {"AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "k", "DEEPSEEK_THINKING": "max"}
        )


def test_policy_guard_ignores_free_size_but_catches_free_delivery() -> None:
    from app.graph import POLICY_TERMS

    assert not POLICY_TERMS.search("Shawl free size 2.5m mein hai, price 8500 PKR")
    assert not POLICY_TERMS.search("Free-Size kurta available hai")
    assert POLICY_TERMS.search("delivery free hai")
    assert POLICY_TERMS.search("Lahore mein free shipping")
    assert POLICY_TERMS.search("aapko 10% off milega")
