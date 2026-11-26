import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  getPositionLine,
  normalizeDetailedPosition,
  type Holding,
  type Position,
  type SquadFeedComment,
  type SquadFeedPlayerSnapshot,
  type SquadFeedPost,
} from "../../types/index.ts";
import {
  getDb,
  isDatabaseConfigured,
  type PitchTradeDb,
} from "../../db/index.ts";
import {
  holdings,
  squadComments,
  squadPosts,
  squadSlots,
  users,
} from "../../db/schema.ts";
import {
  MAX_SQUAD_COMMENT_LENGTH,
  MAX_SQUAD_DESCRIPTION_LENGTH,
  MAX_SQUAD_TITLE_LENGTH,
  REQUIRED_SQUAD_SIZE,
  getSquadFormationSlots,
  normalizeFormationChoice,
} from "../squadFeed.ts";
import {
  INITIAL_SEED_CASH,
  getDefaultLedgerRepository,
  normalizeLedgerUserId,
  type LedgerRepository,
} from "./ledgerRepository.ts";

export type ServerSaleBadgeStatus = "HOLDING" | "PARTIAL_SOLD" | "FULL_SOLD";

export interface ServerSquadSlotRecord {
  slotIndex: number;
  slotLabel: string;
  playerId: string;
  playerName: string;
  englishName?: string;
  teamName: string;
  teamShort: string;
  teamColor: string;
  position: Position;
  backNumber: number;
  snapshotQuantity: number;
  snapshotPrice: number;
  avgBuyPrice: number;
  currentQuantity: number;
  soldQuantity: number;
  saleStatus: ServerSaleBadgeStatus;
  saleLabel: "보유 중" | "일부 매도" | "전량 매도";
}

export interface ServerSlotSaleSummaryItem {
  playerId: string;
  status: ServerSaleBadgeStatus;
  label: "보유 중" | "일부 매도" | "전량 매도";
  snapshotQuantity: number;
  currentQuantity: number;
  soldQuantity: number;
}

export interface ServerSquadSaleSummary {
  status: ServerSaleBadgeStatus;
  label: "전원 보유 중" | "일부 매도" | "전량 매도";
  holdingCount: number;
  partialSoldCount: number;
  fullSoldCount: number;
  byPlayerId: Record<string, ServerSlotSaleSummaryItem>;
}

export interface ServerSquadPostRecord {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  formation: string;
  createdAt: string;
  slots: ServerSquadSlotRecord[];
  comments: SquadFeedComment[];
  saleSummary: ServerSquadSaleSummary;
  authorHoldings: Record<string, Holding>;
}

export interface SquadSlotDraftInput {
  slotIndex?: number;
  slotLabel?: string;
  playerId: string;
  playerName: string;
  englishName?: string;
  teamName: string;
  teamShort: string;
  teamColor: string;
  position: Position | string;
  backNumber?: number;
  currentPrice?: number;
}

export interface CreateSquadPostInput {
  authorId: string;
  authorName?: string;
  title: string;
  description?: string;
  formation?: string;
  slots: SquadSlotDraftInput[];
  nowMs?: number;
}

export type SquadRepoErrorCode =
  | "AUTH_REQUIRED"
  | "EMPTY_TITLE"
  | "INVALID_SLOT"
  | "DUPLICATE_PLAYER"
  | "NOT_OWNED"
  | "INVALID_COUNT"
  | "MISSING_GK"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "EMPTY_COMMENT";

export interface CreateSquadPostResult {
  success: boolean;
  code?: SquadRepoErrorCode;
  message: string;
  post?: ServerSquadPostRecord;
}

export interface DeleteSquadPostResult {
  success: boolean;
  code?: SquadRepoErrorCode;
  message: string;
}

export interface AddSquadCommentInput {
  postId: string;
  authorId: string;
  authorName?: string;
  content: string;
  nowMs?: number;
}

export interface AddSquadCommentResult {
  success: boolean;
  code?: SquadRepoErrorCode;
  message: string;
  comment?: SquadFeedComment;
}

export interface DeleteSquadCommentResult {
  success: boolean;
  code?: SquadRepoErrorCode;
  message: string;
}

export interface SquadFeedRepository {
  readonly kind: "file" | "postgres";
  listPosts(options?: {
    authorId?: string;
    limit?: number;
  }): Promise<ServerSquadPostRecord[]>;
  getPostById(postId: string): Promise<ServerSquadPostRecord | null>;
  createPost(input: CreateSquadPostInput): Promise<CreateSquadPostResult>;
  deletePost(input: {
    postId: string;
    requesterId: string;
  }): Promise<DeleteSquadPostResult>;
  addComment(input: AddSquadCommentInput): Promise<AddSquadCommentResult>;
  deleteComment(input: {
    postId: string;
    commentId: string;
    requesterId: string;
  }): Promise<DeleteSquadCommentResult>;
}

function roundTen(value: number): number {
  return Math.round(value / 10) * 10;
}

function defaultEmailForUser(normalizedUserId: string): string {
  const safeLocal =
    normalizedUserId.replace(/[^a-z0-9._+-]/g, "_") || "trader";
  return `${safeLocal}@pitchtrade.local`;
}

function generateId(prefix: string, nowMs: number): string {
  return `${prefix}-${nowMs}-${crypto.randomBytes(4).toString("hex")}`;
}

class SquadRollbackError extends Error {
  readonly code: SquadRepoErrorCode;

  constructor(code: SquadRepoErrorCode, message: string) {
    super(message);
    this.name = "SquadRollbackError";
    this.code = code;
  }
}

interface StoredSlotBase {
  slotIndex: number;
  slotLabel: string;
  playerId: string;
  playerName: string;
  englishName?: string;
  teamName: string;
  teamShort: string;
  teamColor: string;
  position: Position;
  backNumber: number;
  snapshotQuantity: number;
  snapshotPrice: number;
  avgBuyPrice: number;
}

interface StoredPostBase {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  formation: string;
  createdAt: string;
  slots: StoredSlotBase[];
  comments: SquadFeedComment[];
}

/**
 * Evaluate dynamic sale badge status for a single slot comparing the author's live holdings
 * against the immutable `snapshotQuantity` fixed at squad publish time:
 * - `currentQuantity === 0` -> `FULL_SOLD` ('전량 매도')
 * - `0 < currentQuantity < snapshotQuantity` -> `PARTIAL_SOLD` ('일부 매도')
 * - `currentQuantity >= snapshotQuantity` -> `HOLDING` ('보유 중')
 */
export function evaluateSlotSaleStatus(
  snapshotQuantity: number,
  currentHoldingQuantity: number
): {
  currentQuantity: number;
  soldQuantity: number;
  saleStatus: ServerSaleBadgeStatus;
  saleLabel: "보유 중" | "일부 매도" | "전량 매도";
} {
  const safeSnapshot = Math.max(1, Math.floor(snapshotQuantity));
  const safeCurrent = Math.max(0, Math.floor(currentHoldingQuantity));
  const soldQuantity = Math.max(0, safeSnapshot - safeCurrent);

  if (safeCurrent === 0) {
    return {
      currentQuantity: 0,
      soldQuantity: safeSnapshot,
      saleStatus: "FULL_SOLD",
      saleLabel: "전량 매도",
    };
  }
  if (safeCurrent < safeSnapshot) {
    return {
      currentQuantity: safeCurrent,
      soldQuantity,
      saleStatus: "PARTIAL_SOLD",
      saleLabel: "일부 매도",
    };
  }
  return {
    currentQuantity: safeCurrent,
    soldQuantity: 0,
    saleStatus: "HOLDING",
    saleLabel: "보유 중",
  };
}

/**
 * Assemble a `ServerSquadPostRecord` with live per-slot and squad-level sale badges
 * dynamically derived from `authorHoldings`.
 */
export function enrichPostWithLiveSaleBadges(
  post: StoredPostBase,
  authorHoldings: Readonly<Record<string, Holding>>
): ServerSquadPostRecord {
  const sortedSlots = [...post.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const byPlayerId: Record<string, ServerSlotSaleSummaryItem> = {};
  let holdingCount = 0;
  let partialSoldCount = 0;
  let fullSoldCount = 0;

  const enrichedSlots: ServerSquadSlotRecord[] = sortedSlots.map((slot) => {
    const liveQty = authorHoldings[slot.playerId]?.quantity ?? 0;
    const evalRes = evaluateSlotSaleStatus(slot.snapshotQuantity, liveQty);

    if (evalRes.saleStatus === "FULL_SOLD") fullSoldCount += 1;
    else if (evalRes.saleStatus === "PARTIAL_SOLD") partialSoldCount += 1;
    else holdingCount += 1;

    byPlayerId[slot.playerId] = {
      playerId: slot.playerId,
      status: evalRes.saleStatus,
      label: evalRes.saleLabel,
      snapshotQuantity: slot.snapshotQuantity,
      currentQuantity: evalRes.currentQuantity,
      soldQuantity: evalRes.soldQuantity,
    };

    return {
      ...slot,
      currentQuantity: evalRes.currentQuantity,
      soldQuantity: evalRes.soldQuantity,
      saleStatus: evalRes.saleStatus,
      saleLabel: evalRes.saleLabel,
    };
  });

  const total = enrichedSlots.length;
  const summaryStatus: ServerSaleBadgeStatus =
    total > 0 && fullSoldCount === total
      ? "FULL_SOLD"
      : fullSoldCount > 0 || partialSoldCount > 0
      ? "PARTIAL_SOLD"
      : "HOLDING";
  const summaryLabel =
    summaryStatus === "FULL_SOLD"
      ? "전량 매도"
      : summaryStatus === "PARTIAL_SOLD"
      ? "일부 매도"
      : "전원 보유 중";

  const scopedHoldings: Record<string, Holding> = {};
  for (const slot of enrichedSlots) {
    const h = authorHoldings[slot.playerId];
    if (h && h.quantity > 0) {
      scopedHoldings[slot.playerId] = { ...h };
    }
  }

  return {
    id: post.id,
    authorId: post.authorId,
    authorName: post.authorName,
    title: post.title,
    description: post.description,
    formation: post.formation,
    createdAt: post.createdAt,
    slots: enrichedSlots,
    comments: [...post.comments],
    saleSummary: {
      status: summaryStatus,
      label: summaryLabel,
      holdingCount,
      partialSoldCount,
      fullSoldCount,
      byPlayerId,
    },
    authorHoldings: scopedHoldings,
  };
}

/**
 * Convert a server post record into the client `SquadFeedPost` view model.
 */
export function toClientSquadFeedPost(
  record: ServerSquadPostRecord
): SquadFeedPost {
  const players: SquadFeedPlayerSnapshot[] = record.slots.map((s) => ({
    playerId: s.playerId,
    name: s.playerName,
    ...(s.englishName ? { englishName: s.englishName } : {}),
    teamName: s.teamName,
    teamShort: s.teamShort,
    teamColor: s.teamColor,
    position: s.position,
    backNumber: s.backNumber,
    publishedQuantity: s.snapshotQuantity,
    publishedPrice: s.snapshotPrice,
    avgBuyPrice: s.avgBuyPrice,
    slotIndex: s.slotIndex,
    slotLabel: s.slotLabel,
    currentQuantity: s.currentQuantity,
    saleStatus: s.saleStatus,
  }));

  return {
    id: record.id,
    authorId: record.authorId,
    authorName: record.authorName,
    title: record.title,
    description: record.description,
    formation: record.formation,
    players,
    createdAt: record.createdAt,
    comments: record.comments,
    authorHoldings: record.authorHoldings,
  };
}

function validateAndNormalizePublishInput(
  input: CreateSquadPostInput,
  authorHoldings: Readonly<Record<string, Holding>>
): {
  title: string;
  description: string;
  formation: string;
  slots: StoredSlotBase[];
} {
  if (!input.authorId || !input.authorId.trim()) {
    throw new SquadRollbackError("AUTH_REQUIRED", "로그인이 필요한 서비스입니다.");
  }

  const title = (input.title ?? "").trim().slice(0, MAX_SQUAD_TITLE_LENGTH);
  if (!title) {
    throw new SquadRollbackError("EMPTY_TITLE", "스쿼드 제목을 입력해주세요.");
  }

  const description = (input.description ?? "")
    .trim()
    .slice(0, MAX_SQUAD_DESCRIPTION_LENGTH);
  const formation = normalizeFormationChoice(input.formation);
  const formationSlots = getSquadFormationSlots(formation);

  if (!Array.isArray(input.slots)) {
    throw new SquadRollbackError(
      "INVALID_COUNT",
      `서로 다른 보유 선수 11명을 선택해야 발행할 수 있습니다. (현재 0/${REQUIRED_SQUAD_SIZE}명)`
    );
  }

  const seenPlayerIds = new Set<string>();
  const seenSlotIndices = new Set<number>();
  const normalizedSlots: StoredSlotBase[] = [];

  for (let i = 0; i < input.slots.length; i += 1) {
    const raw = input.slots[i];
    const playerId = String(raw?.playerId ?? "").trim();
    if (!playerId) {
      throw new SquadRollbackError(
        "INVALID_COUNT",
        "유효하지 않은 선수 항목이 포함되어 있습니다."
      );
    }

    if (seenPlayerIds.has(playerId)) {
      throw new SquadRollbackError(
        "DUPLICATE_PLAYER",
        "동일한 선수는 중복으로 선택할 수 없습니다."
      );
    }
    seenPlayerIds.add(playerId);

    const slotIndex =
      typeof raw.slotIndex === "number" && Number.isInteger(raw.slotIndex)
        ? raw.slotIndex
        : i;
    if (
      slotIndex < 0 ||
      slotIndex >= REQUIRED_SQUAD_SIZE ||
      seenSlotIndices.has(slotIndex)
    ) {
      if (input.slots.length === REQUIRED_SQUAD_SIZE) {
        throw new SquadRollbackError(
          "INVALID_SLOT",
          "유효하지 않거나 중복된 포지션 슬롯입니다."
        );
      }
    } else {
      seenSlotIndices.add(slotIndex);
    }
  }

  if (input.slots.length !== REQUIRED_SQUAD_SIZE) {
    throw new SquadRollbackError(
      "INVALID_COUNT",
      `서로 다른 보유 선수 11명을 선택해야 발행할 수 있습니다. (현재 ${input.slots.length}/${REQUIRED_SQUAD_SIZE}명)`
    );
  }

  for (let i = 0; i < input.slots.length; i += 1) {
    const raw = input.slots[i];
    const playerId = String(raw.playerId).trim();
    const holding = authorHoldings[playerId];
    if (!holding || holding.quantity <= 0) {
      throw new SquadRollbackError(
        "NOT_OWNED",
        "실제 보유 중인 선수(1주 이상)만 스쿼드에 포함할 수 있습니다."
      );
    }

    const slotIndex =
      typeof raw.slotIndex === "number" && Number.isInteger(raw.slotIndex)
        ? raw.slotIndex
        : i;
    const slotMeta = formationSlots[slotIndex];
    const position = normalizeDetailedPosition(String(raw.position ?? "CM"));
    const snapshotQuantity = Math.floor(holding.quantity);
    const avgBuyPrice = roundTen(holding.avgBuyPrice);
    const snapshotPrice = roundTen(
      typeof raw.currentPrice === "number" &&
        Number.isFinite(raw.currentPrice) &&
        raw.currentPrice > 0
        ? raw.currentPrice
        : avgBuyPrice
    );

    normalizedSlots.push({
      slotIndex,
      slotLabel: (raw.slotLabel ?? "").trim() || slotMeta?.label || position,
      playerId,
      playerName: (raw.playerName ?? "").trim() || playerId,
      ...(raw.englishName?.trim()
        ? { englishName: raw.englishName.trim() }
        : {}),
      teamName: (raw.teamName ?? "").trim() || "Unknown FC",
      teamShort: (raw.teamShort ?? "").trim() || "CLB",
      teamColor: (raw.teamColor ?? "").trim() || "#111827",
      position,
      backNumber:
        typeof raw.backNumber === "number" &&
        Number.isFinite(raw.backNumber) &&
        raw.backNumber >= 0
          ? Math.floor(raw.backNumber)
          : 0,
      snapshotQuantity,
      snapshotPrice,
      avgBuyPrice,
    });
  }

  const gkCount = normalizedSlots.filter(
    (s) => getPositionLine(s.position) === "GK"
  ).length;
  if (gkCount < 1) {
    throw new SquadRollbackError(
      "MISSING_GK",
      "골키퍼(GK) 선수를 최소 1명 이상 포함해야 발행할 수 있습니다."
    );
  }

  return {
    title,
    description,
    formation,
    slots: normalizedSlots.sort((a, b) => a.slotIndex - b.slotIndex),
  };
}

// ---------------------------------------------------------------------------
// 1. PostgreSQL + Drizzle ORM Repository
// ---------------------------------------------------------------------------

export class PostgresSquadFeedRepository implements SquadFeedRepository {
  readonly kind = "postgres" as const;
  private readonly db: PitchTradeDb;

  constructor(db: PitchTradeDb) {
    this.db = db;
  }

  async listPosts(options?: {
    authorId?: string;
    limit?: number;
  }): Promise<ServerSquadPostRecord[]> {
    const limit = Math.max(1, Math.min(100, options?.limit ?? 50));
    const filterAuthor = options?.authorId?.trim()
      ? normalizeLedgerUserId(options.authorId)
      : null;

    const postRows = filterAuthor
      ? await this.db
          .select()
          .from(squadPosts)
          .where(eq(squadPosts.authorId, filterAuthor))
          .orderBy(desc(squadPosts.createdAt))
          .limit(limit)
      : await this.db
          .select()
          .from(squadPosts)
          .orderBy(desc(squadPosts.createdAt))
          .limit(limit);

    if (postRows.length === 0) return [];

    const postIds = postRows.map((p) => p.id);
    const authorIds = Array.from(new Set(postRows.map((p) => p.authorId)));

    const [slotRows, commentRows, holdingRows] = await Promise.all([
      this.db
        .select()
        .from(squadSlots)
        .where(inArray(squadSlots.postId, postIds))
        .orderBy(asc(squadSlots.slotIndex)),
      this.db
        .select()
        .from(squadComments)
        .where(inArray(squadComments.postId, postIds))
        .orderBy(asc(squadComments.createdAt)),
      this.db
        .select()
        .from(holdings)
        .where(inArray(holdings.userId, authorIds)),
    ]);

    const slotsByPostId = new Map<string, StoredSlotBase[]>();
    for (const s of slotRows) {
      const list = slotsByPostId.get(s.postId) ?? [];
      list.push({
        slotIndex: s.slotIndex,
        slotLabel: s.slotLabel,
        playerId: s.playerId,
        playerName: s.playerName,
        teamName: s.teamName,
        teamShort: s.teamShort,
        teamColor: s.teamColor,
        position: s.position,
        backNumber: s.backNumber,
        snapshotQuantity: s.snapshotQuantity,
        snapshotPrice: Number(s.snapshotPrice),
        avgBuyPrice: Number(s.avgBuyPrice),
      });
      slotsByPostId.set(s.postId, list);
    }

    const commentsByPostId = new Map<string, SquadFeedComment[]>();
    for (const c of commentRows) {
      const list = commentsByPostId.get(c.postId) ?? [];
      list.push({
        id: c.id,
        feedId: c.postId,
        authorId: c.authorId,
        authorName: c.authorName,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      });
      commentsByPostId.set(c.postId, list);
    }

    const holdingsByAuthorId = new Map<string, Record<string, Holding>>();
    for (const h of holdingRows) {
      if (h.quantity <= 0) continue;
      const map = holdingsByAuthorId.get(h.userId) ?? {};
      map[h.playerId] = {
        playerId: h.playerId,
        quantity: h.quantity,
        avgBuyPrice: Number(h.avgPrice),
        ...(h.matchContext ? { matchContext: h.matchContext } : {}),
      };
      holdingsByAuthorId.set(h.userId, map);
    }

    return postRows.map((p) =>
      enrichPostWithLiveSaleBadges(
        {
          id: p.id,
          authorId: p.authorId,
          authorName: p.authorName,
          title: p.title,
          description: p.description,
          formation: p.formation,
          createdAt: p.createdAt.toISOString(),
          slots: slotsByPostId.get(p.id) ?? [],
          comments: commentsByPostId.get(p.id) ?? [],
        },
        holdingsByAuthorId.get(p.authorId) ?? {}
      )
    );
  }

  async getPostById(postId: string): Promise<ServerSquadPostRecord | null> {
    const cleanId = postId.trim();
    if (!cleanId) return null;

    const postRows = await this.db
      .select()
      .from(squadPosts)
      .where(eq(squadPosts.id, cleanId))
      .limit(1);
    const postRow = postRows[0];
    if (!postRow) return null;

    const [slotRows, commentRows, holdingRows] = await Promise.all([
      this.db
        .select()
        .from(squadSlots)
        .where(eq(squadSlots.postId, postRow.id))
        .orderBy(asc(squadSlots.slotIndex)),
      this.db
        .select()
        .from(squadComments)
        .where(eq(squadComments.postId, postRow.id))
        .orderBy(asc(squadComments.createdAt)),
      this.db
        .select()
        .from(holdings)
        .where(eq(holdings.userId, postRow.authorId)),
    ]);

    const authorHoldings: Record<string, Holding> = {};
    for (const h of holdingRows) {
      if (h.quantity <= 0) continue;
      authorHoldings[h.playerId] = {
        playerId: h.playerId,
        quantity: h.quantity,
        avgBuyPrice: Number(h.avgPrice),
        ...(h.matchContext ? { matchContext: h.matchContext } : {}),
      };
    }

    return enrichPostWithLiveSaleBadges(
      {
        id: postRow.id,
        authorId: postRow.authorId,
        authorName: postRow.authorName,
        title: postRow.title,
        description: postRow.description,
        formation: postRow.formation,
        createdAt: postRow.createdAt.toISOString(),
        slots: slotRows.map((s) => ({
          slotIndex: s.slotIndex,
          slotLabel: s.slotLabel,
          playerId: s.playerId,
          playerName: s.playerName,
          teamName: s.teamName,
          teamShort: s.teamShort,
          teamColor: s.teamColor,
          position: s.position,
          backNumber: s.backNumber,
          snapshotQuantity: s.snapshotQuantity,
          snapshotPrice: Number(s.snapshotPrice),
          avgBuyPrice: Number(s.avgBuyPrice),
        })),
        comments: commentRows.map((c) => ({
          id: c.id,
          feedId: c.postId,
          authorId: c.authorId,
          authorName: c.authorName,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
        })),
      },
      authorHoldings
    );
  }

  async createPost(input: CreateSquadPostInput): Promise<CreateSquadPostResult> {
    if (!input.authorId || !input.authorId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      };
    }

    const normalizedAuthorId = normalizeLedgerUserId(input.authorId);
    const authorName = input.authorName?.trim() || input.authorId.trim();
    const nowMs = input.nowMs ?? Date.now();
    const nowDate = new Date(nowMs);

    try {
      const post = await this.db.transaction(async (tx) => {
        // Ensure author user record exists to satisfy FK constraint
        await tx
          .insert(users)
          .values({
            id: normalizedAuthorId,
            email: defaultEmailForUser(normalizedAuthorId),
            nickname: authorName,
            cashBalance: INITIAL_SEED_CASH,
          })
          .onConflictDoNothing({ target: users.id });

        // Read authoritative current holdings for the author inside the transaction
        const holdingRows = await tx
          .select()
          .from(holdings)
          .where(eq(holdings.userId, normalizedAuthorId));

        const authorHoldings: Record<string, Holding> = {};
        for (const h of holdingRows) {
          if (h.quantity <= 0) continue;
          authorHoldings[h.playerId] = {
            playerId: h.playerId,
            quantity: h.quantity,
            avgBuyPrice: Number(h.avgPrice),
            ...(h.matchContext ? { matchContext: h.matchContext } : {}),
          };
        }

        const validated = validateAndNormalizePublishInput(input, authorHoldings);
        const postId = generateId("squad", nowMs);

        await tx.insert(squadPosts).values({
          id: postId,
          authorId: normalizedAuthorId,
          authorName,
          title: validated.title,
          description: validated.description,
          formation: validated.formation,
          createdAt: nowDate,
        });

        await tx.insert(squadSlots).values(
          validated.slots.map((s) => ({
            postId,
            slotIndex: s.slotIndex,
            slotLabel: s.slotLabel,
            playerId: s.playerId,
            playerName: s.playerName,
            teamName: s.teamName,
            teamShort: s.teamShort,
            teamColor: s.teamColor,
            position: s.position,
            backNumber: s.backNumber,
            snapshotQuantity: s.snapshotQuantity,
            snapshotPrice: s.snapshotPrice,
            avgBuyPrice: s.avgBuyPrice,
          }))
        );

        return enrichPostWithLiveSaleBadges(
          {
            id: postId,
            authorId: normalizedAuthorId,
            authorName,
            title: validated.title,
            description: validated.description,
            formation: validated.formation,
            createdAt: nowDate.toISOString(),
            slots: validated.slots,
            comments: [],
          },
          authorHoldings
        );
      });

      return {
        success: true,
        message: "11명 스쿼드 피드가 발행되었습니다.",
        post,
      };
    } catch (err) {
      if (err instanceof SquadRollbackError) {
        return {
          success: false,
          code: err.code,
          message: err.message,
        };
      }
      throw err;
    }
  }

  async deletePost(input: {
    postId: string;
    requesterId: string;
  }): Promise<DeleteSquadPostResult> {
    if (!input.requesterId || !input.requesterId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      };
    }

    const cleanPostId = input.postId.trim();
    const requesterKey = normalizeLedgerUserId(input.requesterId);

    try {
      await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(squadPosts)
          .where(eq(squadPosts.id, cleanPostId))
          .limit(1);
        const existing = rows[0];
        if (!existing) {
          throw new SquadRollbackError(
            "NOT_FOUND",
            "삭제할 스쿼드 피드를 찾을 수 없습니다."
          );
        }

        if (normalizeLedgerUserId(existing.authorId) !== requesterKey) {
          throw new SquadRollbackError(
            "FORBIDDEN",
            "본인이 발행한 스쿼드 피드만 삭제할 수 있습니다."
          );
        }

        // Delete post (ON DELETE CASCADE removes squad_slots & squad_comments atomically)
        await tx
          .delete(squadPosts)
          .where(
            and(
              eq(squadPosts.id, cleanPostId),
              eq(squadPosts.authorId, existing.authorId)
            )
          );
      });

      return {
        success: true,
        message: "스쿼드 피드가 삭제되었습니다.",
      };
    } catch (err) {
      if (err instanceof SquadRollbackError) {
        return {
          success: false,
          code: err.code,
          message: err.message,
        };
      }
      throw err;
    }
  }

  async addComment(input: AddSquadCommentInput): Promise<AddSquadCommentResult> {
    if (!input.authorId || !input.authorId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인 후 코멘트를 작성할 수 있습니다.",
      };
    }

    const content = (input.content ?? "")
      .trim()
      .slice(0, MAX_SQUAD_COMMENT_LENGTH);
    if (!content) {
      return {
        success: false,
        code: "EMPTY_COMMENT",
        message: "코멘트 내용을 입력해주세요.",
      };
    }

    const cleanPostId = input.postId.trim();
    const normalizedAuthorId = normalizeLedgerUserId(input.authorId);
    const authorName = input.authorName?.trim() || input.authorId.trim();
    const nowMs = input.nowMs ?? Date.now();
    const nowDate = new Date(nowMs);

    try {
      const comment = await this.db.transaction(async (tx) => {
        const postRows = await tx
          .select()
          .from(squadPosts)
          .where(eq(squadPosts.id, cleanPostId))
          .limit(1);
        if (postRows.length === 0) {
          throw new SquadRollbackError(
            "NOT_FOUND",
            "대상 스쿼드 피드를 찾을 수 없습니다."
          );
        }

        // Ensure commenter exists in users table before inserting FK row
        await tx
          .insert(users)
          .values({
            id: normalizedAuthorId,
            email: defaultEmailForUser(normalizedAuthorId),
            nickname: authorName,
            cashBalance: INITIAL_SEED_CASH,
          })
          .onConflictDoNothing({ target: users.id });

        const commentId = generateId("sqc", nowMs);
        await tx.insert(squadComments).values({
          id: commentId,
          postId: cleanPostId,
          authorId: normalizedAuthorId,
          authorName,
          content,
          createdAt: nowDate,
        });

        return {
          id: commentId,
          feedId: cleanPostId,
          authorId: normalizedAuthorId,
          authorName,
          content,
          createdAt: nowDate.toISOString(),
        } satisfies SquadFeedComment;
      });

      return {
        success: true,
        message: "코멘트가 등록되었습니다.",
        comment,
      };
    } catch (err) {
      if (err instanceof SquadRollbackError) {
        return {
          success: false,
          code: err.code,
          message: err.message,
        };
      }
      throw err;
    }
  }

  async deleteComment(input: {
    postId: string;
    commentId: string;
    requesterId: string;
  }): Promise<DeleteSquadCommentResult> {
    if (!input.requesterId || !input.requesterId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      };
    }

    const cleanPostId = input.postId.trim();
    const cleanCommentId = input.commentId.trim();
    const requesterKey = normalizeLedgerUserId(input.requesterId);

    try {
      await this.db.transaction(async (tx) => {
        const postRows = await tx
          .select()
          .from(squadPosts)
          .where(eq(squadPosts.id, cleanPostId))
          .limit(1);
        const post = postRows[0];
        if (!post) {
          throw new SquadRollbackError(
            "NOT_FOUND",
            "대상 스쿼드 피드를 찾을 수 없습니다."
          );
        }

        const commentRows = await tx
          .select()
          .from(squadComments)
          .where(
            and(
              eq(squadComments.id, cleanCommentId),
              eq(squadComments.postId, cleanPostId)
            )
          )
          .limit(1);
        const comment = commentRows[0];
        if (!comment) {
          throw new SquadRollbackError(
            "NOT_FOUND",
            "삭제할 코멘트를 찾을 수 없습니다."
          );
        }

        const canDelete =
          normalizeLedgerUserId(comment.authorId) === requesterKey ||
          normalizeLedgerUserId(post.authorId) === requesterKey;
        if (!canDelete) {
          throw new SquadRollbackError(
            "FORBIDDEN",
            "본인이 작성한 코멘트만 삭제할 수 있습니다."
          );
        }

        await tx
          .delete(squadComments)
          .where(
            and(
              eq(squadComments.id, cleanCommentId),
              eq(squadComments.postId, cleanPostId)
            )
          );
      });

      return {
        success: true,
        message: "코멘트가 삭제되었습니다.",
      };
    } catch (err) {
      if (err instanceof SquadRollbackError) {
        return {
          success: false,
          code: err.code,
          message: err.message,
        };
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Local File Fallback Repository (`.cache/squad-feed.json` + memory mirror)
// ---------------------------------------------------------------------------

interface FileSquadFeedDiskPayload {
  version: 1;
  posts: StoredPostBase[];
}

/**
 * File-backed fallback squad feed repository used when `DATABASE_URL` is unset.
 * - Persists to `.cache/squad-feed.json` (never touching `.cache/ledger.json`).
 * - Mirrors state in memory so read-only sandboxes keep deterministic behavior.
 * - Verifies publish holdings and evaluates dynamic sell badges against `LedgerRepository`.
 */
export class FileSquadFeedRepository implements SquadFeedRepository {
  readonly kind = "file" as const;

  private static readonly memoryStoreByPath = new Map<
    string,
    FileSquadFeedDiskPayload
  >();
  private static readonly writeLocks = new Map<string, Promise<void>>();

  private readonly feedFilePath: string;
  private readonly ledgerRepoResolver: () => LedgerRepository;

  constructor(options?: {
    feedFilePath?: string;
    ledgerRepo?: LedgerRepository;
  }) {
    this.feedFilePath =
      options?.feedFilePath ??
      path.join(process.cwd(), ".cache", "squad-feed.json");
    this.ledgerRepoResolver = options?.ledgerRepo
      ? () => options.ledgerRepo!
      : () => getDefaultLedgerRepository();
  }

  getFilePath(): string {
    return this.feedFilePath;
  }

  private async withFileLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const key = this.feedFilePath;
    const prev = FileSquadFeedRepository.writeLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => next);
    FileSquadFeedRepository.writeLocks.set(key, chained);

    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (FileSquadFeedRepository.writeLocks.get(key) === chained) {
        FileSquadFeedRepository.writeLocks.delete(key);
      }
    }
  }

  private readStore(): FileSquadFeedDiskPayload {
    const mem = FileSquadFeedRepository.memoryStoreByPath.get(this.feedFilePath);
    if (mem) {
      return structuredClone(mem);
    }

    try {
      if (fs.existsSync(this.feedFilePath)) {
        const raw = fs.readFileSync(this.feedFilePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<FileSquadFeedDiskPayload>;
        const normalized: FileSquadFeedDiskPayload = {
          version: 1,
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        };
        FileSquadFeedRepository.memoryStoreByPath.set(
          this.feedFilePath,
          structuredClone(normalized)
        );
        return normalized;
      }
    } catch {
      // Ignore corrupt or missing file
    }

    return { version: 1, posts: [] };
  }

  private writeStore(payload: FileSquadFeedDiskPayload): void {
    const snapshot = structuredClone(payload);
    FileSquadFeedRepository.memoryStoreByPath.set(this.feedFilePath, snapshot);
    try {
      const dir = path.dirname(this.feedFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.feedFilePath,
        JSON.stringify(snapshot, null, 2),
        "utf8"
      );
    } catch {
      // In read-only sandboxes, in-memory mirror preserves state
    }
  }

  private async resolveHoldingsForAuthors(
    authorIds: readonly string[]
  ): Promise<Map<string, Record<string, Holding>>> {
    const ledgerRepo = this.ledgerRepoResolver();
    const uniqueAuthors = Array.from(
      new Set(authorIds.map((id) => normalizeLedgerUserId(id)))
    );
    const result = new Map<string, Record<string, Holding>>();

    await Promise.all(
      uniqueAuthors.map(async (authorId) => {
        const portfolio = await ledgerRepo.getPortfolio(authorId, {
          autoCreate: false,
        });
        result.set(authorId, portfolio?.holdings ?? {});
      })
    );
    return result;
  }

  async listPosts(options?: {
    authorId?: string;
    limit?: number;
  }): Promise<ServerSquadPostRecord[]> {
    const limit = Math.max(1, Math.min(100, options?.limit ?? 50));
    const filterAuthor = options?.authorId?.trim()
      ? normalizeLedgerUserId(options.authorId)
      : null;

    const store = this.readStore();
    const filtered = filterAuthor
      ? store.posts.filter(
          (p) => normalizeLedgerUserId(p.authorId) === filterAuthor
        )
      : store.posts;
    const sorted = [...filtered]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, limit);

    const holdingsByAuthor = await this.resolveHoldingsForAuthors(
      sorted.map((p) => p.authorId)
    );

    return sorted.map((p) =>
      enrichPostWithLiveSaleBadges(
        p,
        holdingsByAuthor.get(normalizeLedgerUserId(p.authorId)) ?? {}
      )
    );
  }

  async getPostById(postId: string): Promise<ServerSquadPostRecord | null> {
    const cleanId = postId.trim();
    if (!cleanId) return null;

    const store = this.readStore();
    const post = store.posts.find((p) => p.id === cleanId);
    if (!post) return null;

    const holdingsByAuthor = await this.resolveHoldingsForAuthors([
      post.authorId,
    ]);
    return enrichPostWithLiveSaleBadges(
      post,
      holdingsByAuthor.get(normalizeLedgerUserId(post.authorId)) ?? {}
    );
  }

  async createPost(input: CreateSquadPostInput): Promise<CreateSquadPostResult> {
    if (!input.authorId || !input.authorId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      };
    }

    const normalizedAuthorId = normalizeLedgerUserId(input.authorId);
    const authorName = input.authorName?.trim() || input.authorId.trim();
    const nowMs = input.nowMs ?? Date.now();

    return this.withFileLock(async () => {
      try {
        const ledgerRepo = this.ledgerRepoResolver();
        const portfolio = await ledgerRepo.getPortfolio(normalizedAuthorId, {
          autoCreate: false,
        });
        const authorHoldings = portfolio?.holdings ?? {};

        const validated = validateAndNormalizePublishInput(input, authorHoldings);
        const postId = generateId("squad", nowMs);
        const storedPost: StoredPostBase = {
          id: postId,
          authorId: normalizedAuthorId,
          authorName,
          title: validated.title,
          description: validated.description,
          formation: validated.formation,
          createdAt: new Date(nowMs).toISOString(),
          slots: validated.slots,
          comments: [],
        };

        const store = this.readStore();
        store.posts = [storedPost, ...store.posts];
        this.writeStore(store);

        return {
          success: true,
          message: "11명 스쿼드 피드가 발행되었습니다.",
          post: enrichPostWithLiveSaleBadges(storedPost, authorHoldings),
        };
      } catch (err) {
        if (err instanceof SquadRollbackError) {
          return {
            success: false,
            code: err.code,
            message: err.message,
          };
        }
        throw err;
      }
    });
  }

  async deletePost(input: {
    postId: string;
    requesterId: string;
  }): Promise<DeleteSquadPostResult> {
    if (!input.requesterId || !input.requesterId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      };
    }

    const cleanPostId = input.postId.trim();
    const requesterKey = normalizeLedgerUserId(input.requesterId);

    return this.withFileLock(() => {
      const store = this.readStore();
      const target = store.posts.find((p) => p.id === cleanPostId);
      if (!target) {
        return {
          success: false,
          code: "NOT_FOUND",
          message: "삭제할 스쿼드 피드를 찾을 수 없습니다.",
        };
      }
      if (normalizeLedgerUserId(target.authorId) !== requesterKey) {
        return {
          success: false,
          code: "FORBIDDEN",
          message: "본인이 발행한 스쿼드 피드만 삭제할 수 있습니다.",
        };
      }

      store.posts = store.posts.filter((p) => p.id !== cleanPostId);
      this.writeStore(store);
      return {
        success: true,
        message: "스쿼드 피드가 삭제되었습니다.",
      };
    });
  }

  async addComment(input: AddSquadCommentInput): Promise<AddSquadCommentResult> {
    if (!input.authorId || !input.authorId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인 후 코멘트를 작성할 수 있습니다.",
      };
    }

    const content = (input.content ?? "")
      .trim()
      .slice(0, MAX_SQUAD_COMMENT_LENGTH);
    if (!content) {
      return {
        success: false,
        code: "EMPTY_COMMENT",
        message: "코멘트 내용을 입력해주세요.",
      };
    }

    const cleanPostId = input.postId.trim();
    const normalizedAuthorId = normalizeLedgerUserId(input.authorId);
    const authorName = input.authorName?.trim() || input.authorId.trim();
    const nowMs = input.nowMs ?? Date.now();

    return this.withFileLock(() => {
      const store = this.readStore();
      const target = store.posts.find((p) => p.id === cleanPostId);
      if (!target) {
        return {
          success: false,
          code: "NOT_FOUND",
          message: "대상 스쿼드 피드를 찾을 수 없습니다.",
        };
      }

      const comment: SquadFeedComment = {
        id: generateId("sqc", nowMs),
        feedId: cleanPostId,
        authorId: normalizedAuthorId,
        authorName,
        content,
        createdAt: new Date(nowMs).toISOString(),
      };
      target.comments = [...target.comments, comment];
      this.writeStore(store);

      return {
        success: true,
        message: "코멘트가 등록되었습니다.",
        comment,
      };
    });
  }

  async deleteComment(input: {
    postId: string;
    commentId: string;
    requesterId: string;
  }): Promise<DeleteSquadCommentResult> {
    if (!input.requesterId || !input.requesterId.trim()) {
      return {
        success: false,
        code: "AUTH_REQUIRED",
        message: "로그인이 필요한 서비스입니다.",
      };
    }

    const cleanPostId = input.postId.trim();
    const cleanCommentId = input.commentId.trim();
    const requesterKey = normalizeLedgerUserId(input.requesterId);

    return this.withFileLock(() => {
      const store = this.readStore();
      const target = store.posts.find((p) => p.id === cleanPostId);
      if (!target) {
        return {
          success: false,
          code: "NOT_FOUND",
          message: "대상 스쿼드 피드를 찾을 수 없습니다.",
        };
      }

      const targetComment = target.comments.find((c) => c.id === cleanCommentId);
      if (!targetComment) {
        return {
          success: false,
          code: "NOT_FOUND",
          message: "삭제할 코멘트를 찾을 수 없습니다.",
        };
      }

      const canDelete =
        normalizeLedgerUserId(targetComment.authorId) === requesterKey ||
        normalizeLedgerUserId(target.authorId) === requesterKey;
      if (!canDelete) {
        return {
          success: false,
          code: "FORBIDDEN",
          message: "본인이 작성한 코멘트만 삭제할 수 있습니다.",
        };
      }

      target.comments = target.comments.filter((c) => c.id !== cleanCommentId);
      this.writeStore(store);
      return {
        success: true,
        message: "코멘트가 삭제되었습니다.",
      };
    });
  }

  static clearMemoryForTesting(filePath?: string): void {
    if (filePath) {
      FileSquadFeedRepository.memoryStoreByPath.delete(filePath);
    } else {
      FileSquadFeedRepository.memoryStoreByPath.clear();
    }
  }
}

const defaultFileSquadRepo = new FileSquadFeedRepository();

/**
 * Factory returning `PostgresSquadFeedRepository` when `DATABASE_URL` is configured,
 * or safely falling back to `FileSquadFeedRepository` when unset.
 */
export function getDefaultSquadFeedRepository(
  rawUrl: string | undefined = process.env.DATABASE_URL
): SquadFeedRepository {
  if (!isDatabaseConfigured(rawUrl)) {
    return defaultFileSquadRepo;
  }
  const db = getDb(rawUrl);
  if (!db) {
    return defaultFileSquadRepo;
  }
  return new PostgresSquadFeedRepository(db);
}

export function clearDefaultSquadFeedRepositoryForTesting(): void {
  FileSquadFeedRepository.clearMemoryForTesting(
    defaultFileSquadRepo.getFilePath()
  );
}
