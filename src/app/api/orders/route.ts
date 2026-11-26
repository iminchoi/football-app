import { NextRequest, NextResponse } from "next/server";
import type {
  ActiveMatchContext,
  MatchStatus,
  TradeType,
} from "../../../types/index.ts";
import { isSupabaseAuthConfigured } from "../../../lib/supabase/config.ts";
import { getAuthenticatedUser } from "../../../lib/supabase/server.ts";
import { getDefaultLedgerRepository } from "../../../lib/repositories/ledgerRepository.ts";
import {
  handleOrdersGet,
  handleOrdersPost,
} from "../../../lib/auth/apiAuthService.ts";

interface OrderRequestBody {
  userId?: string;
  nickname?: string;
  email?: string;
  side?: TradeType;
  playerId?: string;
  playerName?: string;
  teamShort?: string;
  quantity?: number;
  matchStatus?: MatchStatus;
  basePrice?: number;
  currentPrice?: number;
  lastMajorEventAt?: number;
  matchContext?: ActiveMatchContext | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedUserId = (searchParams.get("userId") ?? "").trim() || undefined;
  const rawLimit = Number(searchParams.get("limit") ?? "40");

  try {
    const authConfigured = isSupabaseAuthConfigured();
    const sessionUser = authConfigured ? await getAuthenticatedUser() : null;
    const repo = getDefaultLedgerRepository();

    const result = await handleOrdersGet({
      auth: { authConfigured, sessionUser },
      repo,
      requestedUserId,
      limit: rawLimit,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "체결 원장 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: OrderRequestBody;
  try {
    body = (await request.json()) as OrderRequestBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_INPUT",
        message: "유효하지 않은 JSON 요청 본문입니다.",
      },
      { status: 400 }
    );
  }

  try {
    const authConfigured = isSupabaseAuthConfigured();
    const sessionUser = authConfigured ? await getAuthenticatedUser() : null;
    const repo = getDefaultLedgerRepository();

    const result = await handleOrdersPost({
      auth: { authConfigured, sessionUser },
      repo,
      body,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "주문 체결 처리 중 서버 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
