import type { OrderDetail } from "@pakcommerce/shared";
import { describe, expect, it } from "vitest";

import { canOfferTransition, confirmBlockers } from "./order-actions";

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    status: "draft",
    customer: { name: "A", phone: "+923001112233", city: "Lahore", addressLine: "House 1" },
    stockChecks: [
      {
        variantId: "v",
        productId: "p",
        title: "Kurta",
        variantTitle: null,
        needed: 2,
        available: 5,
        sufficient: true,
      },
    ],
    ...overrides,
  } as OrderDetail;
}

describe("canOfferTransition", () => {
  it("offers confirm and cancel on drafts only", () => {
    expect(canOfferTransition(detail(), "confirmed")).toBe(true);
    expect(canOfferTransition(detail(), "cancelled")).toBe(true);
    expect(canOfferTransition(detail(), "shipped")).toBe(false);
    expect(canOfferTransition(detail({ status: "confirmed" }), "cancelled")).toBe(false);
  });
});

describe("confirmBlockers", () => {
  it("is empty when address and stock are fine", () => {
    expect(confirmBlockers(detail())).toEqual([]);
  });

  it("flags a missing or blank address", () => {
    const customer = { name: "A", phone: "+923001112233", city: "Lahore", addressLine: "  " };
    expect(confirmBlockers(detail({ customer }))).toHaveLength(1);
  });

  it("flags insufficient stock but not untracked lines", () => {
    const base = detail().stockChecks[0]!;
    expect(
      confirmBlockers(detail({ stockChecks: [{ ...base, available: 1, sufficient: false }] })),
    ).toHaveLength(1);
    expect(
      confirmBlockers(detail({ stockChecks: [{ ...base, available: null, sufficient: true }] })),
    ).toEqual([]);
  });
});
