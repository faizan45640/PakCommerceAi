import { describe, expect, it } from "vitest";

import { customerLookupFor, customerLookupKey, orderCountLabel } from "./conversation-customer-panel-model";

describe("customerLookupFor", () => {
  it("prefers the linked customer id", () => {
    expect(customerLookupFor({ customerId: "c1", buyerPhone: "+923001234567" })).toEqual({ customerId: "c1" });
  });
  it("falls back to the phone", () => {
    expect(customerLookupFor({ customerId: null, buyerPhone: "+923001234567" })).toEqual({
      phone: "+923001234567",
    });
  });
  it("keys differ between id and phone", () => {
    expect(customerLookupKey({ customerId: "c1" })).not.toBe(customerLookupKey({ phone: "c1" }));
  });
});

describe("orderCountLabel", () => {
  it("pluralises and shows completed", () => {
    expect(orderCountLabel(1, 1)).toBe("1 order");
    expect(orderCountLabel(3, 2)).toBe("3 orders (2 completed)");
  });
});
