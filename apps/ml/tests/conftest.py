"""Shared fakes. No network, no real LLM."""

from __future__ import annotations

from typing import Any

import pytest
from app.intents import IntentResult
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import RunnableLambda

API_URL = "http://node.test"
TOKEN = "secret-token"

TOOL_SPECS = [
    {
        "name": "searchProducts",
        "description": "Search the catalogue.",
        "permission": "products:read",
        "owner": "catalog",
        "needsApproval": False,
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "checkInventory",
        "description": "Check stock.",
        "permission": "inventory:read",
        "owner": "inventory",
        "needsApproval": False,
        "inputSchema": {
            "type": "object",
            "properties": {"productId": {"type": "string"}},
            "required": ["productId"],
        },
    },
]


class FakeChat(BaseChatModel):
    """Scripted chat model. `classification` answers structured-output calls;
    `script` is the queue of AIMessages returned by plain/tool calls."""

    classification: IntentResult | None = None
    script: list[AIMessage] = []
    seen: list[list[BaseMessage]] = []

    @property
    def _llm_type(self) -> str:
        return "fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs: Any) -> ChatResult:
        self.seen.append(list(messages))
        msg = self.script.pop(0) if self.script else AIMessage("ok")
        return ChatResult(generations=[ChatGeneration(message=msg)])

    def bind_tools(self, tools, **kwargs: Any):
        return self

    def with_structured_output(self, schema, **kwargs: Any):
        def run(messages):
            self.seen.append(list(messages))
            return self.classification

        return RunnableLambda(run)


def make_model(
    intent: str = "other",
    confidence: float = 0.9,
    language: str = "en",
    script: list[AIMessage] | None = None,
) -> FakeChat:
    return FakeChat(
        classification=IntentResult(intent=intent, confidence=confidence, language=language),
        script=script or [],
        seen=[],
    )


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("API_URL", API_URL)
    monkeypatch.delenv("AGENT_DATABASE_URL", raising=False)
