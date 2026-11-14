import { describe, expect, it } from "vitest";

import {
  toOrder,
  toOrderItem,
  toOrderDetail,
  toOrderListItem,
  toOrderStatusHistory,
  toStockChecks,
  type VariantStockRow,
  type OrderItemRow,
  type OrderRow,
  type OrderStatusHistoryRow,
} from "./order-mapper.js";

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "22222222-2222-4222-8222-222222222222",
    seller_id: "33333333-3333-4333-8333-333333333333",
    status: "draft",
    channel: "manual",
    payment_method: "cod",
    customer_id: "44444444-4444-4444-8444-444444444444",
    customer_name: "Ayesha",
    customer_phone: "+923001234567",
    customer_city: "Lahore",
    customer_email: null,
    customer_address_line: null,
    subtotal_amount_minor: 250000,
    shipping_fee_amount_minor: 0,
    total_amount_minor: 250000,
    currency: "PKR",
    note: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: "2026-11-14T06:00:00.000Z",
    updated_at: "2026-11-14T06:00:00.000Z",
    ...overrides,
  };
}

function itemRow(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    order_id: "11111111-1111-4111-8111-111111111111",
    product_id: "55555555-5555-4555-8555-555555555555",
    variant_id: "66666666-6666-4666-8666-666666666666",
    workspace_id: "22222222-2222-4222-8222-222222222222",
    seller_id: "33333333-3333-4333-8333-333333333333",
    title: "Lawn Kurta",
    variant_title: "Medium",
    sku: "LK-M",
    quantity: 2,
    unit_price_amount_minor: 125000,
    line_total_amount_minor: 250000,
    currency: "PKR",
    created_at: "2026-11-14T06:00:00.000Z",
    updated_at: "2026-11-14T06:00:00.000Z",
    ...overrides,
  };
}

describe("toOrderItem", () => {
  it("maps money into the contract shape", () => {
    expect(toOrderItem(itemRow())).toMatchObject({
      quantity: 2,
      unitPrice: { amountMinor: 125000, currency: "PKR" },
      lineTotal: { amountMinor: 250000, currency: "PKR" },
    });
  });
});

describe("toOrder", () => {
  it("nests the customer snapshot and money fields", () => {
    const order = toOrder(orderRow(), [itemRow()]);

    expect(order.customer).toEqual({
      name: "Ayesha",
      phone: "+923001234567",
      city: "Lahore",
      email: null,
      addressLine: null,
    });
    expect(order.items).toHaveLength(1);
    expect(order.total).toEqual({ amountMinor: 250000, currency: "PKR" });
    expect(order.status).toBe("draft");
    expect(order.confirmedAt).toBeNull();
  });
});

describe("toOrderListItem", () => {
  it("flattens customer fields and carries itemCount", () => {
    expect(toOrderListItem(orderRow(), 3)).toMatchObject({
      customerName: "Ayesha",
      customerPhone: "+923001234567",
      customerCity: "Lahore",
      itemCount: 3,
      total: { amountMinor: 250000, currency: "PKR" },
    });
  });
});

describe("toOrderStatusHistory", () => {
  it("maps the initial draft row", () => {
    const row: OrderStatusHistoryRow = {
      id: "77777777-7777-4777-8777-777777777777",
      order_id: "11111111-1111-4111-8111-111111111111",
      workspace_id: "22222222-2222-4222-8222-222222222222",
      seller_id: "33333333-3333-4333-8333-333333333333",
      from_status: null,
      to_status: "draft",
      performed_by: "33333333-3333-4333-8333-333333333333",
      note: "Draft order created",
      created_at: "2026-11-14T06:00:00.000Z",
    };

    expect(toOrderStatusHistory(row)).toMatchObject({
      fromStatus: null,
      toStatus: "draft",
      note: "Draft order created",
    });
  });
});

describe("toStockChecks", () => {
  const variant = (overrides: Partial<VariantStockRow> = {}): VariantStockRow => ({
    id: "66666666-6666-4666-8666-666666666666",
    track_inventory: true,
    quantity_on_hand: 10,
    reserved_quantity: 0,
    ...overrides,
  });

  it("is sufficient when available (on_hand - reserved) covers the quantity", () => {
    const [check] = toStockChecks([toOrderItem(itemRow())], [variant()]);
    expect(check).toMatchObject({ needed: 2, available: 10, sufficient: true });
  });

  it("subtracts reserved quantity, like the confirm function", () => {
    const [check] = toStockChecks(
      [toOrderItem(itemRow({ quantity: 4 }))],
      [variant({ quantity_on_hand: 5, reserved_quantity: 2 })],
    );
    expect(check).toMatchObject({ needed: 4, available: 3, sufficient: false });
  });

  it("treats exactly-enough stock as sufficient", () => {
    const [check] = toStockChecks(
      [toOrderItem(itemRow({ quantity: 2 }))],
      [variant({ quantity_on_hand: 2 })],
    );
    expect(check?.sufficient).toBe(true);
  });

  it("skips untracked variants (track_inventory false or null on-hand)", () => {
    const item = toOrderItem(itemRow());
    expect(
      toStockChecks([item], [variant({ track_inventory: false })])[0],
    ).toMatchObject({ available: null, sufficient: true });
    expect(
      toStockChecks([item], [variant({ quantity_on_hand: null })])[0],
    ).toMatchObject({ available: null, sufficient: true });
  });

  it("sums quantities per variant across lines", () => {
    const first = toOrderItem(itemRow({ quantity: 3 }));
    const second = toOrderItem(
      itemRow({ id: "99999999-9999-4999-8999-999999999999", quantity: 3 }),
    );
    const checks = toStockChecks(
      [first, second],
      [variant({ quantity_on_hand: 5 })],
    );
    expect(checks).toHaveLength(2);
    expect(checks.every((c) => c.needed === 6 && !c.sufficient)).toBe(true);
  });

  it("flags a variant that cannot be read as insufficient", () => {
    const [check] = toStockChecks([toOrderItem(itemRow())], []);
    expect(check).toMatchObject({ available: 0, sufficient: false });
  });
});

describe("toOrderDetail", () => {
  it("is the order plus history and stock checks", () => {
    const base = toOrder(orderRow(), [itemRow()]);
    const detail = toOrderDetail(base, [], []);
    expect(detail).toEqual({ ...base, statusHistory: [], stockChecks: [] });
  });
});
