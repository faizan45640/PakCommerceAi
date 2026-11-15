import { describe, expect, it } from "vitest";

import { minorToRupeesInput, rupeesInputToMinor } from "./agent-settings-model";

describe("delivery charge conversion", () => {
  it("converts rupees to paisa", () => {
    expect(rupeesInputToMinor("200")).toBe(20000);
    expect(rupeesInputToMinor(" 199.5 ")).toBe(19950);
    expect(rupeesInputToMinor("0")).toBe(0);
  });

  it("rejects blank, negative and non-numeric input", () => {
    expect(rupeesInputToMinor("")).toBeNull();
    expect(rupeesInputToMinor("-5")).toBeNull();
    expect(rupeesInputToMinor("abc")).toBeNull();
  });

  it("converts paisa back to the input text", () => {
    expect(minorToRupeesInput(20000)).toBe("200");
    expect(minorToRupeesInput(19950)).toBe("199.5");
  });
});
