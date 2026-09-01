import { describe, expect, it, vi } from "vitest";

import { getSchemaInputSchema, getSchemaTool, SCHEMA_QUERY } from "./get-schema.js";

describe("getSchemaInputSchema", () => {
  it("accepts no argument (all tables)", () => {
    const result = getSchemaInputSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("accepts a known table name", () => {
    const result = getSchemaInputSchema.safeParse({ table: "products" });

    expect(result.success).toBe(true);
  });

  it("rejects a table that is not owned by the project", () => {
    const result = getSchemaInputSchema.safeParse({ table: "auth.users" });

    expect(result.success).toBe(false);
  });

  it("rejects SQL injection via the table name", () => {
    const result = getSchemaInputSchema.safeParse({
      table: "products'; drop table products; --",
    });

    expect(result.success).toBe(false);
  });
});

describe("SCHEMA_QUERY", () => {
  it("scopes to the public schema", () => {
    expect(SCHEMA_QUERY()).toContain("table_schema = 'public'");
  });

  it("filters to one table when given", () => {
    const query = SCHEMA_QUERY("product_variants");

    expect(query).toContain("table_name = 'product_variants'");
  });
});

describe("getSchemaTool", () => {
  it("returns the column rows from the read-only RPC", async () => {
    const fakeAuth = {
      db: {
        rpc: vi.fn(async () => ({
          data: [
            { table_name: "products", column_name: "title", data_type: "text", is_nullable: "NO" },
          ],
          error: null,
        })),
      },
    } as never;

    const result = await getSchemaTool(fakeAuth).execute({ table: "products" });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]).toMatchObject({ table_name: "products", column_name: "title" });
  });

  it("reports a structured error when introspection fails", async () => {
    const fakeAuth = {
      db: {
        rpc: vi.fn(async () => ({ data: null, error: { message: "no permission" } })),
      },
    } as never;

    const result = await getSchemaTool(fakeAuth).execute({});

    expect(result.status).toBe("error");
  });

  it("always runs the fixed introspection query, never model text", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const fakeAuth = { db: { rpc } } as never;

    await getSchemaTool(fakeAuth).execute({ table: "products" });

    // The SQL is a constant in this module - the model cannot inject into it.
    expect(rpc).toHaveBeenCalledWith("run_readonly_query", {
      p_sql: expect.stringContaining("information_schema.columns"),
    });
  });
});
