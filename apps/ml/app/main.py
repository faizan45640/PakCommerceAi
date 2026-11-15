"""FastAPI entrypoint for the WhatsApp Sales Agent."""

from __future__ import annotations

import hmac
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Request
from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import BaseModel, ConfigDict, Field

from app.checkpoint import open_checkpointer
from app.graph import build_graph
from app.intents import Intent
from app.llm import get_chat_model
from app.tools_client import ToolsClient

log = logging.getLogger("agent")


class Media(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contentType: str | None = None  # noqa: N815
    transcript: str | None = None  # voice note text from the STT step


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: str = ""
    media: list[Media] | None = None


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str


class RespondRequest(BaseModel):
    # extra=forbid: the agent must never receive a buyer phone or other identifiers.
    model_config = ConfigDict(extra="forbid")
    conversationId: str = Field(min_length=1, max_length=200)  # noqa: N815
    message: Message
    history: list[Turn] | None = None
    # Seller-provided delivery/return/payment text. Without it, policy questions hand off.
    policyText: str | None = None  # noqa: N815
    # Required: the agent only replies in ai_active, anything else fails closed.
    conversationState: str  # noqa: N815


class Handoff(BaseModel):
    required: bool
    reason: str | None = None


class ToolCall(BaseModel):
    name: str
    ok: bool


class OrderEvent(BaseModel):
    type: Literal["draft_created", "confirmed", "awaiting_seller", "cancelled"]
    orderId: str  # noqa: N815


class RespondResponse(BaseModel):
    reply: str | None
    intent: Intent | None
    confidence: float
    handoff: Handoff
    toolCalls: list[ToolCall]  # noqa: N815
    orderEvents: list[OrderEvent] = []  # noqa: N815


def create_app(
    *, model: BaseChatModel | None = None, tools_client: ToolsClient | None = None
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        token = os.environ.get("AGENT_SERVICE_TOKEN", "")
        api_url = os.environ.get("API_URL", "")
        client = tools_client
        if client is None and api_url and token:
            client = ToolsClient(api_url, token)
        async with open_checkpointer() as saver:
            app.state.graph = build_graph(model or get_chat_model(), client, saver)
            yield

    app = FastAPI(title="PakCommerce ML / Agent", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/agent/respond", response_model=RespondResponse)
    async def respond(
        body: RespondRequest,
        request: Request,
        x_agent_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ) -> RespondResponse:
        expected = os.environ.get("AGENT_SERVICE_TOKEN", "")
        if not expected:
            raise HTTPException(503, "AGENT_SERVICE_TOKEN is not configured")
        supplied = x_agent_token or ""
        if not supplied and authorization and authorization.lower().startswith("bearer "):
            supplied = authorization[7:].strip()
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise HTTPException(401, "Unauthorized")

        if body.conversationState != "ai_active":
            return RespondResponse(
                reply=None,
                intent=None,
                confidence=0.0,
                handoff=Handoff(required=False, reason="not_ai_active"),
                toolCalls=[],
            )

        text = body.message.body
        for m in body.message.media or []:
            if m.transcript:
                text = f"{text}\n{m.transcript}".strip()

        state = {
            "conversation_id": body.conversationId,
            "body": text,
            "history": [t.model_dump() for t in body.history or []],
            "policy_text": body.policyText,
        }
        config = {"configurable": {"thread_id": body.conversationId}}
        try:
            out = await request.app.state.graph.ainvoke(state, config)
        except Exception as exc:  # noqa: BLE001 - fail closed, log the type only
            log.warning("agent graph failed: %s", type(exc).__name__)
            return RespondResponse(
                reply=None,
                intent=None,
                confidence=0.0,
                handoff=Handoff(required=True, reason="agent_error"),
                toolCalls=[],
            )
        log.info(
            "agent turn conversation=%s intent=%s handoff=%s",
            body.conversationId,
            out["intent"],
            out["handoff_required"],
        )
        return RespondResponse(
            reply=out.get("reply"),
            intent=out["intent"],
            confidence=out["confidence"],
            handoff=Handoff(required=out["handoff_required"], reason=out.get("handoff_reason")),
            toolCalls=[ToolCall(**c) for c in out.get("tool_calls", [])],
            orderEvents=[OrderEvent(**e) for e in out.get("order_events") or []],
        )

    return app


def app_factory() -> FastAPI:
    """`uvicorn app.main:app_factory --factory`."""
    return create_app()
