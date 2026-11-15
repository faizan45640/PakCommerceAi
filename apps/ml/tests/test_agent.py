from __future__ import annotations

import httpx
import pytest
import respx
from app.main import create_app
from app.tools_client import ToolsClient
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from tests.conftest import API_URL, TOKEN, TOOL_SPECS, make_model

PHONE = "+923001234567"
HEADERS = {"X-Agent-Token": TOKEN}


def post(client: TestClient, body: str = "hi", **extra):
    payload = {"conversationId": "conv-1", "message": {"body": body}, **extra}
    return client.post("/agent/respond", json=payload, headers=HEADERS)


def run(model, *, tools: ToolsClient | None = None, **extra):
    with TestClient(create_app(model=model, tools_client=tools)) as client:
        resp = post(client, **extra)
    assert resp.status_code == 200, resp.text
    return resp.json()


def mocked_tools() -> ToolsClient:
    return ToolsClient(API_URL, TOKEN, client=httpx.AsyncClient())


def test_health() -> None:
    with TestClient(create_app(model=make_model())) as client:
        assert client.get("/health").json() == {"status": "ok"}


def test_greeting_replies_in_roman_urdu() -> None:
    model = make_model("greeting", language="roman_ur", script=[AIMessage("Walaikum assalam!")])
    out = run(model, body="salam")
    assert out["reply"] == "Walaikum assalam!"
    assert out["handoff"] == {"required": False, "reason": None}
    # the language instruction reached the respond prompt
    assert any("Roman Urdu" in str(m.content) for m in model.seen[-1])


def test_handoff_intent_gives_no_reply() -> None:
    out = run(make_model("handoff"), body="kisi insaan se baat karao")
    assert out["reply"] is None
    assert out["handoff"]["required"] is True
    assert out["handoff"]["reason"] == "buyer_needs_human"


def test_low_confidence_hands_off() -> None:
    model = make_model("product_search", confidence=0.3, script=[AIMessage("should not be sent")])
    out = run(model)
    assert out["reply"] is None
    assert out["handoff"]["required"] is True
    assert out["handoff"]["reason"].startswith("low_confidence")


def test_policy_without_seller_text_hands_off() -> None:
    model = make_model("policy", script=[AIMessage("3-5 days")])
    out = run(model, body="Lahore delivery kitne din?")
    assert out["reply"] is None
    assert out["handoff"] == {"required": True, "reason": "policy_unavailable"}
    assert len(model.script) == 1  # the model was never asked to answer


def test_policy_answers_from_seller_text() -> None:
    model = make_model("policy", script=[AIMessage("Lahore: 2-3 din.")])
    out = run(model, policyText="Lahore delivery 2-3 working days.")
    assert out["reply"] == "Lahore: 2-3 din."
    assert any("Lahore delivery 2-3 working days." in str(m.content) for m in model.seen[-1])


def test_policy_not_covered_hands_off() -> None:
    model = make_model("policy", script=[AIMessage("NO_ANSWER")])
    out = run(model, policyText="We ship nationwide.")
    assert out["handoff"]["reason"] == "policy_not_covered"
    assert out["reply"] is None


@respx.mock
def test_stock_check_calls_node_tool() -> None:
    respx.get(f"{API_URL}/api/v1/agent/tools").mock(
        return_value=httpx.Response(200, json={"data": TOOL_SPECS})
    )
    route = respx.post(f"{API_URL}/api/v1/agent/tools/checkInventory").mock(
        return_value=httpx.Response(200, json={"ok": True, "output": {"inStock": 3}})
    )
    model = make_model(
        "stock_check",
        script=[
            AIMessage(
                "",
                tool_calls=[{"name": "checkInventory", "args": {"productId": "p1"}, "id": "c1"}],
            ),
            AIMessage("Ji, 3 pieces available hain."),
        ],
    )
    out = run(model, tools=mocked_tools())
    assert out["reply"] == "Ji, 3 pieces available hain."
    assert out["toolCalls"] == [{"name": "checkInventory", "ok": True}]
    sent = route.calls[0].request
    assert sent.headers["authorization"] == f"Bearer {TOKEN}"
    assert sent.read() == b'{"conversationId":"conv-1","input":{"productId":"p1"}}'


@respx.mock
def test_tool_error_reaches_the_model() -> None:
    respx.get(f"{API_URL}/api/v1/agent/tools").mock(
        return_value=httpx.Response(200, json={"data": TOOL_SPECS})
    )
    respx.post(f"{API_URL}/api/v1/agent/tools/searchProducts").mock(
        return_value=httpx.Response(
            200, json={"ok": False, "error": {"code": "NOT_FOUND", "message": "no such product"}}
        )
    )
    model = make_model(
        "product_search",
        script=[
            AIMessage(
                "", tool_calls=[{"name": "searchProducts", "args": {"query": "x"}, "id": "c1"}]
            ),
            AIMessage("Maazrat, ek seller confirm karega."),
        ],
    )
    out = run(model, tools=mocked_tools())
    assert out["toolCalls"] == [{"name": "searchProducts", "ok": False}]
    tool_msgs = [m for m in model.seen[-1] if m.type == "tool"]
    assert "NOT_FOUND" in tool_msgs[0].content and "no such product" in tool_msgs[0].content


@respx.mock
def test_tools_unavailable_hands_off_instead_of_guessing() -> None:
    respx.get(f"{API_URL}/api/v1/agent/tools").mock(return_value=httpx.Response(500))
    out = run(make_model("stock_check", script=[AIMessage("yes!")]), tools=mocked_tools())
    assert out["reply"] is None
    assert out["handoff"]["reason"] == "tools_unavailable"


def test_auth_required() -> None:
    payload = {"conversationId": "c", "message": {"body": "hi"}}
    with TestClient(create_app(model=make_model())) as client:
        assert client.post("/agent/respond", json=payload).status_code == 401
        bad = client.post("/agent/respond", json=payload, headers={"X-Agent-Token": "nope"})
        assert bad.status_code == 401
        bearer = client.post(
            "/agent/respond", json=payload, headers={"Authorization": f"Bearer {TOKEN}"}
        )
        assert bearer.status_code == 200


def test_refuses_when_token_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENT_SERVICE_TOKEN")
    with TestClient(create_app(model=make_model())) as client:
        payload = {"conversationId": "c", "message": {"body": "hi"}}
        assert client.post("/agent/respond", json=payload, headers=HEADERS).status_code == 503
        # an empty supplied token must not match an unset secret
        assert client.post("/agent/respond", json=payload).status_code == 503


def test_non_ai_active_conversation_stays_silent() -> None:
    out = run(make_model(script=[AIMessage("hello")]), conversationState="human_takeover")
    assert out["reply"] is None
    assert out["handoff"]["required"] is False


def test_phone_is_rejected_and_never_in_prompts() -> None:
    model = make_model("greeting", script=[AIMessage("hi!")])
    with TestClient(create_app(model=model)) as client:
        resp = post(client, buyerPhone=PHONE)
        assert resp.status_code == 422
        assert resp.status_code == 422 and not model.seen
        assert post(client).status_code == 200
    for prompt in model.seen:
        assert PHONE not in " ".join(str(m.content) for m in prompt)
        assert "conv-1" not in " ".join(str(m.content) for m in prompt)
