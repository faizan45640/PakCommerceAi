"""WhatsApp Sales Agent intents (T-077) and the structured-output classifier."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

Intent = Literal[
    "greeting", "product_search", "stock_check", "policy", "order_interest", "handoff", "other"
]
Language = Literal["en", "ur", "roman_ur"]


@dataclass(frozen=True)
class IntentSpec:
    definition: str
    examples: tuple[str, ...]


INTENTS: dict[str, IntentSpec] = {
    "greeting": IntentSpec(
        "Plain hello or small talk with no question about the shop.",
        ("hi", "assalam o alaikum", "salam, koi hai?", "السلام علیکم"),
    ),
    "product_search": IntentSpec(
        "Looking for products, categories, colours, sizes or prices to browse.",
        (
            "lawn ke suits dikhao",
            "black kurta under 3000",
            "کوئی اچھا سا بیگ ہے؟",
            "show me sneakers",
        ),
    ),
    "stock_check": IntentSpec(
        "Asks whether a specific product, size or colour is available right now.",
        ("ye kurta medium mein hai?", "is the red one in stock?", "یہ دستیاب ہے؟"),
    ),
    "policy": IntentSpec(
        "Questions about delivery time or charges, returns/exchange, or payment and COD rules.",
        (
            "Lahore delivery kitne din?",
            "cash on delivery hai?",
            "can I return it?",
            "ڈیلیوری چارجز کتنے ہیں؟",
        ),
    ),
    "order_interest": IntentSpec(
        "Wants to buy or place an order for something.",
        (
            "ye wala mujhe chahiye",
            "I'll take two, how do I order?",
            "order karna hai",
            "مجھے یہ لینا ہے",
        ),
    ),
    "handoff": IntentSpec(
        "Asks for a human, complains, is angry, disputes a payment, or anything risky "
        "(refund fights, legal threats, fraud, wrong or damaged parcel).",
        (
            "kisi insaan se baat karao",
            "I want to talk to the owner",
            "paisay kat gaye par order nahi aaya",
            "تم لوگ فراڈ ہو",
        ),
    ),
    "other": IntentSpec(
        "Anything else that is harmless but not covered above.",
        ("what is the weather", "tum kaun ho?"),
    ),
}


class IntentResult(BaseModel):
    """Classifier output."""

    intent: Intent = Field(description="The single best matching intent.")
    confidence: float = Field(ge=0.0, le=1.0, description="0 to 1; how sure you are.")
    language: Language = Field(
        description="Buyer language: en, ur (Urdu script) or roman_ur (Urdu in Latin letters)."
    )


def classifier_system_prompt() -> str:
    lines = [
        "You classify one WhatsApp message from a buyer to an online shop in Pakistan.",
        "Buyers write English, Urdu script or Roman Urdu, often mixed.",
        "Pick exactly one intent. If the buyer is upset or the topic is risky, choose handoff.",
        "If you are unsure, give a low confidence instead of guessing.",
        "",
        "Intents:",
    ]
    for name, spec in INTENTS.items():
        examples = "; ".join(f'"{e}"' for e in spec.examples)
        lines.append(f"- {name}: {spec.definition} Examples: {examples}")
    return "\n".join(lines)


async def classify(
    model: BaseChatModel, body: str, history: list[dict[str, str]] | None = None
) -> IntentResult:
    recent = (history or [])[-6:]
    context = "\n".join(f"{t['role']}: {t['content']}" for t in recent)
    human = (f"Recent chat:\n{context}\n\n" if context else "") + f"Message to classify:\n{body}"
    messages: list[BaseMessage] = [
        SystemMessage(classifier_system_prompt()),
        HumanMessage(human),
    ]
    result = await model.with_structured_output(IntentResult).ainvoke(messages)
    if isinstance(result, dict):
        result = IntentResult.model_validate(result)
    if not isinstance(result, IntentResult):
        raise ValueError("classifier returned no structured output")
    return result
