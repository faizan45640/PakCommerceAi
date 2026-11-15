import type { OrderCreatedVia } from "@/lib/api/orders";

export interface CreatedViaBadge {
  label: string;
  tone: "success" | "neutral";
}

/** Badge for orders the AI or copilot created; manual orders get none. */
export function createdViaBadge(createdVia: OrderCreatedVia | undefined): CreatedViaBadge | null {
  if (createdVia === "whatsapp_ai") return { label: "Placed by AI · WhatsApp", tone: "success" };
  if (createdVia === "copilot") return { label: "Copilot", tone: "neutral" };
  return null;
}

/** Link back to the chat an order came from, or null when it has none. */
export function conversationHref(conversationId: string | null | undefined): string | null {
  return conversationId ? `/dashboard/conversations?c=${encodeURIComponent(conversationId)}` : null;
}
