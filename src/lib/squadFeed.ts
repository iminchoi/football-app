import {
  getPositionLine,
  normalizeDetailedPosition,
  type Holding,
  type PersistedPlayerPrice,
  type Player,
  type PointTransaction,
  type Position,
  type SquadFeedComment,
  type SquadFeedPlayerSnapshot,
  type SquadFeedPost,
  type SquadSaleBadgeStatus,
  type StoredUserAccount,
  type UserSession,
} from "../types/index.ts";
import { resolveHoldingPlayer } from "./playerQuote.ts";
import { roundToTen } from "./priceEngine.ts";

export const REQUIRED_SQUAD_SIZE = 11;
export const MAX_SQUAD_TITLE_LENGTH = 40;
export const MAX_SQUAD_DESCRIPTION_LENGTH = 200;
export const MAX_SQUAD_COMMENT_LENGTH = 300;

export const SQUAD_FORMATIONS = [
  "4-3-3",
  "4-2-3-1",
  "4-4-2",
  "3-5-2",
  "3-4-3",
] as const;

export type SquadFormationOption = (typeof SQUAD_FORMATIONS)[number];

export type SquadValidationErrorCode =
  | "AUTH_REQUIRED"
  | "EMPTY_TITLE"
  | "DUPLICATE_PLAYER"
  | "NOT_OWNED"
  | "INVALID_COUNT"
  | "MISSING_GK";

export type SquadDraftValidationResult =
  | {
      valid: true;
      title: string;
      description: string;
      formation: string;
      snapshots: SquadFeedPlayerSnapshot[];
      gkCount: number;
    }
  | {
      valid: false;
      code: SquadValidationErrorCode;
      message: string;
    };

export interface SquadPublishResult {
  success: boolean;
  message: string;
  code?: SquadValidationErrorCode;
  feed?: SquadFeedPost;
  feeds: SquadFeedPost[];
}

export interface SquadMutationResult {
  success: boolean;
  message: string;
  feeds: SquadFeedPost[];
}

export interface SquadCommentMutationResult {
  success: boolean;
  message: string;
  comment?: SquadFeedComment;
  feeds: SquadFeedPost[];
}

export interface SquadPlayerSaleStatus {
  playerId: string;
  status: SquadSaleBadgeStatus;
  label: "보유 중" | "일부 매도" | "전량 매도";
  publishedQuantity: number;
  currentQuantity: number;
  soldQuantity: number;
}

export interface SquadFeedSaleSummary {
  status: SquadSaleBadgeStatus;
  label: "전원 보유 중" | "일부 매도" | "전량 매도";
  holdingCount: number;
  partialSoldCount: number;
  fullySoldCount: number;
  byPlayerId: Record<string, SquadPlayerSaleStatus>;
}

function normalizeUserKey(id?: string | null): string {
  return (id ?? "").trim().toLowerCase();
}

function getLineSortOrder(pos: Position): number {
  const det = normalizeDetailedPosition(pos);
  const line = getPositionLine(det);
  if (line === "FW") return 0;
  if (det === "LAM" || det === "CAM" || det === "RAM") return 1;
  if (line === "MF") return 2;
  if (line === "DF") return 3;
  return 4; // GK
}

function normalizeFormationChoice(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (
    SQUAD_FORMATIONS.some((f) => f === trimmed)
  ) {
    return trimmed;
  }
  return "4-3-3";
}

/**
 * Validate an 11-player squad draft strictly against the user's real holdings:
 * - Non-empty title
 * - Zero duplicate player IDs
 * - Every selected player currently owned (`holdings[id].quantity > 0`)
 * - Exactly 11 distinct players
 * - At least 1 Goalkeeper (`GK`)
 */
export function validateSquadDraft(params: {
  title: string;
  description?: string;
  formation?: string;
  selectedPlayerIds: readonly string[];
  holdings: Readonly<Record<string, Holding>>;
  players: readonly Player[];
  transactions?: readonly PointTransaction[];
  playerPrices?: Readonly<Record<string, PersistedPlayerPrice>>;
}): SquadDraftValidationResult {
  const title = params.title.trim().slice(0, MAX_SQUAD_TITLE_LENGTH);
  if (!title) {
    return {
      valid: false,
      code: "EMPTY_TITLE",
      message: "스쿼드 제목을 입력해주세요.",
    };
  }

  const rawIds = params.selectedPlayerIds
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  const uniqueIds = new Set(rawIds);
  if (uniqueIds.size !== rawIds.length) {
    return {
      valid: false,
      code: "DUPLICATE_PLAYER",
      message: "동일한 선수는 중복으로 선택할 수 없습니다.",
    };
  }

  for (const playerId of rawIds) {
    const h = params.holdings[playerId];
    if (!h || h.quantity <= 0) {
      return {
        valid: false,
        code: "NOT_OWNED",
        message: "실제 보유 중인 선수(1주 이상)만 스쿼드에 포함할 수 있습니다.",
      };
    }
  }

  if (rawIds.length !== REQUIRED_SQUAD_SIZE) {
    return {
      valid: false,
      code: "INVALID_COUNT",
      message: `서로 다른 보유 선수 11명을 선택해야 발행할 수 있습니다. (현재 ${rawIds.length}/${REQUIRED_SQUAD_SIZE}명)`,
    };
  }

  const transactions = params.transactions ?? [];
  const playerPrices = params.playerPrices ?? {};

  const snapshots: SquadFeedPlayerSnapshot[] = rawIds.map((playerId) => {
    const h = params.holdings[playerId];
    const resolved = resolveHoldingPlayer(
      h,
      params.players,
      transactions,
      playerPrices
    );
    const pos = normalizeDetailedPosition(resolved.position);
    return {
      playerId,
      name: resolved.name,
      englishName: resolved.englishName,
      teamName: resolved.teamName,
      teamShort: resolved.teamShort,
      teamColor: resolved.teamColor,
      position: pos,
      backNumber: resolved.backNumber,
      publishedQuantity: h.quantity,
      publishedPrice: roundToTen(
        resolved.currentPrice ?? resolved.basePrice ?? h.avgBuyPrice
      ),
      avgBuyPrice: roundToTen(h.avgBuyPrice),
    };
  });

  const gkCount = snapshots.filter(
    (p) => getPositionLine(p.position) === "GK"
  ).length;
  if (gkCount < 1) {
    return {
      valid: false,
      code: "MISSING_GK",
      message: "골키퍼(GK) 선수를 최소 1명 이상 포함해야 발행할 수 있습니다.",
    };
  }

  // Order Attack -> Midfield -> Defense -> GK for clean pitch row display
  const orderedSnapshots = [...snapshots].sort(
    (a, b) => getLineSortOrder(a.position) - getLineSortOrder(b.position)
  );

  return {
    valid: true,
    title,
    description: (params.description ?? "")
      .trim()
      .slice(0, MAX_SQUAD_DESCRIPTION_LENGTH),
    formation: normalizeFormationChoice(params.formation),
    snapshots: orderedSnapshots,
    gkCount,
  };
}

/**
 * Create and prepend a new immutable squad feed post.
 * Multiple feeds per user are supported; published posts have no edit operation.
 */
export function createSquadFeedPost(params: {
  existingFeeds: readonly SquadFeedPost[];
  user: Pick<UserSession, "id" | "name"> | null;
  title: string;
  description?: string;
  formation?: string;
  selectedPlayerIds: readonly string[];
  holdings: Readonly<Record<string, Holding>>;
  players: readonly Player[];
  transactions?: readonly PointTransaction[];
  playerPrices?: Readonly<Record<string, PersistedPlayerPrice>>;
  nowIso?: string;
  idOverride?: string;
}): SquadPublishResult {
  const feedsList = [...params.existingFeeds];
  if (!params.user) {
    return {
      success: false,
      code: "AUTH_REQUIRED",
      message: "로그인이 필요한 서비스입니다.",
      feeds: feedsList,
    };
  }

  const validation = validateSquadDraft({
    title: params.title,
    description: params.description,
    formation: params.formation,
    selectedPlayerIds: params.selectedPlayerIds,
    holdings: params.holdings,
    players: params.players,
    transactions: params.transactions,
    playerPrices: params.playerPrices,
  });

  if (!validation.valid) {
    return {
      success: false,
      code: validation.code,
      message: validation.message,
      feeds: feedsList,
    };
  }

  const createdAt = params.nowIso ?? new Date().toISOString();
  const id =
    params.idOverride ??
    `squad-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const newPost: SquadFeedPost = {
    id,
    authorId: params.user.id,
    authorName: params.user.name,
    title: validation.title,
    description: validation.description,
    formation: validation.formation,
    players: validation.snapshots,
    createdAt,
    comments: [],
  };

  return {
    success: true,
    message: "11명 스쿼드 피드가 발행되었습니다.",
    feed: newPost,
    feeds: [newPost, ...feedsList],
  };
}

/**
 * Delete a published squad feed post (allowed for the post author or an admin).
 * Published squad posts are immutable: only deletion is permitted.
 */
export function deleteSquadFeedPost(params: {
  existingFeeds: readonly SquadFeedPost[];
  feedId: string;
  user: Pick<UserSession, "id" | "role"> | null;
}): SquadMutationResult {
  const feedsList = [...params.existingFeeds];
  if (!params.user) {
    return {
      success: false,
      message: "로그인이 필요한 서비스입니다.",
      feeds: feedsList,
    };
  }

  const target = feedsList.find((f) => f.id === params.feedId);
  if (!target) {
    return {
      success: false,
      message: "삭제할 스쿼드 피드를 찾을 수 없습니다.",
      feeds: feedsList,
    };
  }

  const isAuthor =
    normalizeUserKey(target.authorId) === normalizeUserKey(params.user.id);
  const isAdmin = params.user.role === "admin";
  if (!isAuthor && !isAdmin) {
    return {
      success: false,
      message: "본인이 발행한 스쿼드 피드만 삭제할 수 있습니다.",
      feeds: feedsList,
    };
  }

  return {
    success: true,
    message: "스쿼드 피드가 삭제되었습니다.",
    feeds: feedsList.filter((f) => f.id !== params.feedId),
  };
}

/**
 * Append a comment to a published squad feed post without mutating the squad itself.
 */
export function addSquadFeedComment(params: {
  existingFeeds: readonly SquadFeedPost[];
  feedId: string;
  user: Pick<UserSession, "id" | "name"> | null;
  content: string;
  nowIso?: string;
  commentIdOverride?: string;
}): SquadCommentMutationResult {
  const feedsList = [...params.existingFeeds];
  if (!params.user) {
    return {
      success: false,
      message: "로그인 후 코멘트를 작성할 수 있습니다.",
      feeds: feedsList,
    };
  }

  const trimmed = params.content.trim().slice(0, MAX_SQUAD_COMMENT_LENGTH);
  if (!trimmed) {
    return {
      success: false,
      message: "코멘트 내용을 입력해주세요.",
      feeds: feedsList,
    };
  }

  const targetIdx = feedsList.findIndex((f) => f.id === params.feedId);
  if (targetIdx === -1) {
    return {
      success: false,
      message: "대상 스쿼드 피드를 찾을 수 없습니다.",
      feeds: feedsList,
    };
  }

  const comment: SquadFeedComment = {
    id:
      params.commentIdOverride ??
      `sqc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    feedId: params.feedId,
    authorId: params.user.id,
    authorName: params.user.name,
    content: trimmed,
    createdAt: params.nowIso ?? new Date().toISOString(),
  };

  const nextFeeds = feedsList.map((feed, idx) =>
    idx === targetIdx
      ? {
          ...feed,
          comments: [...feed.comments, comment],
        }
      : feed
  );

  return {
    success: true,
    message: "코멘트가 등록되었습니다.",
    comment,
    feeds: nextFeeds,
  };
}

/**
 * Delete a comment (allowed for comment author, feed author, or admin).
 */
export function deleteSquadFeedComment(params: {
  existingFeeds: readonly SquadFeedPost[];
  feedId: string;
  commentId: string;
  user: Pick<UserSession, "id" | "role"> | null;
}): SquadMutationResult {
  const feedsList = [...params.existingFeeds];
  if (!params.user) {
    return {
      success: false,
      message: "로그인이 필요한 서비스입니다.",
      feeds: feedsList,
    };
  }

  const targetFeed = feedsList.find((f) => f.id === params.feedId);
  if (!targetFeed) {
    return {
      success: false,
      message: "대상 스쿼드 피드를 찾을 수 없습니다.",
      feeds: feedsList,
    };
  }

  const targetComment = targetFeed.comments.find(
    (c) => c.id === params.commentId
  );
  if (!targetComment) {
    return {
      success: false,
      message: "삭제할 코멘트를 찾을 수 없습니다.",
      feeds: feedsList,
    };
  }

  const userKey = normalizeUserKey(params.user.id);
  const canDelete =
    userKey === normalizeUserKey(targetComment.authorId) ||
    userKey === normalizeUserKey(targetFeed.authorId) ||
    params.user.role === "admin";

  if (!canDelete) {
    return {
      success: false,
      message: "본인이 작성한 코멘트만 삭제할 수 있습니다.",
      feeds: feedsList,
    };
  }

  const nextFeeds = feedsList.map((feed) =>
    feed.id === params.feedId
      ? {
          ...feed,
          comments: feed.comments.filter((c) => c.id !== params.commentId),
        }
      : feed
  );

  return {
    success: true,
    message: "코멘트가 삭제되었습니다.",
    feeds: nextFeeds,
  };
}

/**
 * Resolve the current holdings map for a squad post's author.
 * Uses active `holdings` when the viewer is the post author, otherwise looks up
 * the author's persisted account holdings so sell badges stay accurate across accounts/logouts.
 */
export function resolveSquadAuthorHoldings(params: {
  authorId: string;
  activeUser: Pick<UserSession, "id"> | null;
  activeHoldings: Readonly<Record<string, Holding>>;
  accounts: Readonly<Record<string, Pick<StoredUserAccount, "holdings">>>;
}): Readonly<Record<string, Holding>> {
  const authorKey = normalizeUserKey(params.authorId);
  if (
    params.activeUser &&
    normalizeUserKey(params.activeUser.id) === authorKey
  ) {
    return params.activeHoldings;
  }
  return params.accounts[authorKey]?.holdings ?? {};
}

/**
 * Evaluate per-player sale status against the quantity held when the squad was published:
 * - currentQuantity === 0 -> "FULLY_SOLD" ('전량 매도')
 * - 0 < currentQuantity < publishedQuantity -> "PARTIAL_SOLD" ('일부 매도')
 * - currentQuantity >= publishedQuantity -> "HOLDING" ('보유 중')
 */
export function resolveSquadPlayerSaleStatus(
  snapshot: Pick<SquadFeedPlayerSnapshot, "playerId" | "publishedQuantity">,
  authorHoldings: Readonly<Record<string, Holding>>
): SquadPlayerSaleStatus {
  const publishedQuantity = Math.max(1, Math.floor(snapshot.publishedQuantity));
  const rawCurrent = authorHoldings[snapshot.playerId]?.quantity ?? 0;
  const currentQuantity = Math.max(0, Math.floor(rawCurrent));
  const soldQuantity = Math.max(0, publishedQuantity - currentQuantity);

  if (currentQuantity === 0) {
    return {
      playerId: snapshot.playerId,
      status: "FULLY_SOLD",
      label: "전량 매도",
      publishedQuantity,
      currentQuantity: 0,
      soldQuantity: publishedQuantity,
    };
  }

  if (currentQuantity < publishedQuantity) {
    return {
      playerId: snapshot.playerId,
      status: "PARTIAL_SOLD",
      label: "일부 매도",
      publishedQuantity,
      currentQuantity,
      soldQuantity,
    };
  }

  return {
    playerId: snapshot.playerId,
    status: "HOLDING",
    label: "보유 중",
    publishedQuantity,
    currentQuantity,
    soldQuantity: 0,
  };
}

/**
 * Evaluate both squad-level and per-player sell badges for a published squad post.
 */
export function resolveSquadFeedSaleSummary(
  post: Pick<SquadFeedPost, "players">,
  authorHoldings: Readonly<Record<string, Holding>>
): SquadFeedSaleSummary {
  const byPlayerId: Record<string, SquadPlayerSaleStatus> = {};
  let holdingCount = 0;
  let partialSoldCount = 0;
  let fullySoldCount = 0;

  for (const snap of post.players) {
    const st = resolveSquadPlayerSaleStatus(snap, authorHoldings);
    byPlayerId[snap.playerId] = st;
    if (st.status === "FULLY_SOLD") fullySoldCount += 1;
    else if (st.status === "PARTIAL_SOLD") partialSoldCount += 1;
    else holdingCount += 1;
  }

  const total = post.players.length;
  const status: SquadSaleBadgeStatus =
    total > 0 && fullySoldCount === total
      ? "FULLY_SOLD"
      : fullySoldCount > 0 || partialSoldCount > 0
      ? "PARTIAL_SOLD"
      : "HOLDING";

  const label =
    status === "FULLY_SOLD"
      ? "전량 매도"
      : status === "PARTIAL_SOLD"
      ? "일부 매도"
      : "전원 보유 중";

  return {
    status,
    label,
    holdingCount,
    partialSoldCount,
    fullySoldCount,
    byPlayerId,
  };
}

/**
 * Defensive sanitizer when hydrating persisted `squadFeeds` from localStorage.
 */
export function sanitizePersistedSquadFeeds(raw: unknown): SquadFeedPost[] {
  if (!Array.isArray(raw)) return [];
  const valid: SquadFeedPost[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Partial<SquadFeedPost>;
    if (
      typeof obj.id !== "string" ||
      typeof obj.authorId !== "string" ||
      typeof obj.title !== "string" ||
      !Array.isArray(obj.players) ||
      obj.players.length !== REQUIRED_SQUAD_SIZE
    ) {
      continue;
    }

    const playersValid = obj.players.every(
      (p) =>
        Boolean(p) &&
        typeof p === "object" &&
        typeof p.playerId === "string" &&
        p.playerId.trim().length > 0 &&
        typeof p.name === "string" &&
        typeof p.publishedQuantity === "number" &&
        Number.isFinite(p.publishedQuantity) &&
        p.publishedQuantity > 0
    );
    if (!playersValid) continue;

    const distinctPlayerIds = new Set(obj.players.map((p) => p.playerId));
    if (distinctPlayerIds.size !== REQUIRED_SQUAD_SIZE) continue;

    const hasGk = obj.players.some(
      (p) => getPositionLine(normalizeDetailedPosition(p.position)) === "GK"
    );
    if (!hasGk) continue;

    const comments: SquadFeedComment[] = Array.isArray(obj.comments)
      ? obj.comments.filter(
          (c): c is SquadFeedComment =>
            Boolean(c) &&
            typeof c.id === "string" &&
            typeof c.authorId === "string" &&
            typeof c.content === "string"
        )
      : [];

    valid.push({
      id: obj.id,
      authorId: obj.authorId,
      authorName:
        typeof obj.authorName === "string" && obj.authorName.trim()
          ? obj.authorName
          : obj.authorId,
      title: obj.title,
      description: typeof obj.description === "string" ? obj.description : "",
      formation: normalizeFormationChoice(obj.formation),
      players: obj.players,
      createdAt:
        typeof obj.createdAt === "string"
          ? obj.createdAt
          : new Date().toISOString(),
      comments,
    });
  }

  return valid;
}
