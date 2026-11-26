import { NextRequest, NextResponse } from "next/server";
import { getDefaultSquadFeedRepository } from "../../../../../../lib/repositories/squadFeedRepository.ts";

async function extractRequesterId(request: NextRequest): Promise<string> {
  const { searchParams } = new URL(request.url);
  const fromQuery = (
    searchParams.get("userId") ??
    searchParams.get("requesterId") ??
    ""
  ).trim();
  if (fromQuery) return fromQuery;

  const fromHeader = (request.headers.get("x-user-id") ?? "").trim();
  if (fromHeader) return fromHeader;

  try {
    const body = (await request.json()) as {
      userId?: string;
      requesterId?: string;
    };
    return (body.userId ?? body.requesterId ?? "").trim();
  } catch {
    return "";
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ postId: string; commentId: string }> }
) {
  const { postId, commentId } = await context.params;
  const requesterId = await extractRequesterId(request);
  if (!requesterId) {
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
    const result = await repo.deleteComment({
      postId,
      commentId,
      requesterId,
    });

    if (!result.success) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "FORBIDDEN"
          ? 403
          : 400;
      return NextResponse.json(
        {
          ...result,
          source: repo.kind,
        },
        { status }
      );
    }

    return NextResponse.json({
      ...result,
      source: repo.kind,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "코멘트 삭제 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
