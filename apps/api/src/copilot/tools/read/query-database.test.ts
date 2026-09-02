import { describe, expect, it } from "vitest";

import {
  queryDatabaseInputSchema,
  queryDatabaseTool,
  type QueryDatabaseResult,
} from "./query-database.js";

/** Narrows a tool result to one branch, failing the test if the status differs. */
function asError(result: QueryDatabaseResult) {
  if (result.status !== "error") throw new Error("expected error result");
  return result;
}

function asSuccess(result: QueryDatabaseResult) {
  if (result.status !== "success") throw new Error("expected success result");
  return result;
}

describe("queryDatabaseInputSchema", () => {
  it("accepts a plain SELECT", () => {
    const result = queryDatabaseInputSchema.safeParse({
      queryDescription: "count products",
      sql: "select count(*) from products",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a WITH ... SELECT", () => {
    const result = queryDatabaseInputSchema.safeParse({
      queryDescription: "variants per product",
      sql: "with counts as (select product_id, count(*) as n from product_variants group by product_id) select * from counts",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing description", () => {
    const result = queryDatabaseInputSchema.safeParse({ sql: "select 1" });

    expect(result.success).toBe(false);
  });

  it("rejects SQL over 4000 characters", () => {
    const result = queryDatabaseInputSchema.safeParse({
      queryDescription: "long",
      sql: `select '${"x".repeat(4001)}'`,
    });

    expect(result.success).toBe(false);
  });
});

describe("queryDatabaseTool preflight", () => {
  function toolResult(sql: string) {
    // The preflight runs before any DB call, so a fake auth context is enough.
    const fakeAuth = {} as never;
    return queryDatabaseTool(fakeAuth).execute({
      queryDescription: "test",
      sql,
    });
  }

  it("rejects an empty query", async () => {
    const result = await toolResult("   ");

    const err = asError(result);
    expect(err.message).toMatch(/Empty query/i);
  });

  it("rejects a non-SELECT statement", async () => {
    const result = await toolResult("delete from products");

    expect(result.status).toBe("error");
  });

  it("rejects statements that only look safe", async () => {
    // The old string check only looked at the first word. Any of these must fail.
    for (const sql of [
      "with x as (delete from products returning *) select * from x",
      "select * from products; delete from products",
      "select * from products where id in (select id from (update products set title = 'x') t)",
    ]) {
      const result = await toolResult(sql);
      expect(result.status).toBe("error");
    }
  });

  it("rejects mutating keywords anywhere in the statement", async () => {
    for (const sql of [
      "select 1 from products -- delete everything",
      "select * from products where title = 'drop'",
      "with x as (select 1) select * from x union all select * from (alter table products add column y int) z",
    ]) {
      const result = await toolResult(sql);
      expect(result.status).toBe("error");
    }
  });

  it("rejects a trailing semicolon", async () => {
    const result = await toolResult("select 1 from products;");

    const err = asError(result);
    expect(err.message).toMatch(/semicolon/i);
  });

  it("returns a structured success result when preflight passes", async () => {
    // Preflight passes, then the fake auth db.rpc returns a canned row set.
    const fakeAuth = {
      db: {
        rpc: async () => ({ data: [{ name: "Lawn Kurta" }], error: null }),
      },
    } as never;

    const result = await queryDatabaseTool(fakeAuth).execute({
      queryDescription: "titles",
      sql: "select title from products",
    });

    const ok = asSuccess(result);
    expect(ok.rowCount).toBe(1);
    expect(ok.rows).toEqual([{ name: "Lawn Kurta" }]);
  });

  it("returns a structured error when the database rejects the query", async () => {
    const fakeAuth = {
      db: {
        rpc: async () => ({ data: null, error: { message: "permission denied" } }),
      },
    } as never;

    const result = await queryDatabaseTool(fakeAuth).execute({
      queryDescription: "titles",
      sql: "select title from products",
    });

    const err = asError(result);
    expect(err.message).toMatch(/database rejected/i);
  });
});
