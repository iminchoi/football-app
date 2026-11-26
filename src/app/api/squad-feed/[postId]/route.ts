import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "../../../../lib/supabase/config.ts";
import { getAuthenticatedUser } from "../../../../lib/supabase/server.ts";
import { getDefaultSquadFeedRepository } from "../../../../lib/repositories/squadFeedRepository.ts";
import { handleSquadPostDelete } from "../../../../lib/auth/apiAuthService.ts";

async function extractRequestedUserId(
  request: NextRequest
): Promise<string | undefined> {
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
    return (body.userId ?? body.requesterId ?? "").trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  const { postId } = await context.params;
  try {
    const repo = getDefaultSquadFeedRepository();
    const post = await repo.getPostById(postId);
    if (!post) {
      return NextResponse.json(
        {
          success: false,
          code: "NOT_FOUND",
          message: "스쿼드 피드를 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      source: repo.kind,
      post,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "스쿼드 피드 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  const { postId } = await context.params;

  try {
    const authConfigured = isSupabaseAuthConfigured();
    const sessionUser = authConfigured ? await getAuthenticatedUser() : null;
    const requestedUserId = await extractRequestedUserId(request);
    const repo = getDefaultSquadFeedRepository();

    const result = await handleSquadPostDelete({
      auth: { authConfigured, sessionUser },
      repo,
      postId,
      requestedUserId,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "스쿼드 피드 삭제 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
