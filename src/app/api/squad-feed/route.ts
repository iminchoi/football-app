import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "../../../lib/supabase/config.ts";
import { getAuthenticatedUser } from "../../../lib/supabase/server.ts";
import {
  getDefaultSquadFeedRepository,
  type SquadSlotDraftInput,
} from "../../../lib/repositories/squadFeedRepository.ts";
import { handleSquadPostCreate } from "../../../lib/auth/apiAuthService.ts";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const authorId = (searchParams.get("authorId") ?? "").trim() || undefined;
  const rawLimit = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
    : 50;

  try {
    const repo = getDefaultSquadFeedRepository();
    const posts = await repo.listPosts({ authorId, limit });
    return NextResponse.json({
      success: true,
      source: repo.kind,
      posts,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "스쿼드 피드 목록 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

interface CreatePostBody {
  authorId?: string;
  authorName?: string;
  title?: string;
  description?: string;
  formation?: string;
  slots?: SquadSlotDraftInput[];
}

export async function POST(request: NextRequest) {
  let body: CreatePostBody;
  try {
    body = (await request.json()) as CreatePostBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_COUNT",
        message: "유효하지 않은 JSON 요청 본문입니다.",
      },
      { status: 400 }
    );
  }

  try {
    const authConfigured = isSupabaseAuthConfigured();
    const sessionUser = authConfigured ? await getAuthenticatedUser() : null;
    const repo = getDefaultSquadFeedRepository();

    const result = await handleSquadPostCreate({
      auth: { authConfigured, sessionUser },
      repo,
      body,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "스쿼드 피드 발행 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
