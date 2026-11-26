import { NextRequest, NextResponse } from "next/server";
import type { ActiveMatchContext, MatchStatus, TradeType } from "../../../types/index.ts";
import { getDefaultLedgerRepository } from "../../../lib/repositories/ledgerRepository.ts";

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
  const userId = (searchParams.get("userId") ?? "").trim();
  const rawLimit = Number(searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(200, Math.floor(rawLimit)))
    : 40;

  if (!userId) {
    return NextResponse.json(
      { success: false, message: "userId 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const repo = getDefaultLedgerRepository();
    const portfolio = await repo.getPortfolio(userId, {
      autoCreate: true,
      limit,
    });
    return NextResponse.json({
      success: true,
      source: repo.kind,
      cashBalance: portfolio?.cashBalance ?? 0,
      entries: portfolio?.entries ?? [],
    });
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
      { success: false, code: "INVALID_INPUT", message: "유효하지 않은 JSON 요청 본문입니다." },
      { status: 400 }
    );
  }

  const userId = (body.userId ?? "").trim();
  const playerId = (body.playerId ?? "").trim();
  const side = body.side;
  const quantity = body.quantity;
  const matchStatus = body.matchStatus ?? "LIVE";
  const basePrice = body.basePrice;
  const currentPrice = body.currentPrice;

  if (
    !userId ||
    !playerId ||
    (side !== "BUY" && side !== "SELL") ||
    typeof quantity !== "number" ||
    typeof basePrice !== "number" ||
    typeof currentPrice !== "number"
  ) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_INPUT",
        message: "필수 주문 파라미터가 누락되었거나 형식이 올바르지 않습니다.",
      },
      { status: 400 }
    );
  }

  try {
    const repo = getDefaultLedgerRepository();
    const result = await repo.executeOrder({
      userId,
      nickname: body.nickname,
      email: body.email,
      side,
      playerId,
      playerName: body.playerName,
      teamShort: body.teamShort,
      quantity,
      matchStatus,
      basePrice,
      currentPrice,
      lastMajorEventAt: body.lastMajorEventAt,
      matchContext: body.matchContext,
    });

    if (!result.success) {
      const status =
        result.code === "INVALID_INPUT"
          ? 400
          : result.code === "CONFLICT"
          ? 409
          : 422;
      return NextResponse.json(
        {
          ...result,
          source: repo.kind,
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        ...result,
        source: repo.kind,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "주문 체결 처리 중 서버 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
