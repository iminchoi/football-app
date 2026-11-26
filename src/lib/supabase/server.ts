import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  getSupabaseAuthConfig,
  mapSupabaseAuthUser,
  type AuthenticatedUser,
} from "./config.ts";

/**
 * Create a request-scoped Supabase SSR client for Server Components and Route Handlers.
 * Returns `null` without errors when Supabase Auth env vars are not configured.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const config = getSupabaseAuthConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot mutate cookies directly; middleware handles refresh.
        }
      },
    },
  });
}

/**
 * Verify and return the authenticated Supabase user from the request cookie session.
 * Always calls `supabase.auth.getUser()` (server-verified) rather than trusting `getSession()`.
 * Returns `null` when unauthenticated or when Supabase Auth is not configured.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return mapSupabaseAuthUser(data.user);
  } catch {
    return null;
  }
}

export type { AuthenticatedUser };
