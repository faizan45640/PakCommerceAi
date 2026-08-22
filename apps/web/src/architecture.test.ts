import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname);

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "node_modules" ? [] : listSourceFiles(full);
    }
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry) ? [full] : [];
  });
}

const RULES: { name: string; pattern: RegExp; hint: string }[] = [
  {
    name: "no-direct-table-access",
    pattern: /(?<!Array)\.from\s*\(/,
    hint: 'Web must not query Supabase tables directly. Add an endpoint to apps/api (e.g. GET /api/v1/...) and fetch it instead.',
  },
  {
    name: "no-direct-rpc",
    pattern: /\.rpc\s*\(/,
    hint: "Web must not call Postgres functions directly. Expose the operation through apps/api.",
  },
  {
    name: "no-service-role-key",
    pattern: /SUPABASE_SERVICE_ROLE_KEY/,
    hint: "The service-role key bypasses RLS and may only be used inside apps/api.",
  },
  {
    name: "no-admin-client-import",
    pattern: /createApiSupabaseAdminClient|createSupabaseAdminService/,
    hint: "The admin Supabase client belongs to apps/api only.",
  },
];

const ALLOWED_PATHS = [/lib[/\\]supabase[/\\]/, /architecture\.test\.ts$/];

describe("web architecture: API-centric boundary", () => {
  it("web source never accesses Supabase data APIs or service credentials", () => {
    const violations: string[] = [];

    for (const file of listSourceFiles(SRC_ROOT)) {
      if (ALLOWED_PATHS.some((re) => re.test(file))) continue;
      const contents = readFileSync(file, "utf8");
      for (const rule of RULES) {
        if (rule.pattern.test(contents)) {
          violations.push(
            `${file} violates "${rule.name}"\n  ${rule.hint}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
