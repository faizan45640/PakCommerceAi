# WhatsApp agent intents (T-077)

Defined in `apps/ml/app/intents.py`. A structured-output classifier returns
`{intent, confidence, language: en | ur | roman_ur}` for each buyer message.
The agent only replies when the conversation is `ai_active`.

| Intent | Meaning | Examples | Route |
|---|---|---|---|
| `greeting` | Hello / small talk | "assalam o alaikum" | respond |
| `product_search` | Browse products, prices, colours | "lawn ke suits dikhao" | respond + tools |
| `stock_check` | Is a product / size available | "ye kurta medium mein hai?" | respond + tools |
| `policy` | Delivery, returns, payment / COD | "Lahore delivery kitne din?" | seller policy text only, else handoff |
| `order_interest` | Wants to buy, or is giving order details | "order karna hai" | respond + order tools (slot filling) |
| `order_confirm` | Short yes to the order summary or the final HAAN | "haan", "ok confirm" | respond + order tools |
| `order_cancel` | No / cancel while ordering or with a draft pending | "nahi rehne do" | respond + order tools |
| `handoff` | Wants a human, complaint, anger, payment dispute, anything risky | "kisi insaan se baat karao" | handoff, no reply |
| `other` | Harmless, uncovered | "tum kaun ho?" | respond |

## Rules

- Low confidence does not hand off: the agent answers from tools or asks one short clarifying question. Only the `handoff` intent and the policy rules hand off.
- Handoff returns `reply: null`, `handoff.required: true` and a reason
  (`buyer_needs_human`, `policy_unavailable`, `policy_not_covered`,
  `tools_unavailable`, `order_tools_unavailable`, `needs_human`, `tool_loop_limit`, `empty_reply`). Node then moves the conversation to `human_takeover`.
- Prices, stock, delivery times and policies are never invented: only tool output or seller policy text.
- Replies are short and in the buyer's language and script (Roman Urdu stays Roman Urdu).
- Order intents no longer hand off by default (S11).
- Any LLM, timeout or tool error fails closed with reason `agent_error`.
- Buyer text and tool output are treated as data; replies touching delivery, returns, payment or discounts without seller policy text are never sent.

## Order flow (S11: T-083, T-084, T-088)

The AI places orders itself with two buyer confirmations. The order lives in the DB (Node);
the agent's checkpointer only holds conversation memory.

1. Every turn first calls `getPendingOrder` and puts a compact "PENDING ORDER" summary (and a hint
   for the classifier) in the prompt, so "haan" / "nahi rehne do" are read in context. If the
   lookup fails, order actions are blocked for that turn.
2. Slots collected one or two at a time: product + variant (`searchProducts`, `checkInventory`),
   quantity, name, city, full address. The phone is never asked for or sent (Node uses the
   WhatsApp number; any phone-like key in tool args is stripped).
3. Summary (unit prices from tools, no totals) -> buyer yes (`order_confirm`) -> `createOrderDraft`
   -> reply with ref, subtotal, shipping, total, payment method from tool output and ask for HAAN.
4. A NEW yes while a draft is pending -> `confirmOrder`. A bare yes/no with a draft pending is
   forced to `order_confirm` / `order_cancel` in code, whatever the classifier said.
   `confirmed` -> thanks + ref. `awaiting_seller` -> "seller confirm karega" (no extra handoff).
5. No / cancel at any point with a draft -> `cancelOrderDraft`.

Server-side gates (code, not only prompt), refused calls come back to the model as tool errors:

- `createOrderDraft`: needs an `order_confirm` message, no pending draft, every `variantId`
  seen in earlier `searchProducts`/`checkInventory` output (remembered in the checkpointer),
  quantity 1..20 (more: `requestHuman`), name/city/address present.
- T-088 ambiguity: a city not in the Pakistani city list, or an address with no area/street/number,
  is refused once with a clarifying-question instruction; if the buyer repeats the same value it
  is accepted.
- `confirmOrder` / `cancelOrderDraft`: orderId must equal the draft loaded at the start of the
  turn, so a draft created this turn can never be confirmed in the same message. `confirmOrder`
  additionally needs an `order_confirm` intent. Node enforces `needs_buyer_confirmation` too.
- `requestHuman` (local tool): upset buyer, >20 pieces, anything unsafe -> `handoff.reason: needs_human`
  with the holding reply.
- Policy guard: words about payment (COD, payment) and shipping are allowed only when this turn's
  tool output / pending order carries `paymentMethod` / `shippingFeePkr`. "Free", discount, returns
  and delivery-time promises stay blocked.
