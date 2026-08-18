import { describe, expect, it } from "vitest";

import { formatCurrency, getInitials } from "./utils";

describe("getInitials", () => {
  it("initials from a full name", () => {
    expect(getInitials("Talha Rana")).toBe("TR");
  });

  it("initials from a single name", () => {
    expect(getInitials("Faizan")).toBe("F");
  });

  it("initials collapse repeated whitespace", () => {
    expect(getInitials("Monis   Hussain")).toBe("MH");
  });

  it("initials fall back for empty input", () => {
    // Avatars render this directly, so it must never produce an empty string.
    expect(getInitials("")).toBe("?");
  });

  it("initials fall back for whitespace input", () => {
    expect(getInitials("   ")).toBe("?");
  });
});

describe("formatCurrency", () => {
  it("currency formats PKR", () => {
    const result = formatCurrency(1500, { currency: "PKR" });

    expect(result).toContain("1,500");
    expect(result).toMatch(/PKR|₨|Rs/);
  });

  it("currency honours noDecimals", () => {
    expect(formatCurrency(1500, { currency: "PKR", noDecimals: true })).not.toContain(".00");
  });
});
