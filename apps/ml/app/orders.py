"""Order-flow helpers (T-083/T-084/T-088): pending-order context, server-side gates, policy guard.

The order itself lives in the database (Node). Nothing here is persisted except what the graph
checkpointer keeps for conversation memory.
"""

from __future__ import annotations

import json
import re
from typing import Any

MAX_QUANTITY = 20

# Bare short answers. With a pending draft these decide confirm / cancel deterministically.
_YES = re.compile(
    r"^\s*(?:ji\s+)?(?:haan|han|haa|yes|yeah|yep|ok|okay|confirm|theek hai|thik hai|ji|done|sure"
    r"|kar do|ok confirm|yes confirm|haan confirm|haan kar do|ہاں|جی|جی ہاں)(?:\s+ji)?[\s.!]*$",
    re.IGNORECASE,
)
_NO = re.compile(
    r"^\s*(?:no|nahi|nahin|nope|cancel|mat|rehne|rehnay|نہیں)\b.{0,30}$", re.IGNORECASE
)


def is_bare_yes(text: str) -> bool:
    return bool(_YES.match(text))


def is_bare_no(text: str) -> bool:
    return bool(_NO.match(text))


# --- pending order context ---------------------------------------------------------------


def unwrap_order(output: Any) -> dict[str, Any] | None:
    """getPendingOrder output (JSON string or dict) -> the order dict, or None."""
    if isinstance(output, str):
        try:
            output = json.loads(output)
        except ValueError:
            return None
    if isinstance(output, dict):
        order = output.get("order")
        if isinstance(order, dict) and order.get("orderId"):
            return order
    return None


def _label(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("name", "title", "label", "sku"):
            if value.get(key):
                return str(value[key])
        return ""
    return str(value or "")


def format_pending(order: dict[str, Any] | None, *, known: bool) -> str:
    if not known:
        return (
            "Pending order lookup is unavailable this turn. Do NOT create, confirm or cancel an "
            "order now; tell the buyer a seller will follow up."
        )
    if not order:
        return "No pending order for this buyer."
    items = []
    for it in order.get("items") or []:
        name = _label(it.get("product"))
        variant = _label(it.get("variant"))
        label = f"{name} ({variant})" if variant else name
        items.append(
            f"{it.get('quantity')} x {label} @ Rs {it.get('unitPricePkr')}"
            f" = Rs {it.get('lineTotalPkr')}"
        )
    return (
        f"PENDING ORDER (from the database, authoritative): orderId {order.get('orderId')}, "
        f"ref {order.get('orderRef')}, status {order.get('status')}. "
        f"Items: {'; '.join(items)}. Subtotal Rs {order.get('subtotalPkr')}, shipping fee "
        f"Rs {order.get('shippingFeePkr')}, total Rs {order.get('totalPkr')}, payment "
        f"{order.get('paymentMethod')}. Ship to: {order.get('addressLine')}, {order.get('city')}."
    )


def pending_hint(order: dict[str, Any] | None, *, known: bool) -> str | None:
    if not known:
        return None
    if order and order.get("status") == "draft":
        return "a draft order exists; the buyer was asked for the final HAAN"
    return "no draft order yet"


# --- tool-output helpers -----------------------------------------------------------------


def parse_output(content: Any) -> Any:
    if isinstance(content, str):
        try:
            return json.loads(content)
        except ValueError:
            return None
    return content


def find_values(obj: Any, key: str) -> list[Any]:
    out: list[Any] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                out.append(v)
            out.extend(find_values(v, key))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(find_values(v, key))
    return out


def strip_phone(obj: Any) -> Any:
    """The phone is never passed to tools; Node uses the WhatsApp number."""
    if isinstance(obj, dict):
        return {
            k: strip_phone(v)
            for k, v in obj.items()
            if not re.search(r"phone|whatsapp|mobile|contact", k, re.IGNORECASE)
        }
    if isinstance(obj, list):
        return [strip_phone(v) for v in obj]
    return obj


# --- T-088 city / address sanity ---------------------------------------------------------

PK_CITIES = frozenset(
    """karachi lahore islamabad rawalpindi faisalabad multan peshawar quetta hyderabad sialkot
    gujranwala gujrat bahawalpur sargodha sukkur larkana sheikhupura jhang rahim yar khan
    mardan abbottabad mingora kasur okara dera ghazi khan sahiwal nawabshah mirpur khas
    mirpur azad kashmir muzaffarabad chiniot kamoke hafizabad sadiqabad burewala jacobabad
    shikarpur khanewal hub chaman gwadar turbat kohat bannu swat mansehra haripur attock
    jhelum chakwal wah cantt taxila murree rawalakot gilgit skardu hunza vehari pakpattan
    mandi bahauddin narowal toba tek singh dadu thatta mianwali bhakkar layyah lodhran
    muridke wazirabad daska kotri jamshoro tando adam tando allahyar khairpur umerkot mithi
    ghotki badin nowshera charsadda swabi dera ismail khan lakki marwat tank chitral
    nankana sahib kharian lalamusa gojra samundri khushab bhimber kotli
    """.split()
)


def looks_like_pk_city(city: str) -> bool:
    c = re.sub(r"[^a-z؀-ۿ ]+", " ", city.lower()).strip()
    if not c:
        return False
    if re.search(r"[؀-ۿ]", c):
        return True  # Urdu-script names are not checked against the Latin list
    return any(word in PK_CITIES for word in c.split())


_ADDRESS_HINT = re.compile(
    r"\d|house|ghar|flat|plot|street|\bst\b|gali|road|\brd\b|block|sector|phase|society|colony"
    r"|town|mohalla|muhalla|chowk|market|bazaar|bazar|nagar|apartment|villa|lane|avenue|near"
    r"|opposite|behind|area|محلہ|گلی|سڑک|مکان|بلاک",
    re.IGNORECASE,
)


def address_is_specific(address: str) -> bool:
    text = address.strip()
    return len(text.split()) >= 2 and len(text) >= 10 and bool(_ADDRESS_HINT.search(text))


def norm(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def gate_create_draft(
    args: dict[str, Any],
    *,
    pending_known: bool,
    pending: dict[str, Any] | None,
    intent: str,
    known_variants: set[str],
    asked: set[str],
    new_asked: set[str],
) -> str | None:
    """Return a model-readable refusal, or None when the draft may be created."""
    if not pending_known:
        return "blocked: pending order lookup failed. Tell the buyer a seller will follow up."
    if pending:
        return "blocked: draft_exists. A pending order already exists; use getPendingOrder."
    if intent != "order_confirm":
        return (
            "blocked: the buyer has not said yes to the order summary in this message. Show the "
            "summary and ask for a yes first."
        )
    items = args.get("items") or []
    if not items:
        return "blocked: no items. Ask which product and variant the buyer wants."
    for it in items:
        qty = it.get("quantity")
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 1:
            return "blocked: invalid quantity. Ask the buyer how many."
        if qty > MAX_QUANTITY:
            return f"blocked: quantity above {MAX_QUANTITY}. Call requestHuman for a seller."
        if str(it.get("variantId")) not in known_variants:
            return (
                "blocked: unknown variantId. Call checkInventory for the product and use only a "
                "variantId from its output."
            )
    customer = args.get("customer") or {}
    for field in ("name", "city", "addressLine"):
        if not str(customer.get(field) or "").strip():
            return f"blocked: missing customer {field}. Ask the buyer for it."
    city_key = f"city:{norm(customer['city'])}"
    if not looks_like_pk_city(customer["city"]) and city_key not in asked:
        new_asked.add(city_key)
        return "blocked: ambiguous_city. Ask the buyer to confirm which Pakistani city this is."
    addr_key = f"addr:{norm(customer['addressLine'])}"
    if not address_is_specific(customer["addressLine"]) and addr_key not in asked:
        new_asked.add(addr_key)
        return (
            "blocked: ambiguous_address. Ask for the area and street / house number "
            "(and a nearby landmark)."
        )
    return None


def gate_order_action(
    name: str,
    args: dict[str, Any],
    *,
    pending_known: bool,
    pending: dict[str, Any] | None,
    intent: str,
) -> str | None:
    """confirmOrder / cancelOrderDraft act only on the draft loaded from the DB at turn start."""
    if not pending_known:
        return "blocked: pending order lookup failed. Tell the buyer a seller will follow up."
    if not pending or pending.get("status") != "draft":
        return "blocked: there is no draft order to act on."
    if str(args.get("orderId")) != str(pending.get("orderId")):
        return "blocked: orderId does not match the pending order. Use the orderId given above."
    if name == "confirmOrder" and intent != "order_confirm":
        return (
            "blocked: confirmOrder needs a NEW explicit yes from the buyer in this message "
            "after they saw the order ref and total."
        )
    return None


# --- policy guard ------------------------------------------------------------------------

POLICY_TERMS = re.compile(
    r"deliver|dilivery|shipping|return|refund|exchange|\bcod\b|cash on|payment|discount"
    # "free size" is a product size, not a free-delivery promise.
    r"|% ?off|\bfree\b(?!\s*-?\s*size\b)|\bmuft\b|wapas|wapsi|ڈیلیوری|واپس|مفت|رعایت|ریفنڈ",
    re.IGNORECASE,
)
_PAYMENT_OK = re.compile(r"cash on delivery|\bcod\b|cash on|payment|prepaid", re.IGNORECASE)
_SHIPPING_OK = re.compile(r"shipping fee|shipping|delivery charges|delivery|ڈیلیوری", re.IGNORECASE)
_DELIVERY_TIME = re.compile(
    r"\d+\s*(?:-|to)?\s*\d*\s*(?:working\s+)?(?:days?|din|hours?|ghant[ae])\b", re.IGNORECASE
)


def order_facts(outputs: list[Any]) -> set[str]:
    """Which order terms are backed by this turn's tool output (pending order or tool results)."""
    facts: set[str] = set()
    for out in outputs:
        if find_values(out, "paymentMethod"):
            facts.add("payment")
        if find_values(out, "shippingFeePkr"):
            facts.add("shipping")
    return facts


def violates_policy(text: str, facts: set[str]) -> bool:
    remaining = text
    if "payment" in facts:
        remaining = _PAYMENT_OK.sub(" ", remaining)
    if "shipping" in facts:
        remaining = _SHIPPING_OK.sub(" ", remaining)
        if _DELIVERY_TIME.search(remaining):
            return True  # a delivery-time promise is never in tool output
    return bool(POLICY_TERMS.search(remaining))
