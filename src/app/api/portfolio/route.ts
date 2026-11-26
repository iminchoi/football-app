import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "../../../lib/supabase/config.ts";
import { getAuthenticatedUser } from "../../../lib/supabase/server.ts";
import { getDefaultLedgerRepository } from "../../../lib/repositories/ledgerRepository.ts";
import {
  handlePortfolioGet,
  handlePortfolioPost,
} from "../../../lib/auth/apiAuthService.ts";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedUserId = (searchParams.get("userId") ?? "").trim() || undefined;
  const requestedNickname =
    (searchParams.get("nickname") ?? "").trim() || undefined;
  const requestedEmail = (searchParams.get("email") ?? "").trim() || undefined;
  const rawLimit = Number(searchParams.get("limit") ?? "40");

  try {
    const authConfigured = isSupabaseAuthConfigured();
    const sessionUser = authConfigured ? await getAuthenticatedUser() : null;
    const repo = getDefaultLedgerRepository();

    const result = await handlePortfolioGet({
      auth: { authConfigured, sessionUser },
      repo,
      requestedUserId,
      requestedNickname,
      requestedEmail,
      limit: rawLimit,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "포트폴리오 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

interface PortfolioActionBody {
  action?: "INIT_USER" | "ADMIN_TOPUP" | "RESET";
  userId?: string;
  nickname?: string;
  email?: string;
  amount?: number;
}

export async function POST(request: NextRequest) {
  let body: PortfolioActionBody;
  try {
    body = (await request.json()) as PortfolioActionBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "유효하지 않은 JSON 요청 본문입니다." },
      { status: 400 }
    );
  }

  try {
    const authConfigured = isSupabaseAuthConfigured();
    const sessionUser = authConfigured ? await getAuthenticatedUser() : null;
    const repo = getDefaultLedgerRepository();

    const result = await handlePortfolioPost({
      auth: { authConfigured, sessionUser },
      repo,
      action: body.action,
      requestedUserId: body.userId,
      requestedNickname: body.nickname,
      requestedEmail: body.email,
      amount: body.amount,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "포트폴리오 작업 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
