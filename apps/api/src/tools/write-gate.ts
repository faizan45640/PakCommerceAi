import { aiMayReply } from "@pakcommerce/shared/conversations";

/**
 * May the AI run a WRITE tool in a conversation in this state?
 *
 * This is a fast pre-check on a state read moments earlier, so it can be stale:
 * a seller may take over between the read and the write. There are no
 * agent-facing write tools yet. When one is added (S11 draft orders), it MUST
 * call this again inside its own write, as a conditional update/RPC that also
 * requires `state = 'ai_active'` (e.g. `... where id = $1 and state = 'ai_active'`),
 * and treat zero affected rows as "ai_not_allowed".
 */
export function aiMayRunWriteTool(state: Parameters<typeof aiMayReply>[0]): boolean {
  return aiMayReply(state);
}
