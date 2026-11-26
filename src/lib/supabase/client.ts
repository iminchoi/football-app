"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAuthConfig } from "./config";

let browserClient: SupabaseClient | null = null;

/**
 * Return a singleton Supabase browser client using `@supabase/ssr` cookie storage.
 * Returns `null` safely when `NEXT_PUBLIC_SUPABASE_URL` / anon key are not configured.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const config = getSupabaseAuthConfig();
  if (!config) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(config.url, config.anonKey);
  }
  return browserClient;
}
