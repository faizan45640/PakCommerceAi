import { describe, expect, it } from "vitest";

import { slugifyTitle } from "./product-slug.js";

describe("slugifyTitle", () => {
  it("lowercases and hyphenates a title", () => {
    expect(slugifyTitle("Lawn Kurta")).toBe("lawn-kurta");
  });

  it("strips punctuation", () => {
    expect(slugifyTitle("Kurta (Summer) - 2026!")).toBe("kurta-summer-2026");
  });

  it("collapses repeated separators", () => {
    expect(slugifyTitle("Lawn   ---   Kurta")).toBe("lawn-kurta");
  });

  it("trims leading and trailing separators", () => {
    expect(slugifyTitle("  !Kurta!  ")).toBe("kurta");
  });

  it("pads a title too short to make a valid slug", () => {
    // The contract requires at least 3 characters. Rejecting a legitimate title
    // over a field the seller never filled in would be a strange thing to do.
    expect(slugifyTitle("Kg").length).toBeGreaterThanOrEqual(3);
  });

  it("produces something usable when a title has no usable characters", () => {
    expect(slugifyTitle("!!!").length).toBeGreaterThanOrEqual(3);
  });

  it("respects the maximum slug length", () => {
    expect(slugifyTitle("a".repeat(400)).length).toBeLessThanOrEqual(220);
  });
});
