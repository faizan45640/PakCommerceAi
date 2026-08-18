import { describe, expect, it, vi } from "vitest";

// The registry pulls in next/font/google, which only resolves inside the Next
// build pipeline. Font choice is irrelevant to preference parsing, so the
// boundary is mocked rather than the test skipped.
vi.mock("@/lib/fonts/registry", () => ({
  fontKeys: ["geist", "inter"],
}));

const { PREFERENCE_DEFAULTS, PREFERENCE_KEYS, parsePreference } = await import(
  "./preferences-config"
);

describe("parsePreference", () => {
  it("parses a known preference value", () => {
    expect(parsePreference("theme_mode", "dark")).toBe("dark");
  });

  it("falls back to default for unknown value", () => {
    // Preferences arrive from cookies, which a user can edit by hand.
    expect(parsePreference("theme_mode", "neon")).toBe("light");
  });

  it("falls back to default for undefined", () => {
    expect(parsePreference("sidebar_variant", undefined)).toBe("sidebar");
  });
});

describe("PREFERENCE_DEFAULTS", () => {
  it("defaults expose every registered key", () => {
    // The root layout spreads these onto <html>. A key present in the registry
    // but missing here would silently drop an attribute during SSR.
    expect(Object.keys(PREFERENCE_DEFAULTS).sort()).toEqual([...PREFERENCE_KEYS].sort());
  });
});
