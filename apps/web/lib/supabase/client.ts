"use client";

import type { Database } from "@pakcommerce/integrations/supabase";
import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseBrowserEnv } from "./env";

export function createClient() {
  const { publishableKey, url } = getSupabaseBrowserEnv();

  return createBrowserClient<Database>(url, publishableKey);
}
