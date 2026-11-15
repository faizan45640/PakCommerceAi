import { describe, expect, it } from "vitest";
import type { Message } from "@pakcommerce/shared/conversations";

import {
  bubbleSide,
  dayLabel,
  groupByDay,
  mediaChip,
  prependOlder,
  toChronological,
} from "./conversation-thread-model";

function msg(id: string, createdAt: string): Message {
  return {
    id,
    conversationId: "c1",
    direction: "inbound",
    sender: "buyer",
    body: id,
    media: [],
    status: "received",
    createdAt,
  };
}

describe("thread model", () => {
  const newest = msg("m3", "2026-11-15T10:00:00+05:00");
  const middle = msg("m2", "2026-11-14T10:00:00+05:00");
  const oldest = msg("m1", "2026-11-14T09:00:00+05:00");

  it("reverses newest-first into reading order", () => {
    expect(toChronological([newest, middle, oldest]).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("prepends older pages without repeating messages", () => {
    const shown = toChronological([newest, middle]);
    const merged = prependOlder(shown, [middle, oldest]);
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("groups by calendar day with Today and Yesterday labels", () => {
    const now = new Date(2026, 10, 15, 12);
    const days = groupByDay(
      [msg("a", new Date(2026, 10, 14, 9).toISOString()), msg("b", new Date(2026, 10, 14, 10).toISOString()), msg("c", new Date(2026, 10, 15, 9).toISOString())],
      now,
    );
    expect(days.map((d) => [d.label, d.messages.length])).toEqual([
      ["Yesterday", 2],
      ["Today", 1],
    ]);
    expect(dayLabel(new Date(2026, 9, 1), now)).toBe("1 Oct 2026");
  });

  it("places bubbles by sender", () => {
    expect(bubbleSide("buyer")).toBe("left");
    expect(bubbleSide("ai")).toBe("right");
    expect(bubbleSide("seller")).toBe("right");
    expect(bubbleSide("system")).toBe("center");
  });

  it("describes media without fetching it", () => {
    expect(mediaChip({ url: "https://x/a", contentType: "audio/ogg" })).toEqual({ label: "Voice note" });
    expect(mediaChip({ url: "https://x/i", contentType: "image/jpeg" })).toEqual({
      label: "Photo",
      href: "https://x/i",
    });
    expect(mediaChip({ url: "https://x/d", contentType: "application/zip" }).label).toBe("Attachment");
  });
});
