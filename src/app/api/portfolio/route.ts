import { NextRequest, NextResponse } from "next/server";
import {
  INITIAL_SEED_CASH,
  getDefaultLedgerRepository,
} from "../../../lib/repositories/ledgerRepository.ts";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();
  const nickname = (searchParams.get("nickname") ?? "").trim() || undefined;
  const email = (searchParams.get("email") ?? "").trim() || undefined;
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
      nickname,
      email,
      autoCreate: true,
      limit,
    });

    if (!portfolio) {
      return NextResponse.json(
        { success: false, message: "포트폴리오 정보를 불러올 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      source: repo.kind,
      ...portfolio,
    });
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

  const userId = (body.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "userId가 필요합니다." },
      { status: 400 }
    );
  }

  const action = body.action ?? "INIT_USER";
  const repo = getDefaultLedgerRepository();

  try {
    if (action === "INIT_USER") {
      const portfolio = await repo.getPortfolio(userId, {
        nickname: body.nickname,
        email: body.email,
        autoCreate: true,
      });
      return NextResponse.json({
        success: true,
        source: repo.kind,
        ...portfolio,
      });
    }

    if (action === "ADMIN_TOPUP") {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { success: false, message: "운영 환경에서는 관리자 충전을 사용할 수 없습니다." },
          { status: 403 }
        );
      }
      const delta =
        typeof body.amount === "number" &&
        Number.isFinite(body.amount) &&
        body.amount > 0
          ? body.amount
          : 1_000_000;
      const user = await repo.adjustCash({
        userId,
        delta,
        nickname: body.nickname,
        email: body.email,
      });
      return NextResponse.json({
        success: true,
        source: repo.kind,
        user,
        cashBalance: user.cashBalance,
      });
    }

    if (action === "RESET") {
      const portfolio = await repo.resetUser({
        userId,
        initialCash: INITIAL_SEED_CASH,
        nickname: body.nickname,
        email: body.email,
      });
      return NextResponse.json({
        success: true,
        source: repo.kind,
        ...portfolio,
      });
    }

    return NextResponse.json(
      { success: false, message: "지원하지 않는 action입니다." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "포트폴리오 작업 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
