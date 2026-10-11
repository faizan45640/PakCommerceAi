import { describe, expect, it } from "vitest";

import { ValidationError } from "./http-errors.js";
import { decodePageCursor, encodePageCursor } from "./page-cursor.js";

describe("page cursor", () => {
  it("starts at page one when there is no cursor", () => {
    expect(decodePageCursor(undefined)).toBe(1);
  });

  it("round-trips a page number", () => {
    expect(decodePageCursor(encodePageCursor(7))).toBe(7);
  });

  it("is opaque - not a readable page number", () => {
    expect(encodePageCursor(2)).not.toMatch(/^\d+$/);
  });

  it("rejects a cursor that is not one of ours", () => {
    expect(() => decodePageCursor("not-a-cursor")).toThrow(ValidationError);
  });

  it("rejects a cursor carrying an impossible page", () => {
    const zero = Buffer.from(JSON.stringify({ page: 0 }), "utf8").toString("base64url");

    expect(() => decodePageCursor(zero)).toThrow(ValidationError);
  });
});
