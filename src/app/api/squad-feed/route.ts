import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultSquadFeedRepository,
  type SquadSlotDraftInput,
} from "../../../lib/repositories/squadFeedRepository.ts";

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

  const authorId = (body.authorId ?? "").trim();
  if (!authorId) {
    return NextResponse.json(
      {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      },
      { status: 401 }
    );
  }

  try {
    const repo = getDefaultSquadFeedRepository();
    const result = await repo.createPost({
      authorId,
      authorName: body.authorName,
      title: body.title ?? "",
      description: body.description,
      formation: body.formation,
      slots: Array.isArray(body.slots) ? body.slots : [],
    });

    if (!result.success) {
      const status = result.code === "AUTH_REQUIRED" ? 401 : 422;
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
      { status: 201 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "스쿼드 피드 발행 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
