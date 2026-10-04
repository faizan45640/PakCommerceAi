import { describe, expect, it } from "vitest";
import { formatPkr, paisaToPkr, pkrToPaisa } from "./currency";

describe("currency helpers", () => {
  it("formats paisa to formatted PKR string", () => {
    expect(formatPkr(250000)).toBe("Rs. 2,500");
    expect(formatPkr(0)).toBe("Rs. 0");
    expect(formatPkr(1500000)).toBe("Rs. 15,000");
  });

  it("converts PKR to paisa", () => {
    expect(pkrToPaisa(2500)).toBe(250000);
    expect(pkrToPaisa(99.5)).toBe(9950);
  });

  it("converts paisa to PKR", () => {
    expect(paisaToPkr(250000)).toBe(2500);
    expect(paisaToPkr(1500000)).toBe(15000);
  });
});
