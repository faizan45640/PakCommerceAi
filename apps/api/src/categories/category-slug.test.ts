import { describe, expect, it } from "vitest";
import { slugifyCategory } from "./category-slug.js";

describe("slugifyCategory", () => {
  it("lowercases and hyphenates category name", () => {
    expect(slugifyCategory("Apparel & Clothing")).toBe("apparel-clothing");
  });

  it("handles subcategories with slashes and special characters", () => {
    expect(slugifyCategory("Men's / Peshawari Chappal")).toBe("men-s-peshawari-chappal");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyCategory("  --- Footwear ---  ")).toBe("footwear");
  });

  it("respects max length", () => {
    const longName = "a".repeat(200);
    expect(slugifyCategory(longName).length).toBeLessThanOrEqual(150);
  });
});
