import type { Message } from "@pakcommerce/shared/conversations";

export const SIMULATOR_DEFAULT_PHONE = "+923001234567";
export const SIMULATOR_DEFAULT_NAME = "Test Buyer";
export const SIMULATOR_POLL_INTERVAL_MS = 2_000;
export const SIMULATOR_POLL_WINDOW_MS = 60_000;

export interface SimulatorForm {
  phone: string;
  name: string;
  message: string;
}

/** Why the form cannot be sent, or null when it can. */
export function validateSimulatorForm(form: SimulatorForm): string | null {
  const digits = form.phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "Enter a phone number, for example +923001234567.";
  if (!form.message.trim()) return "Type a message to send.";
  return null;
}

/** Body for `POST /conversations/mock-inbound`. `aiEnabled` is left out so the workspace setting applies. */
export function buildMockInboundPayload(workspaceId: string, form: SimulatorForm) {
  const digits = form.phone.replace(/\D/g, "");
  const name = form.name.trim();
  return {
    workspaceId,
    From: `whatsapp:+${digits}`,
    ...(name ? { ProfileName: name } : {}),
    Body: form.message.trim(),
  };
}

/** True when an AI message sits newer than the simulated inbound message (list is newest first). */
export function aiReplyArrived(newestFirst: Pick<Message, "id" | "sender">[], inboundMessageId: string): boolean {
  for (const message of newestFirst) {
    if (message.id === inboundMessageId) return false;
    if (message.sender === "ai") return true;
  }
  return false;
}

/** Why the AI will not reply after a simulated message, or null when it will. */
export function stateHint(state: string): string | null {
  switch (state) {
    case "ai_active":
      return null;
    case "human_takeover":
      return "You're handling this conversation, so the AI won't reply.";
    case "waiting_approval":
      return "This conversation is waiting for your approval, so the AI won't reply.";
    case "closed":
      return "This conversation is closed, so the AI won't reply.";
    default:
      return "AI replies are off for this workspace — turn them on in Agent Settings.";
  }
}

/** Polling ends on an AI reply, when the AI no longer holds the conversation, or at the time limit. */
export function shouldStopPolling(input: { aiReplied: boolean; state: string; elapsedMs: number }): boolean {
  return input.aiReplied || input.state !== "ai_active" || input.elapsedMs >= SIMULATOR_POLL_WINDOW_MS;
}
