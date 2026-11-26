import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "../../../../../lib/supabase/config.ts";
import { getAuthenticatedUser } from "../../../../../lib/supabase/server.ts";
import { getDefaultSquadFeedRepository } from "../../../../../lib/repositories/squadFeedRepository.ts";
import { handleSquadCommentCreate } from "../../../../../lib/auth/apiAuthService.ts";

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

  try {
    const authConfigured = isSupabaseAuthConfigured();
    const sessionUser = authConfigured ? await getAuthenticatedUser() : null;
    const repo = getDefaultSquadFeedRepository();

    const result = await handleSquadCommentCreate({
      auth: { authConfigured, sessionUser },
      repo,
      postId,
      body,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "코멘트 등록 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
