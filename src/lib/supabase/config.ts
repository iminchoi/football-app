export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  nickname: string;
  role: "user" | "admin";
}

export interface SupabaseAuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}

/**
 * Resolve public Supabase URL and anon/publishable key.
 * References `process.env.NEXT_PUBLIC_*` statically when `envOverride` is omitted
 * so Next.js inlines them cleanly into browser bundles.
 */
export function getSupabaseAuthConfig(
  envOverride?: Readonly<Record<string, string | undefined>>
): SupabaseAuthConfig | null {
  const url = (
    envOverride
      ? envOverride.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.trim() ?? "";

  const anonKey = (
    envOverride
      ? envOverride.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        envOverride.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim() ?? "";

  if (!url || !anonKey) return null;
  if (!/^https?:\/\/.+/i.test(url)) return null;
  return { url, anonKey };
}

export function isSupabaseAuthConfigured(
  envOverride?: Readonly<Record<string, string | undefined>>
): boolean {
  return getSupabaseAuthConfig(envOverride) !== null;
}

export function mapSupabaseAuthUser(
  raw: SupabaseAuthUserLike | null | undefined
): AuthenticatedUser | null {
  if (!raw || typeof raw.id !== "string" || !raw.id.trim()) {
    return null;
  }

  const id = raw.id.trim();
  const email =
    typeof raw.email === "string" && raw.email.trim()
      ? raw.email.trim().toLowerCase()
      : `${id.toLowerCase()}@pitchtrade.local`;

  const metaNickname =
    typeof raw.user_metadata?.nickname === "string"
      ? raw.user_metadata.nickname.trim()
      : typeof raw.user_metadata?.name === "string"
      ? raw.user_metadata.name.trim()
      : typeof raw.user_metadata?.full_name === "string"
      ? raw.user_metadata.full_name.trim()
      : "";

  const emailPrefix = email.split("@")[0] || "트레이더";
  const nickname = metaNickname || emailPrefix;

  const appRole = raw.app_metadata?.role;
  const role: "user" | "admin" = appRole === "admin" ? "admin" : "user";

  return { id, email, nickname, role };
}
