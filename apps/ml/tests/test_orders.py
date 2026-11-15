"""S11 order flow: multi-turn slots, double confirmation, gates (T-083/T-084/T-088)."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx
from app.intents import IntentResult
from app.main import create_app
from app.orders import violates_policy
from app.tools_client import ToolsClient
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from tests.conftest import API_URL, TOKEN, TOOL_SPECS, make_model

HEADERS = {"X-Agent-Token": TOKEN}
PHONE = "+923001234567"


def _spec(name: str, props: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "description": name,
        "permission": "x",
        "owner": "orders",
        "needsApproval": False,
        "inputSchema": {"type": "object", "properties": props or {}},
    }


ORDER_SPECS = [
    *TOOL_SPECS,
    _spec("createOrderDraft", {"items": {"type": "array"}, "customer": {"type": "object"}}),
    _spec("getPendingOrder"),
    _spec("confirmOrder", {"orderId": {"type": "string"}}),
    _spec("cancelOrderDraft", {"orderId": {"type": "string"}, "reason": {"type": "string"}}),
]

ORDER = {
    "orderId": "o1",
    "orderRef": "PC-1001",
    "status": "draft",
    "items": [
        {
            "product": "Black Kurta",
            "variant": "M",
            "quantity": 2,
            "unitPricePkr": 2500,
            "lineTotalPkr": 5000,
        }
    ],
    "subtotalPkr": 5000,
    "shippingFeePkr": 250,
    "totalPkr": 5250,
    "paymentMethod": "cod",
    "city": "Lahore",
    "addressLine": "House 12, Street 4, Gulberg",
}
INVENTORY = {"variants": [{"variantId": "v-m", "label": "M", "stock": 5}]}
CUSTOMER = {"name": "Ali", "city": "Lahore", "addressLine": "House 12, Street 4, Gulberg"}


def call(name: str, args: dict[str, Any], cid: str = "c1") -> AIMessage:
    return AIMessage("", tool_calls=[{"name": name, "args": args, "id": cid}])


def draft_call(**customer: Any) -> AIMessage:
    cust = {**CUSTOMER, **customer}
    return call(
        "createOrderDraft", {"items": [{"variantId": "v-m", "quantity": 2}], "customer": cust}
    )


class Shop:
    """Fake Node: a pending-order 'database' plus recorded tool inputs."""

    def __init__(self, pending: dict[str, Any] | None = None) -> None:
        self.order = pending
        self.inputs: dict[str, list[Any]] = {}
        self.overrides: dict[str, httpx.Response] = {}
        respx.get(f"{API_URL}/api/v1/agent/tools").mock(
            return_value=httpx.Response(200, json={"data": ORDER_SPECS})
        )
        respx.post(url__regex=rf"{API_URL}/api/v1/agent/tools/\w+").mock(side_effect=self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[1]
        body = json.loads(request.content)
        self.inputs.setdefault(name, []).append(body["input"])
        assert body["conversationId"] == "conv-1"
        if name in self.overrides:
            return self.overrides[name]
        if name == "getPendingOrder":
            return self.ok({"order": self.order})
        if name == "searchProducts":
            return self.ok(
                {"products": [{"productId": "p1", "name": "Black Kurta", "price": 2500}]}
            )
        if name == "checkInventory":
            return self.ok(INVENTORY)
        if name == "createOrderDraft":
            self.order = ORDER
            return self.ok(ORDER)
        if name == "confirmOrder":
            self.order = None
            return self.ok({"status": "confirmed", "orderRef": "PC-1001"})
        if name == "cancelOrderDraft":
            self.order = None
            return self.ok({"status": "cancelled"})
        raise AssertionError(name)

    @staticmethod
    def ok(output: Any) -> httpx.Response:
        return httpx.Response(200, json={"ok": True, "output": output})

    @staticmethod
    def fail(code: str, message: str = "nope") -> httpx.Response:
        return httpx.Response(200, json={"ok": False, "error": {"code": code, "message": message}})

    def count(self, name: str) -> int:
        return len(self.inputs.get(name, []))


class Chat:
    """One conversation against the app; the fake classifier is set per turn."""

    def __init__(self, client: TestClient, model) -> None:
        self.client, self.model = client, model

    def say(self, body: str, intent: str, script: list[AIMessage], **extra: Any) -> dict[str, Any]:
        self.model.classification = IntentResult(intent=intent, confidence=0.9, language="roman_ur")
        self.model.script.extend(script)
        payload = {
            "conversationId": "conv-1",
            "conversationState": "ai_active",
            "message": {"body": body},
            **extra,
        }
        resp = self.client.post("/agent/respond", json=payload, headers=HEADERS)
        assert resp.status_code == 200, resp.text
        return resp.json()


@pytest.fixture
def chat():
    model = make_model("other")
    tools = ToolsClient(API_URL, TOKEN, client=httpx.AsyncClient())
    with respx.mock, TestClient(create_app(model=model, tools_client=tools)) as client:
        yield Chat(client, model)


@pytest.fixture
def shop(chat: Chat) -> Shop:
    return Shop()


def types(out: dict[str, Any]) -> list[str]:
    return [e["type"] for e in out["orderEvents"]]


def summary_call(variant: str = "v-m", qty: int = 2, **customer: Any) -> AIMessage:
    cust = {**CUSTOMER, **customer}
    return call(
        "recordOrderSummary",
        {"items": [{"variantId": variant, "quantity": qty}], "customer": cust},
        "s1",
    )


SUMMARY_TEXT = "2 x Black Kurta (M) Rs 2500, Ali, Lahore, House 12 Gulberg. Order place karoon?"


def show_summary(chat: Chat, **kw: Any) -> dict[str, Any]:
    """Details turn: variants seen via checkInventory, then the summary is recorded and shown."""
    return chat.say(
        "medium 2, Ali Lahore House 12 Street 4 Gulberg",
        "order_interest",
        [call("checkInventory", {"productId": "p1"}), summary_call(**kw), AIMessage(SUMMARY_TEXT)],
    )


def test_happy_path_double_confirmation(chat: Chat, shop: Shop) -> None:
    out = chat.say(
        "kala kurta chahiye",
        "product_search",
        [call("searchProducts", {"query": "kurta"}), AIMessage("Black Kurta Rs 2500. Size?")],
    )
    assert out["reply"] == "Black Kurta Rs 2500. Size?"
    out = chat.say(
        "medium, 2 pieces",
        "order_interest",
        [call("checkInventory", {"productId": "p1"}), AIMessage("Theek hai. Naam, city, address?")],
    )
    assert out["handoff"]["required"] is False
    out = chat.say(
        "Ali, Lahore, House 12 Street 4 Gulberg",
        "order_interest",
        [summary_call(), AIMessage(SUMMARY_TEXT)],
    )
    assert out["reply"] == SUMMARY_TEXT and shop.count("createOrderDraft") == 0

    # first yes -> draft; the reply carries ref + totals from tool output, COD allowed
    out = chat.say(
        "haan",
        "order_confirm",
        [
            draft_call(),
            AIMessage(
                "Order PC-1001 ban gaya. Subtotal Rs 5000, shipping Rs 250, total Rs 5250, COD. "
                "Confirm karne ke liye HAAN likhein."
            ),
        ],
    )
    assert out["handoff"]["required"] is False and "PC-1001" in out["reply"]
    assert out["orderEvents"] == [{"type": "draft_created", "orderId": "o1"}]
    assert shop.count("confirmOrder") == 0
    assert shop.inputs["createOrderDraft"][0]["items"] == [{"variantId": "v-m", "quantity": 2}]

    # second, NEW yes -> confirm. Even a misclassified bare "haan" is read in context.
    out = chat.say(
        "haan",
        "other",
        [call("confirmOrder", {"orderId": "o1"}), AIMessage("Shukriya! Order PC-1001 confirm.")],
    )
    assert out["orderEvents"] == [{"type": "confirmed", "orderId": "o1"}]
    assert shop.inputs["confirmOrder"] == [{"orderId": "o1"}]
    assert out["handoff"] == {"required": False, "reason": None}


def test_awaiting_seller_sets_no_extra_handoff(chat: Chat) -> None:
    shop = Shop(ORDER)
    shop.overrides["confirmOrder"] = Shop.ok({"status": "awaiting_seller", "orderRef": "PC-1001"})
    out = chat.say(
        "yes",
        "order_confirm",
        [call("confirmOrder", {"orderId": "o1"}), AIMessage("Seller confirm karega.")],
    )
    assert types(out) == ["awaiting_seller"]
    assert out["handoff"]["required"] is False


def test_pending_order_reaches_prompt_and_classifier(chat: Chat) -> None:
    Shop(ORDER)
    chat.say("haan", "other", [AIMessage("Confirm karoon?")])
    system = next(str(m.content) for m in chat.model.seen[-1] if "ORDER FLOW" in str(m.content))
    assert "PENDING ORDER" in system and "PC-1001" in system and "orderId o1" in system
    classifier_prompt = " ".join(str(m.content) for m in chat.model.seen[0])
    assert "draft order exists" in classifier_prompt


def test_confirm_in_same_turn_as_create_is_blocked(chat: Chat, shop: Shop) -> None:
    show_summary(chat)
    out = chat.say(
        "haan",
        "order_confirm",
        [
            draft_call(),
            call("confirmOrder", {"orderId": "o1"}, "c2"),
            AIMessage("Order PC-1001 ban gaya. HAAN likhein."),
        ],
    )
    assert shop.count("createOrderDraft") == 1 and shop.count("confirmOrder") == 0
    assert types(out) == ["draft_created"]
    assert out["toolCalls"][-1] == {"name": "confirmOrder", "ok": False}


def test_confirm_needs_explicit_yes(chat: Chat) -> None:
    shop = Shop(ORDER)
    out = chat.say(
        "price kitna hai?",
        "product_search",
        [call("confirmOrder", {"orderId": "o1"}), AIMessage("?")],
    )
    assert shop.count("confirmOrder") == 0 and out["orderEvents"] == []


NOT_BARE = [
    "No, make it 2 pieces",
    "nahi address Lahore ka hai",
    "nahi bas itna hi, haan confirm",
    "no problem, confirm kar do",
    "yes place 5 of the red one to Lahore, street 3",
]


@pytest.mark.parametrize("text", NOT_BARE)
def test_non_bare_messages_never_force_or_allow_confirm(chat: Chat, text: str) -> None:
    from app.orders import is_bare_no, is_bare_yes

    assert not is_bare_no(text) and not is_bare_yes(text)
    shop = Shop(ORDER)
    # even a classifier that says confirm and a model that obeys cannot confirm these
    chat.say(text, "order_confirm", [call("confirmOrder", {"orderId": "o1"}), AIMessage("HAAN?")])
    assert shop.count("confirmOrder") == 0


@pytest.mark.parametrize("text", NOT_BARE[:4])
def test_non_bare_no_is_not_forced_to_cancel(chat: Chat, text: str) -> None:
    shop = Shop(ORDER)
    chat.say(text, "other", [call("cancelOrderDraft", {"orderId": "o1"}), AIMessage("k")])
    assert shop.count("cancelOrderDraft") == 0


def test_strict_bare_words() -> None:
    from app.orders import is_bare_no, is_bare_yes

    for ok in ("nahi", "No thanks", "nahi ji", "cancel kar do", "nahi rehne do", "cancel"):
        assert is_bare_no(ok)
    for ok in ("haan", "Yes", "ok confirm", "ji haan", "haan ji", "theek hai"):
        assert is_bare_yes(ok)


def test_node_refuses_confirm_is_handled_gracefully(chat: Chat) -> None:
    shop = Shop(ORDER)
    shop.overrides["confirmOrder"] = Shop.fail("needs_buyer_confirmation", "ask buyer")
    out = chat.say(
        "haan",
        "order_confirm",
        [call("confirmOrder", {"orderId": "o1"}), AIMessage("Kya aap order confirm karte hain?")],
    )
    assert out["reply"] == "Kya aap order confirm karte hain?"
    assert out["orderEvents"] == [] and out["handoff"]["required"] is False
    tool_msgs = [m for m in chat.model.seen[-1] if m.type == "tool"]
    assert "needs_buyer_confirmation" in tool_msgs[0].content


def test_cancel_with_pending_draft(chat: Chat) -> None:
    shop = Shop(ORDER)
    out = chat.say(
        "nahi rehne do",
        "other",  # a bare no with a draft pending is cancel regardless of the classifier
        [call("cancelOrderDraft", {"orderId": "o1"}), AIMessage("Theek hai, order cancel.")],
    )
    assert types(out) == ["cancelled"] and out["orderEvents"][0]["orderId"] == "o1"
    assert shop.inputs["cancelOrderDraft"] == [{"orderId": "o1"}]


def test_cancel_cannot_target_another_order(chat: Chat) -> None:
    shop = Shop(ORDER)
    chat.say(
        "cancel", "order_cancel", [call("cancelOrderDraft", {"orderId": "other"}), AIMessage("k")]
    )
    assert shop.count("cancelOrderDraft") == 0


def test_insufficient_stock_offers_alternatives(chat: Chat, shop: Shop) -> None:
    shop.overrides["createOrderDraft"] = Shop.fail("insufficient_stock", "only 1 left")
    show_summary(chat)
    out = chat.say(
        "haan",
        "order_confirm",
        [
            draft_call(),
            call("checkInventory", {"productId": "p1"}, "c2"),
            AIMessage("Sirf 1 piece bacha hai, ya size L le lein?"),
        ],
    )
    assert out["orderEvents"] == []
    assert [c["ok"] for c in out["toolCalls"]] == [False, True]


def test_draft_exists_uses_pending_order(chat: Chat) -> None:
    shop = Shop(ORDER)
    out = chat.say(
        "order karna hai",
        "order_interest",
        [call("getPendingOrder", {}), AIMessage("Aapka order PC-1001 pehle se hai. HAAN likhein.")],
    )
    assert shop.count("getPendingOrder") == 2  # pre-step + the model's own call
    assert out["handoff"]["required"] is False


def test_unknown_variant_cannot_be_summarized_or_created(chat: Chat, shop: Shop) -> None:
    out = chat.say(
        "haan",
        "order_confirm",
        [summary_call("v-made-up"), draft_call(), AIMessage("Kaunsa size?")],
    )
    assert shop.count("createOrderDraft") == 0 and out["orderEvents"] == []
    assert out["toolCalls"][0] == {"name": "recordOrderSummary", "ok": False}


def test_one_message_with_everything_gives_summary_not_draft(chat: Chat, shop: Shop) -> None:
    out = chat.say(
        "yes place 5 of the red one to Lahore, street 3",
        "order_confirm",
        [
            call("checkInventory", {"productId": "p1"}),
            draft_call(),  # no summary was shown before: refused
            summary_call(qty=5, addressLine="House 3, Street 3, Gulberg"),
            AIMessage("5 x Black Kurta (M), Ali, Lahore. Order place karoon?"),
        ],
    )
    assert shop.count("createOrderDraft") == 0 and out["orderEvents"] == []
    assert [c["ok"] for c in out["toolCalls"]] == [True, False, True]


def test_yes_must_be_bare_to_create(chat: Chat, shop: Shop) -> None:
    show_summary(chat)
    chat.say("haan lekin 3 pieces", "order_confirm", [draft_call(), AIMessage("Theek, 3 pieces?")])
    assert shop.count("createOrderDraft") == 0


def test_summary_expires_after_one_turn(chat: Chat, shop: Shop) -> None:
    show_summary(chat)
    chat.say("kya size L hai?", "stock_check", [AIMessage("Check karta hoon.")])
    chat.say("haan", "order_confirm", [draft_call(), AIMessage("Pehle summary dikhata hoon.")])
    assert shop.count("createOrderDraft") == 0


def test_draft_uses_items_from_the_summary_the_buyer_accepted(chat: Chat, shop: Shop) -> None:
    shop.overrides["checkInventory"] = Shop.ok(
        {"variants": [{"variantId": "v-l", "label": "L", "stock": 5}]}
    )
    chat.say("size L ka stock?", "stock_check", [call("checkInventory", {"productId": "p1"})])
    del shop.overrides["checkInventory"]
    show_summary(chat)  # summary: v-m x 2; v-l was seen earlier too
    wrong = call(
        "createOrderDraft",
        {"items": [{"variantId": "v-l", "quantity": 9}], "customer": CUSTOMER},
    )
    chat.say("haan", "order_confirm", [wrong, AIMessage("Order PC-1001 ban gaya. HAAN likhein.")])
    assert shop.inputs["createOrderDraft"][0]["items"] == [{"variantId": "v-m", "quantity": 2}]


def test_ambiguous_city_asks_once_then_accepts(chat: Chat, shop: Shop) -> None:
    out = chat.say(
        "Ali, Xyzville, House 12 Street 4",
        "order_interest",
        [
            call("checkInventory", {"productId": "p1"}),
            summary_call(city="Xyzville"),
            AIMessage("Ye kaunsa shehar hai? Pakistan ka city naam likhein."),
        ],
    )
    assert out["toolCalls"][-1] == {"name": "recordOrderSummary", "ok": False}
    assert "shehar" in out["reply"]
    # buyer insists: same city, asked once already, so the summary is accepted
    out = chat.say(
        "Xyzville hi hai",
        "order_interest",
        [summary_call(city="Xyzville"), AIMessage("Summary... order place karoon?")],
    )
    assert out["toolCalls"] == [{"name": "recordOrderSummary", "ok": True}]
    chat.say("haan", "order_confirm", [draft_call(city="Xyzville"), AIMessage("ok")])
    assert shop.count("createOrderDraft") == 1


def test_vague_address_asks_for_detail(chat: Chat, shop: Shop) -> None:
    out = chat.say(
        "Ali Lahore Gulberg",
        "order_interest",
        [
            call("checkInventory", {"productId": "p1"}),
            summary_call(addressLine="Gulberg"),
            AIMessage("Ghar number aur gali/street bata dein?"),
        ],
    )
    assert out["toolCalls"][-1]["ok"] is False and out["reply"].startswith("Ghar number")
    chat.say("haan", "order_confirm", [draft_call(), AIMessage("Pehle address?")])
    assert shop.count("createOrderDraft") == 0


def test_quantity_above_limit_is_blocked(chat: Chat, shop: Shop) -> None:
    out = chat.say(
        "25 pieces",
        "order_interest",
        [
            call("checkInventory", {"productId": "p1"}),
            summary_call(qty=21),
            call("requestHuman", {"reason": "bulk"}, "c2"),
            AIMessage("Seller aap se rabta karega."),
        ],
    )
    assert shop.count("createOrderDraft") == 0
    assert out["handoff"] == {"required": True, "reason": "needs_human"}
    assert out["reply"] == "Seller aap se rabta karega."


def test_phone_never_in_prompts_or_tool_inputs(chat: Chat, shop: Shop) -> None:
    show_summary(chat, phone=PHONE)
    chat.say(
        "haan",
        "order_confirm",
        [draft_call(phone=PHONE), AIMessage("Order PC-1001 ban gaya. HAAN likhein.")],
    )
    assert "phone" not in json.dumps(shop.inputs)
    for prompt in chat.model.seen:
        assert PHONE not in " ".join(str(m.content) for m in prompt)
    assert "phone number" in " ".join(str(m.content) for m in chat.model.seen[1]).lower()


@pytest.mark.parametrize(
    "reply",
    [
        "Order PC-1001 ban gaya, free delivery! HAAN likhein.",
        "Order PC-1001 ban gaya. Same day delivery mein aaj hi pohanch jayega, COD. HAAN likhein.",
        "Order PC-1001 ban gaya, next day delivery. COD. HAAN likhein.",
    ],
)
def test_invented_delivery_promises_blocked_with_order_output(
    chat: Chat, shop: Shop, reply: str
) -> None:
    show_summary(chat)
    out = chat.say("haan", "order_confirm", [draft_call(), AIMessage(reply)])
    assert out["reply"] is None
    assert out["handoff"] == {"required": True, "reason": "policy_unavailable"}


def test_guard_allows_only_tool_backed_terms() -> None:
    facts = {"payment": {"cod"}, "fees": {"200"}}
    assert not violates_policy("Total Rs 5200, COD, shipping Rs 200", facts)
    assert not violates_policy("Delivery charges Rs 200 hain, payment method COD", facts)
    assert not violates_policy("Shipping fee: Rs 200", facts)
    assert violates_policy("COD available hai", None)  # no tool output: blocked as before
    assert violates_policy("Delivery charges Rs 150 hain", facts)  # not the tool value
    assert violates_policy("Prepaid payment bhi ho jati hai", facts)  # method not in output
    for bad in (
        "Same day delivery, COD",
        "next day delivery Rs 200",
        "Delivery charges Rs 200, kal tak pohanch jayega",
        "aaj hi mil jayega, COD",
        "parson tak, COD",
        "fast delivery Rs 200",
        "jaldi pohanch jayega, COD",
        "Delivery 2-3 din mein",
        "Free delivery milegi",
        "7 din mein return ho jayega",
        "10% off",
    ):
        assert violates_policy(bad, facts), bad


def test_pending_lookup_failure_blocks_order_actions(chat: Chat, shop: Shop) -> None:
    shop.overrides["getPendingOrder"] = httpx.Response(500)
    show_summary(chat)
    out = chat.say("haan", "order_confirm", [draft_call(), AIMessage("Seller follow up karega.")])
    assert shop.count("createOrderDraft") == 0 and out["orderEvents"] == []
