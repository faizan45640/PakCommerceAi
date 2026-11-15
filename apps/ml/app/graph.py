"""WhatsApp Sales Agent graph: classify -> route -> (handoff | policy | respond) -> finalize."""

from __future__ import annotations

import operator
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import ToolException
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph

from app.intents import classify
from app.tools_client import ToolsClient

MIN_CONFIDENCE = 0.5
MAX_TOOL_ROUNDS = 4
NO_ANSWER = "NO_ANSWER"
TOOL_INTENTS = {"product_search", "stock_check", "order_interest"}

LANGUAGE_NAMES = {
    "en": "English",
    "ur": "Urdu (Urdu script)",
    "roman_ur": "Roman Urdu (Urdu written in Latin letters)",
}


class AgentState(TypedDict, total=False):
    conversation_id: str
    body: str
    history: list[dict[str, str]]
    policy_text: str | None
    # Per-conversation memory kept by the checkpointer (used when no history is sent).
    transcript: Annotated[list[dict[str, str]], operator.add]
    intent: str
    confidence: float
    language: str
    reply: str | None
    handoff_required: bool
    handoff_reason: str | None
    tool_calls: list[dict[str, Any]]


def system_prompt(language: str, *, has_tools: bool) -> str:
    rules = [
        "You are the WhatsApp sales assistant of an online shop in Pakistan.",
        f"Reply in the buyer's language and script: {LANGUAGE_NAMES.get(language, 'English')}.",
        "Keep replies short and WhatsApp-style: 1-3 sentences, friendly, no markdown, few emojis.",
        "NEVER invent prices, stock, sizes, delivery times, or policies. State only facts that "
        "appear in tool output. If you do not have a fact, say a seller will confirm.",
        "Never ask for or repeat phone numbers, card numbers or passwords.",
        "If the buyer wants to order, note what they want and say a seller will confirm the "
        "order shortly. Do not claim an order is placed.",
    ]
    if has_tools:
        rules.append("Use the tools to look up products and stock before answering about them.")
    else:
        rules.append("You have no tools, so do not state any product facts.")
    return "\n".join(rules)


def _turns(state: AgentState) -> list[dict[str, str]]:
    return (state.get("history") or state.get("transcript") or [])[-10:]


def _to_messages(turns: list[dict[str, str]]) -> list[BaseMessage]:
    out: list[BaseMessage] = []
    for t in turns:
        out.append(HumanMessage(t["content"]) if t["role"] == "user" else AIMessage(t["content"]))
    return out


def _text(msg: BaseMessage) -> str:
    content = msg.content
    if isinstance(content, str):
        return content.strip()
    return "".join(p if isinstance(p, str) else p.get("text", "") for p in content).strip()


def build_graph(
    model: BaseChatModel,
    tools_client: ToolsClient | None = None,
    checkpointer: BaseCheckpointSaver | None = None,
    *,
    min_confidence: float = MIN_CONFIDENCE,
):
    async def classify_node(state: AgentState) -> dict[str, Any]:
        result = await classify(model, state["body"], _turns(state))
        return {
            "intent": result.intent,
            "confidence": result.confidence,
            "language": result.language,
            "reply": None,
            "handoff_required": False,
            "handoff_reason": None,
            "tool_calls": [],
        }

    def route(state: AgentState) -> Literal["handoff", "policy", "respond"]:
        if state["intent"] == "handoff" or state["confidence"] < min_confidence:
            return "handoff"
        return "policy" if state["intent"] == "policy" else "respond"

    def handoff_node(state: AgentState) -> dict[str, Any]:
        reason = (
            "buyer_needs_human"
            if state["intent"] == "handoff"
            else f"low_confidence:{state['confidence']:.2f}"
        )
        return {"reply": None, "handoff_required": True, "handoff_reason": reason}

    async def policy_node(state: AgentState) -> dict[str, Any]:
        policy = (state.get("policy_text") or "").strip()
        if not policy:
            return {"reply": None, "handoff_required": True, "handoff_reason": "policy_unavailable"}
        prompt = (
            system_prompt(state["language"], has_tools=False)
            + "\nAnswer ONLY from the seller policy below. If it does not answer the question, "
            f"reply exactly {NO_ANSWER}.\n\nSeller policy:\n{policy}"
        )
        msgs = [SystemMessage(prompt), *_to_messages(_turns(state)), HumanMessage(state["body"])]
        text = _text(await model.ainvoke(msgs))
        if not text or NO_ANSWER in text:
            return {"reply": None, "handoff_required": True, "handoff_reason": "policy_not_covered"}
        return {"reply": text}

    async def respond_node(state: AgentState) -> dict[str, Any]:
        tools: list[Any] = []
        if tools_client is not None:
            try:
                specs = await tools_client.list_specs()
                tools = tools_client.build_tools(specs, state["conversation_id"])
            except Exception:  # noqa: BLE001 - any Node failure means we cannot ground facts
                tools = []
        if state["intent"] in TOOL_INTENTS and not tools:
            return {"reply": None, "handoff_required": True, "handoff_reason": "tools_unavailable"}

        by_name = {t.name: t for t in tools}
        llm = model.bind_tools(tools) if tools else model
        msgs: list[BaseMessage] = [
            SystemMessage(system_prompt(state["language"], has_tools=bool(tools))),
            *_to_messages(_turns(state)),
            HumanMessage(state["body"]),
        ]
        calls: list[dict[str, Any]] = []
        for _ in range(MAX_TOOL_ROUNDS + 1):
            ai = await llm.ainvoke(msgs)
            msgs.append(ai)
            pending = getattr(ai, "tool_calls", None) or []
            if not pending:
                text = _text(ai)
                if not text:
                    return {
                        "reply": None,
                        "handoff_required": True,
                        "handoff_reason": "empty_reply",
                        "tool_calls": calls,
                    }
                return {"reply": text, "tool_calls": calls}
            for call in pending:
                tool = by_name.get(call["name"])
                try:
                    if tool is None:
                        raise ToolException(f"Unknown tool {call['name']}.")
                    content = await tool.ainvoke(call["args"])
                    ok = True
                except ToolException as exc:
                    content, ok = str(exc), False
                calls.append({"name": call["name"], "ok": ok})
                msgs.append(ToolMessage(content=str(content), tool_call_id=call["id"]))
        return {
            "reply": None,
            "handoff_required": True,
            "handoff_reason": "tool_loop_limit",
            "tool_calls": calls,
        }

    def finalize_node(state: AgentState) -> dict[str, Any]:
        turn = [{"role": "user", "content": state["body"]}]
        if state.get("reply"):
            turn.append({"role": "assistant", "content": state["reply"]})
        return {"transcript": turn}

    g = StateGraph(AgentState)
    g.add_node("classify", classify_node)
    g.add_node("handoff", handoff_node)
    g.add_node("policy", policy_node)
    g.add_node("respond", respond_node)
    g.add_node("finalize", finalize_node)
    g.add_edge(START, "classify")
    g.add_conditional_edges("classify", route, ["handoff", "policy", "respond"])
    for node in ("handoff", "policy", "respond"):
        g.add_edge(node, "finalize")
    g.add_edge("finalize", END)
    return g.compile(checkpointer=checkpointer)
