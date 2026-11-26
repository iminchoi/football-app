import { NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "../../../../lib/supabase/config.ts";
import { getAuthenticatedUser } from "../../../../lib/supabase/server.ts";
import { getDefaultLedgerRepository } from "../../../../lib/repositories/ledgerRepository.ts";

/**
 * Inspect the server-verified Supabase Auth session and ensure the user exists
 * in the `users` table (`onConflictDoNothing`, initial 100,000 P seed).
 */
export async function GET() {
  const authEnabled = isSupabaseAuthConfigured();
  if (!authEnabled) {
    return NextResponse.json({
      success: true,
      authEnabled: false,
      user: null,
    });
  }

  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json({
        success: true,
        authEnabled: true,
        user: null,
      });
    }

    const ledgerRepo = getDefaultLedgerRepository();
    const dbUser = await ledgerRepo.ensureUser({
      userId: authUser.id,
      email: authUser.email,
      nickname: authUser.nickname,
    });

    return NextResponse.json({
      success: true,
      authEnabled: true,
      source: ledgerRepo.kind,
      user: {
        id: authUser.id,
        email: dbUser.email,
        name: dbUser.nickname,
        role: authUser.role,
        cash: dbUser.cashBalance,
        authProvider: "supabase" as const,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "세션 확인 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, authEnabled: true, user: null, message },
      { status: 500 }
    );
  }
}
