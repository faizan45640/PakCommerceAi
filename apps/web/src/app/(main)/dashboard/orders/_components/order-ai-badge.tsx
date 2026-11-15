import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/status-badge";
import type { OrderAiFields } from "@/lib/api/orders";

import { conversationHref, createdViaBadge } from "./order-ai-model";

/** "Placed by AI · WhatsApp" / "Copilot" badge; nothing for manual orders. */
export function OrderCreatedViaBadge({ createdVia }: { createdVia?: OrderAiFields["createdVia"] }) {
  const badge = createdViaBadge(createdVia);
  if (!badge) return null;
  return <StatusBadge label={badge.label} tone={badge.tone} className="normal-case" />;
}

/** "View conversation" link for orders created from a chat. */
export function OrderConversationLink({ conversationId }: { conversationId?: string | null }) {
  const href = conversationHref(conversationId);
  if (!href) return null;
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-primary text-xs hover:underline">
      <MessageSquare className="size-3" />
      View conversation
    </Link>
  );
}
