import { format, isSameDay } from "date-fns";
import type { Message, MessageMedia, MessageSender, MessageStatus } from "@pakcommerce/shared/conversations";

/** The API sends newest first; the thread reads oldest first. */
export function toChronological(newestFirst: Message[]): Message[] {
  return [...newestFirst].reverse();
}

/** Puts a page of older messages (newest first) before the ones already shown, skipping repeats. */
export function prependOlder(current: Message[], olderNewestFirst: Message[]): Message[] {
  const known = new Set(current.map((message) => message.id));
  return [...toChronological(olderNewestFirst).filter((message) => !known.has(message.id)), ...current];
}

export interface MessageDay {
  key: string;
  label: string;
  messages: Message[];
}

/** Groups an oldest-first list by calendar day for the date separators. */
export function groupByDay(messages: Message[], now: Date = new Date()): MessageDay[] {
  const days: MessageDay[] = [];
  let lastDate: Date | null = null;

  for (const message of messages) {
    const date = new Date(message.createdAt);
    if (!lastDate || !isSameDay(lastDate, date)) {
      days.push({ key: format(date, "yyyy-MM-dd"), label: dayLabel(date, now), messages: [] });
    }
    days[days.length - 1].messages.push(message);
    lastDate = date;
  }

  return days;
}

export function dayLabel(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return "Yesterday";
  return format(date, "d MMM yyyy");
}

export function messageTime(iso: string): string {
  return format(new Date(iso), "h:mm a");
}

/** Buyer bubbles sit left, system notes are centred, AI and seller sit right. */
export function bubbleSide(sender: MessageSender): "left" | "right" | "center" {
  if (sender === "buyer") return "left";
  if (sender === "system") return "center";
  return "right";
}

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  received: "Received",
  queued: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed to send",
};

export interface MediaChip {
  label: string;
  /** Only images link out; the provider URL needs credentials, so nothing is fetched here. */
  href?: string;
}

/** Only https links are rendered as links (never javascript:, data: or plain http:). */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function mediaChip(media: MessageMedia): MediaChip {
  const type = media.contentType.toLowerCase();
  if (type.startsWith("audio/")) return { label: "Voice note" };
  if (type.startsWith("image/")) return { label: "Photo", href: isHttpsUrl(media.url) ? media.url : undefined };
  if (type.startsWith("video/")) return { label: "Video" };
  if (type === "application/pdf") return { label: "Document" };
  return { label: "Attachment" };
}
