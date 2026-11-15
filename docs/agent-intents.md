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
| `order_interest` | Wants to buy | "order karna hai" | respond; seller confirms (draft orders are S11) |
| `handoff` | Wants a human, complaint, anger, payment dispute, anything risky | "kisi insaan se baat karao" | handoff, no reply |
| `other` | Harmless, uncovered | "tum kaun ho?" | respond |

## Rules

- Confidence below 0.5 routes to handoff.
- Handoff returns `reply: null`, `handoff.required: true` and a reason
  (`buyer_needs_human`, `low_confidence:<n>`, `policy_unavailable`, `policy_not_covered`,
  `tools_unavailable`, `tool_loop_limit`, `empty_reply`). Node then moves the conversation to `human_takeover`.
- Prices, stock, delivery times and policies are never invented: only tool output or seller policy text.
- Replies are short and in the buyer's language and script (Roman Urdu stays Roman Urdu).
