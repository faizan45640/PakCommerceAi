import { describe, expect, it } from "vitest";

import { notesCapMessage, validateNoteDraft } from "./customer-notes";

describe("validateNoteDraft", () => {
  it("rejects blank bodies", () => {
    expect(validateNoteDraft({ kind: "note", body: "   " }).ok).toBe(false);
  });

  it("rejects bodies over 2000 characters", () => {
    expect(validateNoteDraft({ kind: "note", body: "x".repeat(2001) }).ok).toBe(false);
    expect(validateNoteDraft({ kind: "note", body: "x".repeat(2000) }).ok).toBe(true);
  });

  it("trims and keeps the kind", () => {
    expect(validateNoteDraft({ kind: "risk", body: "  Refused COD  " })).toEqual({
      ok: true,
      kind: "risk",
      body: "Refused COD",
    });
  });
});

describe("notesCapMessage", () => {
  it("only speaks when the list is capped", () => {
    expect(notesCapMessage(50, 63)).toBe("Showing 50 of 63 notes");
    expect(notesCapMessage(3, 3)).toBeNull();
  });
});
