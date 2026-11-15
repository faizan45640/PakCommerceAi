"""Builds LangChain tools from the Node agent-tool registry (tools are defined once, in Node)."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
from langchain_core.tools import StructuredTool, ToolException

_DROP_KEYS = {"$schema", "$id", "additionalProperties", "default", "examples"}


def sanitize_schema(node: Any) -> Any:
    """Strip JSON Schema keywords that Gemini/OpenAI tool converters reject."""
    if isinstance(node, dict):
        return {k: sanitize_schema(v) for k, v in node.items() if k not in _DROP_KEYS}
    if isinstance(node, list):
        return [sanitize_schema(v) for v in node]
    return node


class ToolsClient:
    """Fetches tool specs (cached) and executes tools over HTTP.

    `conversationId` is bound here, never taken from the model. Node derives the
    workspace from it.
    """

    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        client: httpx.AsyncClient | None = None,
        cache_seconds: float = 60.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}
        self._client = client or httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
        self._cache_seconds = cache_seconds
        self._specs: list[dict[str, Any]] | None = None
        self._fetched_at = 0.0

    async def list_specs(self) -> list[dict[str, Any]]:
        if self._specs is not None and time.monotonic() - self._fetched_at < self._cache_seconds:
            return self._specs
        resp = await self._client.get(f"{self._base}/api/v1/agent/tools", headers=self._headers)
        resp.raise_for_status()
        self._specs = resp.json()["data"]
        self._fetched_at = time.monotonic()
        return self._specs

    async def call(self, name: str, conversation_id: str, tool_input: dict[str, Any]) -> Any:
        """Return the tool output; raise ToolException with a model-readable message on failure."""
        try:
            resp = await self._client.post(
                f"{self._base}/api/v1/agent/tools/{name}",
                headers=self._headers,
                json={"conversationId": conversation_id, "input": tool_input},
            )
            body = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ToolException(
                f"Tool {name} is unavailable right now ({type(exc).__name__})."
            ) from exc
        if isinstance(body, dict) and body.get("ok") is True:
            return body.get("output")
        err = (body.get("error") if isinstance(body, dict) else None) or {}
        raise ToolException(
            f"Tool {name} failed: {err.get('code', 'error')}: {err.get('message', 'unknown error')}"
        )

    def build_tools(
        self, specs: list[dict[str, Any]], conversation_id: str
    ) -> list[StructuredTool]:
        """Tools needing seller approval are skipped; approvals arrive with draft orders (S11)."""
        return [self._build(s, conversation_id) for s in specs if not s.get("needsApproval")]

    def _build(self, spec: dict[str, Any], conversation_id: str) -> StructuredTool:
        name = spec["name"]

        async def run(**kwargs: Any) -> str:
            output = await self.call(name, conversation_id, kwargs)
            return output if isinstance(output, str) else json.dumps(output, ensure_ascii=False)

        return StructuredTool(
            name=name,
            description=spec.get("description") or name,
            args_schema=sanitize_schema(
                spec.get("inputSchema") or {"type": "object", "properties": {}}
            ),
            coroutine=run,
            handle_tool_error=False,
        )
