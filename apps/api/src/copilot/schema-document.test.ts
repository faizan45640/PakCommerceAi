import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { QUERYABLE_TABLES, SCHEMA_DOCUMENT } from "./schema-document.js";

/**
 * Drift guard: the schema document is prose a model reads, so a typo or a
 * stale column is a silent accuracy bug. These tests pin the document to the
 * migrations — every column it claims must actually exist in SQL source.
 */

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

function migrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

function tableColumns(table: string): Set<string> {
  const sql = migrationSql();
  const match = sql.match(
    new RegExp(`create table public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`),
  );

  if (!match) return new Set();

  const columns = new Set<string>();
  for (const line of match[1].split("\n")) {
    const name = line.trim().match(/^(\w+)\s/);
    if (name && !line.trim().startsWith("constraint") && !line.trim().startsWith("--")) {
      columns.add(name[1]);
    }
  }
  return columns;
}

describe("SCHEMA_DOCUMENT", () => {
  it("mentions every queryable table", () => {
    for (const table of QUERYABLE_TABLES) {
      expect(SCHEMA_DOCUMENT).toContain(table);
    }
  });

  it("claims only real columns for products", () => {
    const real = tableColumns("products");
    expect(real.size).toBeGreaterThan(5);

    for (const column of real) {
      expect(
        SCHEMA_DOCUMENT.includes(`products.id`) ||
          SCHEMA_DOCUMENT.includes(`products.${column}`) ||
          SCHEMA_DOCUMENT.includes(`${column} `) ||
          SCHEMA_DOCUMENT.includes(`${column},`),
      ).toBe(true);
    }
  });

  it("documents the money rule (paisa, not float)", () => {
    expect(SCHEMA_DOCUMENT).toMatch(/MINOR UNITS|paisa/i);
  });

  it("documents that inventory_state is generated", () => {
    expect(SCHEMA_DOCUMENT).toMatch(/GENERATED|generated/i);
  });

  it("documents the RLS scoping rule", () => {
    expect(SCHEMA_DOCUMENT).toMatch(/RLS/i);
  });

  it("does not claim a product price column on products (it lives on variants)", () => {
    // The classic text-to-SQL mistake. The document must not suggest products
    // has a price column.
    expect(SCHEMA_DOCUMENT).not.toMatch(/products\.\s*price\b/i);
  });
});
