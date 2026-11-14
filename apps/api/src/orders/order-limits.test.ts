import { MAX_MONEY_MINOR } from "@pakcommerce/shared";
import { describe, expect, it } from "vitest";

import { ValidationError } from "../lib/http-errors.js";
import { assertDraftAmountsFit } from "./order-limits.js";

function detailsOf(fn: () => void): Record<string, string[]> | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.details as Record<string, string[]>;
    throw error;
  }
  return undefined;
}

describe("assertDraftAmountsFit", () => {
  it("accepts amounts at the limit", () => {
    expect(() => assertDraftAmountsFit([{ unitPriceAmountMinor: MAX_MONEY_MINOR, quantity: 1 }], 0)).not.toThrow();
  });

  it("rejects a line total over the limit with the line's quantity path", () => {
    const details = detailsOf(() =>
      assertDraftAmountsFit(
        [
          { unitPriceAmountMinor: 100, quantity: 1 },
          { unitPriceAmountMinor: 100_000_000, quantity: 100_000 },
        ],
        0,
      ),
    );
    expect(Object.keys(details ?? {})).toEqual(["items.1.quantity"]);
  });

  it("rejects a subtotal over the limit when each line fits", () => {
    const details = detailsOf(() =>
      assertDraftAmountsFit(
        [
          { unitPriceAmountMinor: 1_500_000_000, quantity: 1 },
          { unitPriceAmountMinor: 1_500_000_000, quantity: 1 },
        ],
        0,
      ),
    );
    expect(Object.keys(details ?? {})).toEqual(["total"]);
  });

  it("rejects a total pushed over the limit by shipping", () => {
    const details = detailsOf(() =>
      assertDraftAmountsFit([{ unitPriceAmountMinor: MAX_MONEY_MINOR, quantity: 1 }], 1),
    );
    expect(Object.keys(details ?? {})).toEqual(["total"]);
  });
});
