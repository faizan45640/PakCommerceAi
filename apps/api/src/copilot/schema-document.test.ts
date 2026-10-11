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

/**
 * A column definition line: a name followed by a real SQL type. Matching on the
 * type (rather than the name alone) skips constraint/continuation lines such as
 * `generated always as (`, `check (...)`, and `foreign key (...)`, which is what
 * a naive `^\w+` match would wrongly treat as columns.
 */
const COLUMN_DEFINITION =
  /^(\w+)\s+(uuid|text|integer|bigint|smallint|boolean|timestamptz|timestamp|date|jsonb|json|numeric|decimal|serial|real|double precision|public\.\w+)\b/i;

/** Words that open a clause, never a column, even when followed by a type. */
const RESERVED_LEADING = new Set([
  "references",
  "foreign",
  "on",
  "primary",
  "unique",
  "constraint",
  "check",
  "exclude",
  "using",
  "generated",
  "case",
  "when",
  "then",
  "else",
  "end",
  "and",
  "or",
  "not",
]);

function tableColumns(table: string): Set<string> {
  const sql = migrationSql();
  const match = sql.match(
    new RegExp(`create table public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`),
  );

  if (!match) return new Set();

  const columns = new Set<string>();
  for (const line of match[1].split("\n")) {
    const name = line.trim().match(COLUMN_DEFINITION);
    if (name && !RESERVED_LEADING.has(name[1].toLowerCase())) {
      columns.add(name[1]);
    }
  }
  return columns;
}

/** Every table created in the migrations, in any migration file. */
function migrationTables(): Set<string> {
  const tables = new Set<string>();
  for (const match of migrationSql().matchAll(
    /create table(?: if not exists)? public\.(\w+)/gi,
  )) {
    tables.add(match[1]);
  }
  return tables;
}

/**
 * Tables the copilot deliberately does not expose to its SQL tools.
 * `copilot_chats` is the chat transcript itself — conversation data, not
 * seller business data, so the model never needs to write SQL against it.
 */
const NOT_EXPOSED_TABLES = new Set(["copilot_chats"]);

describe("SCHEMA_DOCUMENT", () => {
  it("mentions every queryable table", () => {
    for (const table of QUERYABLE_TABLES) {
      expect(SCHEMA_DOCUMENT).toContain(table);
    }
  });

  it("exposes every migration table, or says why not", () => {
    const tables = migrationTables();
    expect(tables.size).toBeGreaterThanOrEqual(9);

    const queryable = new Set<string>(QUERYABLE_TABLES);
    for (const table of tables) {
      expect(
        queryable.has(table) || NOT_EXPOSED_TABLES.has(table),
        `table "${table}" is neither queryable nor in NOT_EXPOSED_TABLES — the copilot cannot see it`,
      ).toBe(true);
    }
  });

  it("claims only real columns for every queryable table", () => {
    for (const table of QUERYABLE_TABLES) {
      const real = tableColumns(table);
      if (real.size === 0) continue; // views have no `create table` block

      for (const column of real) {
        expect(
          new RegExp(`\\b${column}\\b`).test(SCHEMA_DOCUMENT),
          `schema document is missing column ${table}.${column}`,
        ).toBe(true);
      }
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
