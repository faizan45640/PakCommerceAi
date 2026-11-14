import type { ProductVariant } from "@pakcommerce/shared";
import { describe, expect, it } from "vitest";

import {
  availableStock,
  buildDraftInput,
  cartReducer,
  type CartLine,
  emptyOrderForm,
  estimateTotals,
  exceedsStock,
  ADDRESS_REQUIRED_MESSAGE,
  mapDetailsToErrors,
  parseQuantity,
  rupeesToMinor,
  validateDraftInput,
} from "./order-form";

const P1 = "00000000-0000-4000-8000-0000000000b1";
const V1 = "00000000-0000-4000-8000-0000000000c1";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: P1,
    variantId: V1,
    productTitle: "Kurta",
    variantTitle: "M",
    sku: "K-M",
    unitPriceMinor: 150000,
    available: 5,
    quantity: 1,
    ...overrides,
  };
}

const W = "00000000-0000-4000-8000-0000000000a1";
const filled = {
  ...emptyOrderForm,
  name: "Ali",
  phone: "03001234567",
  city: "Lahore",
  addressLine: "12 Mall Road",
};

describe("cartReducer", () => {
  it("adds a new line", () => {
    expect(cartReducer([], { type: "add", line: line() })).toHaveLength(1);
  });

  it("merges a duplicate variant by bumping quantity", () => {
    const next = cartReducer([line({ quantity: 2 })], { type: "add", line: line({ quantity: 3 }) });
    expect(next).toHaveLength(1);
    expect(next[0]?.quantity).toBe(5);
  });

  it("keeps different variants separate", () => {
    expect(cartReducer([line()], { type: "add", line: line({ variantId: "v2" }) })).toHaveLength(2);
  });

  it("removes and updates quantity", () => {
    const lines = [line(), line({ variantId: "v2" })];
    expect(cartReducer(lines, { type: "remove", variantId: V1 }).map((l) => l.variantId)).toEqual(["v2"]);
    expect(cartReducer(lines, { type: "setQuantity", variantId: "v2", quantity: 9 })[1]?.quantity).toBe(9);
  });
});

describe("stock", () => {
  const variant = (inventory: Partial<ProductVariant["inventory"]>) =>
    ({
      inventory: {
        trackInventory: true,
        quantityOnHand: 10,
        reservedQuantity: 3,
        lowStockThreshold: null,
        state: "in_stock",
        ...inventory,
      },
    }) as ProductVariant;

  it("is on hand minus reserved", () => {
    expect(availableStock(variant({}))).toBe(7);
  });

  it("is null when untracked", () => {
    expect(availableStock(variant({ trackInventory: false }))).toBeNull();
  });

  it("never goes below zero", () => {
    expect(availableStock(variant({ quantityOnHand: 1, reservedQuantity: 4 }))).toBe(0);
  });

  it("flags quantity above available only for tracked lines", () => {
    expect(exceedsStock(line({ available: 2, quantity: 3 }))).toBe(true);
    expect(exceedsStock(line({ available: 2, quantity: 2 }))).toBe(false);
    expect(exceedsStock(line({ available: null, quantity: 99 }))).toBe(false);
  });
});

describe("rupeesToMinor", () => {
  it("converts rupees to integer paisa", () => {
    expect(rupeesToMinor("250")).toBe(25000);
    expect(rupeesToMinor("99.5")).toBe(9950);
    expect(rupeesToMinor("0.29")).toBe(29);
  });

  it("treats blank as zero and rejects bad input", () => {
    expect(rupeesToMinor("  ")).toBe(0);
    expect(rupeesToMinor("-5")).toBeNull();
    expect(rupeesToMinor("1.234")).toBeNull();
    expect(rupeesToMinor("abc")).toBeNull();
  });
});

describe("parseQuantity", () => {
  it("accepts positive whole numbers", () => {
    expect(parseQuantity("1")).toBe(1);
    expect(parseQuantity(" 12 ")).toBe(12);
  });

  it("rejects blank, zero, negative, fractional and non-numeric text", () => {
    for (const text of ["", "  ", "0", "-3", "1.5", "abc", "1e3"]) {
      expect(parseQuantity(text)).toBeNull();
    }
  });
});

describe("estimateTotals", () => {
  it("sums price x quantity plus shipping", () => {
    const lines = [line({ quantity: 2 }), line({ variantId: "v2", unitPriceMinor: 50000, quantity: 1 })];
    expect(estimateTotals(lines, 20000)).toEqual({
      subtotalMinor: 350000,
      shippingMinor: 20000,
      totalMinor: 370000,
    });
  });
});

describe("buildDraftInput and validation", () => {
  it("sends only ids and quantity per line, with blanks omitted", () => {
    const input = buildDraftInput(W, filled, [line({ quantity: 2 })], 0);
    expect(input.items).toEqual([{ productId: P1, variantId: V1, quantity: 2 }]);
    expect(input.customer.email).toBeUndefined();
    expect(input.customer.addressLine).toBe("12 Mall Road");
    expect(input.note).toBeUndefined();
  });

  it("accepts a complete draft", () => {
    const errors = validateDraftInput(buildDraftInput(W, filled, [line()], 0));
    expect(errors).toEqual({ fields: {}, lines: {}, general: [] });
  });

  it("requires an address line, including when it is only whitespace", () => {
    for (const addressLine of ["", "   "]) {
      const errors = validateDraftInput(buildDraftInput(W, { ...filled, addressLine }, [line()], 0));
      expect(errors.fields["customer.addressLine"]).toBe(ADDRESS_REQUIRED_MESSAGE);
    }
  });

  it("reports field errors from the shared schema", () => {
    const errors = validateDraftInput(
      buildDraftInput(W, { ...filled, phone: "1", email: "nope" }, [line()], 0),
    );
    expect(errors.fields["customer.phone"]).toBeDefined();
    expect(errors.fields["customer.email"]).toBeDefined();
  });

  it("requires at least one line", () => {
    expect(validateDraftInput(buildDraftInput(W, filled, [], 0)).general.length).toBeGreaterThan(0);
  });
});

describe("mapDetailsToErrors", () => {
  it("maps customer fields, line indexes and leftovers", () => {
    const errors = mapDetailsToErrors({
      "customer.phone": ["Too short."],
      "items.1.variantId": ["Variant not found."],
      workspaceId: ["Bad."],
      _: ["Boom."],
    });
    expect(errors.fields["customer.phone"]).toBe("Too short.");
    expect(errors.lines[1]).toBe("Variant not found.");
    expect(errors.general).toEqual(["workspaceId: Bad.", "Boom."]);
  });
});
