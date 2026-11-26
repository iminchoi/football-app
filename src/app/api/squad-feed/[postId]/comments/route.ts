import { NextRequest, NextResponse } from "next/server";
import { getDefaultSquadFeedRepository } from "../../../../../lib/repositories/squadFeedRepository.ts";

interface AddCommentBody {
  authorId?: string;
  authorName?: string;
  content?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  const { postId } = await context.params;

  let body: AddCommentBody;
  try {
    body = (await request.json()) as AddCommentBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "EMPTY_COMMENT",
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
        message: "로그인 후 코멘트를 작성할 수 있습니다.",
      },
      { status: 401 }
    );
  }

  try {
    const repo = getDefaultSquadFeedRepository();
    const result = await repo.addComment({
      postId,
      authorId,
      authorName: body.authorName,
      content: body.content ?? "",
    });

    if (!result.success) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "AUTH_REQUIRED"
          ? 401
          : 400;
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
        : "코멘트 등록 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
