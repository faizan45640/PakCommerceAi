import { describe, expect, it, vi } from "vitest";

import type { SellerContext } from "../../../middleware/seller-context.js";
import {
  mutateDatabaseInputSchema,
  mutateDatabaseTool,
} from "./mutate-database.js";

describe("mutateDatabaseInputSchema", () => {
  it("accepts a valid UPDATE statement", () => {
    const result = mutateDatabaseInputSchema.safeParse({
      summary: "Update price of Peshawari Chappal",
      sql: "UPDATE product_variants SET price_amount_minor = 450000 WHERE id = '11111111-1111-4111-8111-111111111111'",
      affectedTable: "product_variants",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid INSERT statement", () => {
    const result = mutateDatabaseInputSchema.safeParse({
      summary: "Insert new variant",
      sql: "INSERT INTO product_variants (product_id, title, price_amount_minor) VALUES ('11111111-1111-4111-8111-111111111111', 'Size 45', 399900)",
      affectedTable: "product_variants",
    });

    expect(result.success).toBe(true);
  });
});

describe("mutateDatabaseTool preflight", () => {
  it("rejects non-mutation statements like SELECT", async () => {
    const fakeAuth = {} as never;
    const tool = mutateDatabaseTool(fakeAuth);

    const result = await tool.execute({
      summary: "Read products",
      sql: "SELECT * FROM products",
      affectedTable: "products",
    });

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/Only UPDATE, INSERT, or DELETE/i);
  });

  it("rejects DDL statements like DROP TABLE", async () => {
    const fakeAuth = {} as never;
    const tool = mutateDatabaseTool(fakeAuth);

    const result = await tool.execute({
      summary: "Drop table",
      sql: "DROP TABLE products",
      affectedTable: "products",
    });

    expect(result.status).toBe("error");
  });

  it("executes valid mutation via auth.db.rpc", async () => {
    const fakeRpc = vi.fn().mockResolvedValue({
      data: { status: "success", rows_affected: 1 },
      error: null,
    });

    const fakeAuth = {
      db: { rpc: fakeRpc },
    } as unknown as SellerContext;

    const tool = mutateDatabaseTool(fakeAuth);
    const result = await tool.execute({
      summary: "Update stock for variant",
      sql: "UPDATE product_variants SET quantity_on_hand = 10 WHERE id = '11111111-1111-4111-8111-111111111111'",
      affectedTable: "product_variants",
    });

    expect(result.status).toBe("success");
    expect(fakeRpc).toHaveBeenCalledWith("run_guarded_mutation", {
      p_sql: "UPDATE product_variants SET quantity_on_hand = 10 WHERE id = '11111111-1111-4111-8111-111111111111'",
    });
  });
});
