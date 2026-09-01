import { describe, expect, it } from "vitest";

import { buildSearchText } from "./product-search-text.js";

describe("buildSearchText", () => {
  it("includes the title and slug", () => {
    const text = buildSearchText({ title: "Lawn Kurta", slug: "lawn-kurta" });

    expect(text).toContain("lawn");
    expect(text).toContain("kurta");
  });

  it("includes tags, option names and option values", () => {
    const text = buildSearchText({
      title: "Kurta",
      slug: "kurta",
      tags: ["summer", "cotton"],
      options: [{ name: "Size", values: ["Medium", "Large"], position: 0 }],
    });

    expect(text).toContain("summer");
    expect(text).toContain("cotton");
    expect(text).toContain("size");
    expect(text).toContain("medium");
  });

  it("includes variant titles, skus and barcodes", () => {
    const text = buildSearchText({
      title: "Kurta",
      slug: "kurta",
      variants: [{ title: "Medium", sku: "KURTA-M", barcode: "8901234" }],
    });

    expect(text).toContain("kurta-m");
    expect(text).toContain("8901234");
  });

  it("lowercases everything", () => {
    expect(buildSearchText({ title: "LAWN Kurta", slug: "s" })).not.toMatch(/[A-Z]/);
  });

  it("does not repeat a word that appears in several fields", () => {
    const text = buildSearchText({ title: "Kurta", slug: "kurta", tags: ["kurta"] });

    expect(text.split(" ").filter((word) => word === "kurta")).toHaveLength(1);
  });

  it("stays within the contract limit and never ends mid-word", () => {
    const text = buildSearchText({
      title: "Kurta",
      slug: "kurta",
      // Distinct words, so nothing is de-duplicated away before the cap bites.
      tags: Array.from({ length: 900 }, (_, index) => `tag${index}`),
    });

    expect(text.length).toBeLessThanOrEqual(2000);
    // A truncated final token would match nothing, which is worse than dropping it.
    expect(text.endsWith(" ")).toBe(false);
    expect(text.split(" ").at(-1)).toMatch(/^tag\d+$/);
  });

  it("tolerates a product with no optional fields", () => {
    expect(() => buildSearchText({ title: "Kurta", slug: "kurta" })).not.toThrow();
  });
});
