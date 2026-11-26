import type {
  ActiveMatchContext,
  MatchStatus,
  TradeType,
} from "../../types/index.ts";
import type { AuthenticatedUser } from "../supabase/config.ts";
import {
  INITIAL_SEED_CASH,
  normalizeLedgerUserId,
  type LedgerRepository,
} from "../repositories/ledgerRepository.ts";
import type {
  SquadFeedRepository,
  SquadSlotDraftInput,
} from "../repositories/squadFeedRepository.ts";

export interface ApiActor {
  id: string;
  email?: string;
  nickname?: string;
  role: "user" | "admin";
  source: "supabase_session" | "fallback";
}

export type ResolveApiActorResult =
  | { ok: true; actor: ApiActor }
  | {
      ok: false;
      status: 400 | 401 | 403;
      code: "AUTH_REQUIRED" | "FORBIDDEN" | "INVALID_INPUT";
      message: string;
    };

export interface AuthRequestContext {
  authConfigured: boolean;
  sessionUser: AuthenticatedUser | null;
}

export interface ApiServiceResponse<T extends Record<string, unknown> = Record<string, unknown>> {
  status: number;
  body: T;
}

/**
 * Resolve the authoritative acting user for an API call:
 * - When Supabase Auth is configured:
 *   - Requires a valid server-verified `sessionUser` (401 otherwise; ignores client `requestedUserId`).
 *   - Rejects any client-supplied `requestedUserId` that targets a different account (403 FORBIDDEN).
 *   - Always binds mutations/reads to `sessionUser.id`.
 * - When Supabase Auth is NOT configured (local/offline/test fallback):
 *   - Uses `requestedUserId` cleanly while preserving downstream ownership checks.
 */
export function resolveApiActorFromContext(params: {
  authConfigured: boolean;
  sessionUser: AuthenticatedUser | null;
  requestedUserId?: string;
  requestedNickname?: string;
  requestedEmail?: string;
  missingFallbackStatus?: 400 | 401;
  missingFallbackMessage?: string;
}): ResolveApiActorResult {
  const cleanRequestedId = (params.requestedUserId ?? "").trim();

  if (params.authConfigured) {
    if (!params.sessionUser) {
      return {
        ok: false,
        status: 401,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      };
    }

    if (
      cleanRequestedId &&
      normalizeLedgerUserId(cleanRequestedId) !==
        normalizeLedgerUserId(params.sessionUser.id)
    ) {
      return {
        ok: false,
        status: 403,
        code: "FORBIDDEN",
        message: "인증된 사용자와 다른 계정으로는 요청할 수 없습니다.",
      };
    }

    return {
      ok: true,
      actor: {
        id: params.sessionUser.id,
        email: params.sessionUser.email,
        nickname: params.sessionUser.nickname,
        role: params.sessionUser.role,
        source: "supabase_session",
      },
    };
  }

  if (!cleanRequestedId) {
    const status = params.missingFallbackStatus ?? 401;
    return {
      ok: false,
      status,
      code: status === 400 ? "INVALID_INPUT" : "AUTH_REQUIRED",
      message:
        params.missingFallbackMessage ?? "로그인이 필요한 서비스입니다.",
    };
  }

  return {
    ok: true,
    actor: {
      id: cleanRequestedId,
      email: params.requestedEmail?.trim() || undefined,
      nickname: params.requestedNickname?.trim() || undefined,
      role:
        normalizeLedgerUserId(cleanRequestedId) === "admin" ? "admin" : "user",
      source: "fallback",
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Portfolio API Service (`GET/POST /api/portfolio`)
// ---------------------------------------------------------------------------

export async function handlePortfolioGet(params: {
  auth: AuthRequestContext;
  repo: LedgerRepository;
  requestedUserId?: string;
  requestedNickname?: string;
  requestedEmail?: string;
  limit?: number;
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.requestedUserId,
    requestedNickname: params.requestedNickname,
    requestedEmail: params.requestedEmail,
    missingFallbackStatus: 400,
    missingFallbackMessage: "userId 파라미터가 필요합니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const limit = Number.isFinite(params.limit)
    ? Math.max(1, Math.min(200, Math.floor(params.limit!)))
    : 40;

  const portfolio = await params.repo.getPortfolio(resolved.actor.id, {
    nickname: resolved.actor.nickname,
    email: resolved.actor.email,
    autoCreate: true,
    limit,
  });

  if (!portfolio) {
    return {
      status: 404,
      body: {
        success: false,
        message: "포트폴리오 정보를 불러올 수 없습니다.",
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      source: params.repo.kind,
      authSource: resolved.actor.source,
      ...portfolio,
    },
  };
}

export async function handlePortfolioPost(params: {
  auth: AuthRequestContext;
  repo: LedgerRepository;
  action?: "INIT_USER" | "ADMIN_TOPUP" | "RESET";
  requestedUserId?: string;
  requestedNickname?: string;
  requestedEmail?: string;
  amount?: number;
  nodeEnv?: string;
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.requestedUserId,
    requestedNickname: params.requestedNickname,
    requestedEmail: params.requestedEmail,
    missingFallbackStatus: 400,
    missingFallbackMessage: "userId가 필요합니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const action = params.action ?? "INIT_USER";
  const envName = params.nodeEnv ?? process.env.NODE_ENV;

  if (action === "INIT_USER") {
    const portfolio = await params.repo.getPortfolio(resolved.actor.id, {
      nickname: resolved.actor.nickname,
      email: resolved.actor.email,
      autoCreate: true,
    });
    return {
      status: 200,
      body: {
        success: true,
        source: params.repo.kind,
        authSource: resolved.actor.source,
        ...portfolio,
      },
    };
  }

  if (action === "ADMIN_TOPUP") {
    if (envName === "production") {
      return {
        status: 403,
        body: {
          success: false,
          code: "FORBIDDEN",
          message: "운영 환경에서는 관리자 충전을 사용할 수 없습니다.",
        },
      };
    }
    if (
      resolved.actor.source === "supabase_session" &&
      resolved.actor.role !== "admin"
    ) {
      return {
        status: 403,
        body: {
          success: false,
          code: "FORBIDDEN",
          message: "관리자 권한이 필요합니다.",
        },
      };
    }
    const delta =
      typeof params.amount === "number" &&
      Number.isFinite(params.amount) &&
      params.amount > 0
        ? params.amount
        : 1_000_000;
    const user = await params.repo.adjustCash({
      userId: resolved.actor.id,
      delta,
      nickname: resolved.actor.nickname,
      email: resolved.actor.email,
    });
    return {
      status: 200,
      body: {
        success: true,
        source: params.repo.kind,
        authSource: resolved.actor.source,
        user,
        cashBalance: user.cashBalance,
      },
    };
  }

  if (action === "RESET") {
    const portfolio = await params.repo.resetUser({
      userId: resolved.actor.id,
      initialCash: INITIAL_SEED_CASH,
      nickname: resolved.actor.nickname,
      email: resolved.actor.email,
    });
    return {
      status: 200,
      body: {
        success: true,
        source: params.repo.kind,
        authSource: resolved.actor.source,
        ...portfolio,
      },
    };
  }

  return {
    status: 400,
    body: {
      success: false,
      message: "지원하지 않는 action입니다.",
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Orders API Service (`GET/POST /api/orders`)
// ---------------------------------------------------------------------------

export async function handleOrdersGet(params: {
  auth: AuthRequestContext;
  repo: LedgerRepository;
  requestedUserId?: string;
  limit?: number;
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.requestedUserId,
    missingFallbackStatus: 400,
    missingFallbackMessage: "userId 파라미터가 필요합니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const limit = Number.isFinite(params.limit)
    ? Math.max(1, Math.min(200, Math.floor(params.limit!)))
    : 40;
  const portfolio = await params.repo.getPortfolio(resolved.actor.id, {
    nickname: resolved.actor.nickname,
    email: resolved.actor.email,
    autoCreate: true,
    limit,
  });

  return {
    status: 200,
    body: {
      success: true,
      source: params.repo.kind,
      authSource: resolved.actor.source,
      cashBalance: portfolio?.cashBalance ?? 0,
      entries: portfolio?.entries ?? [],
    },
  };
}

export async function handleOrdersPost(params: {
  auth: AuthRequestContext;
  repo: LedgerRepository;
  body: {
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
    nowMs?: number;
  };
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.body.userId,
    requestedNickname: params.body.nickname,
    requestedEmail: params.body.email,
    missingFallbackStatus: 400,
    missingFallbackMessage:
      "필수 주문 파라미터가 누락되었거나 형식이 올바르지 않습니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const playerId = (params.body.playerId ?? "").trim();
  const side = params.body.side;
  const quantity = params.body.quantity;
  const matchStatus = params.body.matchStatus ?? "LIVE";
  const basePrice = params.body.basePrice;
  const currentPrice = params.body.currentPrice;

  if (
    !playerId ||
    (side !== "BUY" && side !== "SELL") ||
    typeof quantity !== "number" ||
    typeof basePrice !== "number" ||
    typeof currentPrice !== "number"
  ) {
    return {
      status: 400,
      body: {
        success: false,
        code: "INVALID_INPUT",
        message: "필수 주문 파라미터가 누락되었거나 형식이 올바르지 않습니다.",
      },
    };
  }

  const result = await params.repo.executeOrder({
    userId: resolved.actor.id,
    nickname: resolved.actor.nickname,
    email: resolved.actor.email,
    side,
    playerId,
    playerName: params.body.playerName,
    teamShort: params.body.teamShort,
    quantity,
    matchStatus,
    basePrice,
    currentPrice,
    lastMajorEventAt: params.body.lastMajorEventAt,
    matchContext: params.body.matchContext,
    nowMs: params.body.nowMs,
  });

  if (!result.success) {
    const status =
      result.code === "INVALID_INPUT"
        ? 400
        : result.code === "CONFLICT"
        ? 409
        : 422;
    return {
      status,
      body: {
        ...result,
        source: params.repo.kind,
        authSource: resolved.actor.source,
      },
    };
  }

  return {
    status: 200,
    body: {
      ...result,
      source: params.repo.kind,
      authSource: resolved.actor.source,
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Squad Feed & Comments API Service
// ---------------------------------------------------------------------------

export async function handleSquadPostCreate(params: {
  auth: AuthRequestContext;
  repo: SquadFeedRepository;
  body: {
    authorId?: string;
    authorName?: string;
    title?: string;
    description?: string;
    formation?: string;
    slots?: SquadSlotDraftInput[];
    nowMs?: number;
  };
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.body.authorId,
    requestedNickname: params.body.authorName,
    missingFallbackStatus: 401,
    missingFallbackMessage: "로그인이 필요한 서비스입니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const result = await params.repo.createPost({
    authorId: resolved.actor.id,
    authorName: resolved.actor.nickname ?? resolved.actor.id,
    title: params.body.title ?? "",
    description: params.body.description,
    formation: params.body.formation,
    slots: Array.isArray(params.body.slots) ? params.body.slots : [],
    nowMs: params.body.nowMs,
  });

  if (!result.success) {
    const status = result.code === "AUTH_REQUIRED" ? 401 : 422;
    return {
      status,
      body: {
        ...result,
        source: params.repo.kind,
        authSource: resolved.actor.source,
      },
    };
  }

  return {
    status: 201,
    body: {
      ...result,
      source: params.repo.kind,
      authSource: resolved.actor.source,
    },
  };
}

export async function handleSquadPostDelete(params: {
  auth: AuthRequestContext;
  repo: SquadFeedRepository;
  postId: string;
  requestedUserId?: string;
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.requestedUserId,
    missingFallbackStatus: 401,
    missingFallbackMessage: "로그인이 필요한 서비스입니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const result = await params.repo.deletePost({
    postId: params.postId,
    requesterId: resolved.actor.id,
  });

  if (!result.success) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
        ? 403
        : 400;
    return {
      status,
      body: {
        ...result,
        source: params.repo.kind,
        authSource: resolved.actor.source,
      },
    };
  }

  return {
    status: 200,
    body: {
      ...result,
      source: params.repo.kind,
      authSource: resolved.actor.source,
    },
  };
}

export async function handleSquadCommentCreate(params: {
  auth: AuthRequestContext;
  repo: SquadFeedRepository;
  postId: string;
  body: {
    authorId?: string;
    authorName?: string;
    content?: string;
    nowMs?: number;
  };
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.body.authorId,
    requestedNickname: params.body.authorName,
    missingFallbackStatus: 401,
    missingFallbackMessage: "로그인 후 코멘트를 작성할 수 있습니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const result = await params.repo.addComment({
    postId: params.postId,
    authorId: resolved.actor.id,
    authorName: resolved.actor.nickname ?? resolved.actor.id,
    content: params.body.content ?? "",
    nowMs: params.body.nowMs,
  });

  if (!result.success) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "AUTH_REQUIRED"
        ? 401
        : 400;
    return {
      status,
      body: {
        ...result,
        source: params.repo.kind,
        authSource: resolved.actor.source,
      },
    };
  }

  return {
    status: 201,
    body: {
      ...result,
      source: params.repo.kind,
      authSource: resolved.actor.source,
    },
  };
}

export async function handleSquadCommentDelete(params: {
  auth: AuthRequestContext;
  repo: SquadFeedRepository;
  postId: string;
  commentId: string;
  requestedUserId?: string;
}): Promise<ApiServiceResponse> {
  const resolved = resolveApiActorFromContext({
    authConfigured: params.auth.authConfigured,
    sessionUser: params.auth.sessionUser,
    requestedUserId: params.requestedUserId,
    missingFallbackStatus: 401,
    missingFallbackMessage: "로그인이 필요한 서비스입니다.",
  });

  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: {
        success: false,
        code: resolved.code,
        message: resolved.message,
      },
    };
  }

  const result = await params.repo.deleteComment({
    postId: params.postId,
    commentId: params.commentId,
    requesterId: resolved.actor.id,
  });

  if (!result.success) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
        ? 403
        : 400;
    return {
      status,
      body: {
        ...result,
        source: params.repo.kind,
        authSource: resolved.actor.source,
      },
    };
  }

  return {
    status: 200,
    body: {
      ...result,
      source: params.repo.kind,
      authSource: resolved.actor.source,
    },
  };
}
