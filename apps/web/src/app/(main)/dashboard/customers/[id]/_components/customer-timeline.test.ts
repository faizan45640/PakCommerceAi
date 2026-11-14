import type { CustomerTimelineEvent } from "@pakcommerce/shared";
import { describe, expect, it } from "vitest";

import { formatTimelineEvent } from "./customer-timeline";

const orderId = "a1b2c3d4-0000-4000-8000-000000000000";
const at = "2026-11-14T10:00:00.000Z";

describe("formatTimelineEvent", () => {
  it("describes a status change and links the order", () => {
    const event: CustomerTimelineEvent = {
      type: "order_status_changed",
      orderId,
      fromStatus: "draft",
      toStatus: "confirmed",
      note: null,
      at,
    };
    const item = formatTimelineEvent(event, 0);
    expect(item.title).toBe("Order #A1B2C3D4 Draft → Confirmed");
    expect(item.href).toBe(`/dashboard/orders/${orderId}`);
    expect(item.detail).toBeUndefined();
  });

  it("describes order creation when there is no previous status", () => {
    const item = formatTimelineEvent(
      { type: "order_status_changed", orderId, fromStatus: null, toStatus: "draft", note: "COD", at },
      1,
    );
    expect(item.title).toBe("Order #A1B2C3D4 created as Draft");
    expect(item.detail).toBe("COD");
  });

  it("marks risk notes distinctly", () => {
    const risk = formatTimelineEvent({ type: "note_added", noteId: "n1", kind: "risk", body: "Refused COD", at }, 0);
    const note = formatTimelineEvent({ type: "note_added", noteId: "n2", kind: "note", body: "Prefers calls", at }, 1);
    expect(risk.tone).toBe("risk");
    expect(risk.detail).toBe("Refused COD");
    expect(note.tone).toBe("note");
    expect(note.href).toBeUndefined();
  });
});
