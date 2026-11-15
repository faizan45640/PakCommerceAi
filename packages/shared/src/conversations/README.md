# Conversation Contract

States for the WhatsApp inbox and the rules for moving between them. The API,
the Python agent and the dashboard all read this one map, so a state change the
contract forbids is refused everywhere.

## States

| State | Meaning | Agent may reply |
|---|---|---|
| `open` | Live, nobody handling it yet (agent off for it) | No |
| `ai_active` | The Sales Agent is answering | **Yes** |
| `waiting_approval` | The agent proposed an action (e.g. a draft order) a seller must approve | No |
| `human_takeover` | A seller is replying | No |
| `closed` | Resolved. A new buyer message reopens it | No |

## Actors

`buyer` (a new inbound message), `ai` (the Sales Agent), `seller` (anyone in the
workspace), `system` (automation such as "agent on by default").

## Allowed transitions

| From | To | Who |
|---|---|---|
| `open` | `ai_active` | seller, system |
| `open` | `human_takeover`, `closed` | seller |
| `ai_active` | `waiting_approval` | ai |
| `ai_active` | `human_takeover` | ai (handoff), seller |
| `ai_active` | `open`, `closed` | seller |
| `waiting_approval` | `ai_active`, `human_takeover`, `closed` | seller |
| `human_takeover` | `ai_active`, `closed` | seller |
| `closed` | `open` | buyer, seller |
| `closed` | `ai_active` | buyer |

Anything not listed is refused, including staying in the same state.

## Safety rules

- The agent can only leave `ai_active`, and only to ask for approval or hand
  off. It never takes a conversation back from a seller, approves its own
  request, reopens or closes.
- Only a seller hands a conversation back to the agent.
- A buyer message only reopens a closed conversation, into `ai_active` when the
  workspace has the agent on (`reopenStateFor(true)`), otherwise `open`.
- `aiMayReply(state)` is the single check before any outbound agent message.
