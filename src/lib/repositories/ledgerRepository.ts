import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type {
  ActiveMatchContext,
  Holding,
  MatchStatus,
  TradeType,
} from "../../types/index.ts";
import {
  getDb,
  isDatabaseConfigured,
  type PitchTradeDb,
} from "../../db/index.ts";
import { holdings, ledgerEntries, users } from "../../db/schema.ts";
import { validateTradeOrder } from "../orderGate.ts";

/** Initial virtual seed balance (matches `INITIAL_CASH` and `users.cash_balance` default). */
export const INITIAL_SEED_CASH = 100_000;
const DEFAULT_ENTRIES_LIMIT = 40;

export interface LedgerUserProfile {
  id: string;
  email: string;
  nickname: string;
  cashBalance: number;
  createdAt: string;
}

export interface LedgerTradeEntry {
  id: string;
  userId: string;
  playerId: string;
  side: TradeType;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  createdAt: string;
  playerName?: string;
  teamShort?: string;
  balanceAfter?: number;
  realizedPnL?: number;
}

export interface PortfolioSnapshot {
  user: LedgerUserProfile;
  cashBalance: number;
  holdings: Record<string, Holding>;
  entries: LedgerTradeEntry[];
}

export interface EnsureUserInput {
  userId: string;
  nickname?: string;
  email?: string;
  initialCash?: number;
}

export interface ExecuteOrderInput {
  userId: string;
  nickname?: string;
  email?: string;
  side: TradeType;
  playerId: string;
  playerName?: string;
  teamShort?: string;
  quantity: number;
  matchStatus: MatchStatus;
  basePrice: number;
  currentPrice: number;
  lastMajorEventAt?: number;
  matchContext?: ActiveMatchContext | null;
  nowMs?: number;
}

export type OrderErrorCode =
  | "INVALID_INPUT"
  | "ORDER_GATE_REJECTED"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_HOLDINGS"
  | "CONFLICT";

export interface ExecuteOrderResult {
  success: boolean;
  code?: OrderErrorCode;
  message: string;
  executedPrice?: number;
  totalAmount?: number;
  realizedPnL?: number;
  entry?: LedgerTradeEntry;
  portfolio?: PortfolioSnapshot;
}

export interface LedgerRepository {
  readonly kind: "file" | "postgres";
  ensureUser(input: EnsureUserInput): Promise<LedgerUserProfile>;
  getPortfolio(
    userId: string,
    options?: {
      nickname?: string;
      email?: string;
      autoCreate?: boolean;
      limit?: number;
    }
  ): Promise<PortfolioSnapshot | null>;
  executeOrder(input: ExecuteOrderInput): Promise<ExecuteOrderResult>;
  adjustCash(input: {
    userId: string;
    delta: number;
    nickname?: string;
    email?: string;
  }): Promise<LedgerUserProfile>;
  resetUser(input: {
    userId: string;
    initialCash?: number;
    nickname?: string;
    email?: string;
  }): Promise<PortfolioSnapshot>;
}

function roundTen(value: number): number {
  return Math.round(value / 10) * 10;
}

export function normalizeLedgerUserId(rawUserId: string): string {
  return rawUserId.trim().toLowerCase();
}

function defaultEmailForUser(normalizedUserId: string): string {
  const safeLocal =
    normalizedUserId.replace(/[^a-z0-9._+-]/g, "_") || "trader";
  return `${safeLocal}@pitchtrade.local`;
}

function generateLedgerEntryId(nowMs: number): string {
  const rand = crypto.randomBytes(4).toString("hex");
  return `le-${nowMs}-${rand}`;
}

class OrderRollbackError extends Error {
  readonly code: OrderErrorCode;
  readonly executedPrice?: number;

  constructor(code: OrderErrorCode, message: string, executedPrice?: number) {
    super(message);
    this.name = "OrderRollbackError";
    this.code = code;
    this.executedPrice = executedPrice;
  }
}

function validateRawOrderInput(
  input: ExecuteOrderInput
): { code: OrderErrorCode; message: string } | null {
  if (!input.userId || !input.userId.trim()) {
    return { code: "INVALID_INPUT", message: "로그인이 필요한 서비스입니다." };
  }
  if (!input.playerId || !input.playerId.trim()) {
    return { code: "INVALID_INPUT", message: "선수 정보를 찾을 수 없습니다." };
  }
  if (input.side !== "BUY" && input.side !== "SELL") {
    return { code: "INVALID_INPUT", message: "유효하지 않은 주문 구분입니다." };
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return {
      code: "INVALID_INPUT",
      message: "수량은 1주 이상의 정수로 입력해주세요.",
    };
  }
  if (
    !Number.isFinite(input.basePrice) ||
    input.basePrice <= 0 ||
    !Number.isFinite(input.currentPrice) ||
    input.currentPrice <= 0
  ) {
    return {
      code: "INVALID_INPUT",
      message: "유효하지 않은 시세 정보입니다.",
    };
  }
  return null;
}

function classifyGateFailure(
  input: ExecuteOrderInput,
  cashBalance: number,
  holdingQuantity: number,
  executedPrice: number,
  message?: string
): OrderErrorCode {
  if (message?.includes("보유 포인트")) return "INSUFFICIENT_FUNDS";
  if (message?.includes("보유 수량")) return "INSUFFICIENT_HOLDINGS";
  if (
    input.side === "BUY" &&
    roundTen(executedPrice * input.quantity) > cashBalance &&
    !message?.includes("상한가") &&
    !message?.includes("거래 마감") &&
    !message?.includes("서킷 브레이커")
  ) {
    return "INSUFFICIENT_FUNDS";
  }
  if (
    input.side === "SELL" &&
    holdingQuantity < input.quantity &&
    !message?.includes("하한가") &&
    !message?.includes("거래 마감") &&
    !message?.includes("서킷 브레이커")
  ) {
    return "INSUFFICIENT_HOLDINGS";
  }
  return "ORDER_GATE_REJECTED";
}

function formatSuccessMessage(
  side: TradeType,
  playerLabel: string,
  quantity: number,
  totalAmount: number
): string {
  return side === "BUY"
    ? `${playerLabel} ${quantity}주 매수 완료 (-${totalAmount.toLocaleString()} P)`
    : `${playerLabel} ${quantity}주 매도 완료 (+${totalAmount.toLocaleString()} P)`;
}

// ---------------------------------------------------------------------------
// 1. PostgreSQL + Drizzle ORM Transactional Repository
// ---------------------------------------------------------------------------

export class PostgresLedgerRepository implements LedgerRepository {
  readonly kind = "postgres" as const;
  private readonly db: PitchTradeDb;

  constructor(db: PitchTradeDb) {
    this.db = db;
  }

  async ensureUser(input: EnsureUserInput): Promise<LedgerUserProfile> {
    const normalizedId = normalizeLedgerUserId(input.userId);
    const nickname = input.nickname?.trim() || input.userId.trim();
    const email =
      input.email?.trim().toLowerCase() || defaultEmailForUser(normalizedId);
    const seedCash = roundTen(input.initialCash ?? INITIAL_SEED_CASH);

    await this.db
      .insert(users)
      .values({
        id: normalizedId,
        email,
        nickname,
        cashBalance: seedCash,
      })
      .onConflictDoNothing({ target: users.id });

    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, normalizedId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new Error(`Failed to initialize user record: ${normalizedId}`);
    }

    return {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      cashBalance: Number(row.cashBalance),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getPortfolio(
    userId: string,
    options?: {
      nickname?: string;
      email?: string;
      autoCreate?: boolean;
      limit?: number;
    }
  ): Promise<PortfolioSnapshot | null> {
    const normalizedId = normalizeLedgerUserId(userId);
    if (!normalizedId) return null;

    let userProfile: LedgerUserProfile | null = null;
    if (options?.autoCreate !== false) {
      userProfile = await this.ensureUser({
        userId,
        nickname: options?.nickname,
        email: options?.email,
      });
    } else {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.id, normalizedId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      userProfile = {
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        cashBalance: Number(row.cashBalance),
        createdAt: row.createdAt.toISOString(),
      };
    }

    const limit = Math.max(1, Math.min(200, options?.limit ?? DEFAULT_ENTRIES_LIMIT));

    const [holdingRows, entryRows] = await Promise.all([
      this.db
        .select()
        .from(holdings)
        .where(eq(holdings.userId, normalizedId)),
      this.db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, normalizedId))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(limit),
    ]);

    const holdingsMap: Record<string, Holding> = {};
    for (const h of holdingRows) {
      if (h.quantity <= 0) continue;
      holdingsMap[h.playerId] = {
        playerId: h.playerId,
        quantity: h.quantity,
        avgBuyPrice: Number(h.avgPrice),
        ...(h.matchContext ? { matchContext: h.matchContext } : {}),
      };
    }

    const entries: LedgerTradeEntry[] = entryRows.map((e) => ({
      id: e.id,
      userId: e.userId,
      playerId: e.playerId,
      side: e.side,
      quantity: e.quantity,
      unitPrice: Number(e.unitPrice),
      totalAmount: Number(e.totalAmount),
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      user: userProfile,
      cashBalance: userProfile.cashBalance,
      holdings: holdingsMap,
      entries,
    };
  }

  async executeOrder(input: ExecuteOrderInput): Promise<ExecuteOrderResult> {
    const inputErr = validateRawOrderInput(input);
    if (inputErr) {
      return {
        success: false,
        code: inputErr.code,
        message: inputErr.message,
      };
    }

    const normalizedUserId = normalizeLedgerUserId(input.userId);
    const playerId = input.playerId.trim();
    const nickname = input.nickname?.trim() || input.userId.trim();
    const email =
      input.email?.trim().toLowerCase() || defaultEmailForUser(normalizedUserId);
    const nowMs = input.nowMs ?? Date.now();
    const nowDate = new Date(nowMs);
    const playerLabel = input.playerName?.trim() || playerId;

    try {
      return await this.db.transaction(async (tx) => {
        // 1. Ensure user row exists without overwriting an existing balance
        await tx
          .insert(users)
          .values({
            id: normalizedUserId,
            email,
            nickname,
            cashBalance: INITIAL_SEED_CASH,
          })
          .onConflictDoNothing({ target: users.id });

        // 2. Lock user row (`FOR UPDATE`) to prevent concurrent negative cash balance
        const lockedUsers = await tx
          .select()
          .from(users)
          .where(eq(users.id, normalizedUserId))
          .for("update");
        const lockedUser = lockedUsers[0];
        if (!lockedUser) {
          throw new OrderRollbackError(
            "CONFLICT",
            "계정 정보를 잠그는 중 오류가 발생했습니다."
          );
        }

        // 3. Lock target holding row (`FOR UPDATE`) to prevent concurrent overselling
        const lockedHoldings = await tx
          .select()
          .from(holdings)
          .where(
            and(
              eq(holdings.userId, normalizedUserId),
              eq(holdings.playerId, playerId)
            )
          )
          .for("update");
        const existingHolding = lockedHoldings[0];
        const currentCash = Number(lockedUser.cashBalance);
        const currentQty = existingHolding?.quantity ?? 0;

        // 4. Enforce v2.5 orderGate rules + authoritative locked balance/holdings
        const gate = validateTradeOrder({
          side: input.side,
          matchStatus: input.matchStatus,
          basePrice: input.basePrice,
          currentPrice: input.currentPrice,
          quantity: input.quantity,
          cash: currentCash,
          holdingQuantity: currentQty,
          lastMajorEventAt: input.lastMajorEventAt,
          nowMs,
        });

        if (!gate.allowed) {
          const code = classifyGateFailure(
            input,
            currentCash,
            currentQty,
            gate.executedPrice,
            gate.message
          );
          throw new OrderRollbackError(
            code,
            gate.message ?? "주문을 실행할 수 없습니다.",
            gate.executedPrice
          );
        }

        const executedPrice = gate.executedPrice;
        const totalAmount = roundTen(executedPrice * input.quantity);
        const entryId = generateLedgerEntryId(nowMs);
        let nextCash = currentCash;
        let realizedPnL: number | undefined;

        if (input.side === "BUY") {
          // Conditional atomic deduction double-guarding against negative balance
          const updatedUsers = await tx
            .update(users)
            .set({
              cashBalance: sql`${users.cashBalance} - ${totalAmount}`,
            })
            .where(
              and(
                eq(users.id, normalizedUserId),
                gte(users.cashBalance, totalAmount)
              )
            )
            .returning();

          if (updatedUsers.length === 0) {
            throw new OrderRollbackError(
              "INSUFFICIENT_FUNDS",
              `보유 포인트가 부족합니다. (필요: ${totalAmount.toLocaleString()} P)`,
              executedPrice
            );
          }

          nextCash = Number(updatedUsers[0].cashBalance);
          const prevInvested = currentQty * Number(existingHolding?.avgPrice ?? 0);
          const newQty = currentQty + input.quantity;
          const newAvgPrice = roundTen((prevInvested + totalAmount) / newQty);
          const nextMatchContext =
            input.matchContext !== undefined
              ? input.matchContext
              : existingHolding?.matchContext ?? null;

          await tx
            .insert(holdings)
            .values({
              userId: normalizedUserId,
              playerId,
              quantity: newQty,
              avgPrice: newAvgPrice,
              matchContext: nextMatchContext,
              updatedAt: nowDate,
            })
            .onConflictDoUpdate({
              target: [holdings.userId, holdings.playerId],
              set: {
                quantity: newQty,
                avgPrice: newAvgPrice,
                matchContext: nextMatchContext,
                updatedAt: nowDate,
              },
            });
        } else {
          // SELL
          if (!existingHolding || currentQty < input.quantity) {
            throw new OrderRollbackError(
              "INSUFFICIENT_HOLDINGS",
              `보유 수량이 부족합니다. (현재 보유: ${currentQty}주)`,
              executedPrice
            );
          }

          const avgBuyPrice = Number(existingHolding.avgPrice);
          realizedPnL = roundTen((executedPrice - avgBuyPrice) * input.quantity);
          const remainingQty = currentQty - input.quantity;

          if (remainingQty === 0) {
            const deleted = await tx
              .delete(holdings)
              .where(
                and(
                  eq(holdings.userId, normalizedUserId),
                  eq(holdings.playerId, playerId),
                  eq(holdings.quantity, input.quantity)
                )
              )
              .returning();
            if (deleted.length === 0) {
              throw new OrderRollbackError(
                "INSUFFICIENT_HOLDINGS",
                `보유 수량이 부족합니다. (현재 보유: ${currentQty}주)`,
                executedPrice
              );
            }
          } else {
            const updatedHoldings = await tx
              .update(holdings)
              .set({
                quantity: sql`${holdings.quantity} - ${input.quantity}`,
                updatedAt: nowDate,
              })
              .where(
                and(
                  eq(holdings.userId, normalizedUserId),
                  eq(holdings.playerId, playerId),
                  gte(holdings.quantity, input.quantity)
                )
              )
              .returning();
            if (updatedHoldings.length === 0) {
              throw new OrderRollbackError(
                "INSUFFICIENT_HOLDINGS",
                `보유 수량이 부족합니다. (현재 보유: ${currentQty}주)`,
                executedPrice
              );
            }
          }

          const updatedUsers = await tx
            .update(users)
            .set({
              cashBalance: sql`${users.cashBalance} + ${totalAmount}`,
            })
            .where(eq(users.id, normalizedUserId))
            .returning();

          nextCash =
            updatedUsers.length > 0
              ? Number(updatedUsers[0].cashBalance)
              : roundTen(currentCash + totalAmount);
        }

        // 5. Append immutable trade ledger entry
        await tx.insert(ledgerEntries).values({
          id: entryId,
          userId: normalizedUserId,
          playerId,
          side: input.side,
          quantity: input.quantity,
          unitPrice: executedPrice,
          totalAmount,
          createdAt: nowDate,
        });

        // 6. Read updated holdings & recent ledger entries inside the same transaction
        const [allHoldings, recentEntries] = await Promise.all([
          tx
            .select()
            .from(holdings)
            .where(eq(holdings.userId, normalizedUserId)),
          tx
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.userId, normalizedUserId))
            .orderBy(desc(ledgerEntries.createdAt))
            .limit(DEFAULT_ENTRIES_LIMIT),
        ]);

        const holdingsMap: Record<string, Holding> = {};
        for (const h of allHoldings) {
          if (h.quantity <= 0) continue;
          holdingsMap[h.playerId] = {
            playerId: h.playerId,
            quantity: h.quantity,
            avgBuyPrice: Number(h.avgPrice),
            ...(h.matchContext ? { matchContext: h.matchContext } : {}),
          };
        }

        const entry: LedgerTradeEntry = {
          id: entryId,
          userId: normalizedUserId,
          playerId,
          side: input.side,
          quantity: input.quantity,
          unitPrice: executedPrice,
          totalAmount,
          createdAt: nowDate.toISOString(),
          ...(input.playerName ? { playerName: input.playerName } : {}),
          ...(input.teamShort ? { teamShort: input.teamShort } : {}),
          balanceAfter: nextCash,
          ...(realizedPnL !== undefined ? { realizedPnL } : {}),
        };

        const entries: LedgerTradeEntry[] = recentEntries.map((e) =>
          e.id === entryId
            ? entry
            : {
                id: e.id,
                userId: e.userId,
                playerId: e.playerId,
                side: e.side,
                quantity: e.quantity,
                unitPrice: Number(e.unitPrice),
                totalAmount: Number(e.totalAmount),
                createdAt: e.createdAt.toISOString(),
              }
        );

        const userProfile: LedgerUserProfile = {
          id: lockedUser.id,
          email: lockedUser.email,
          nickname: lockedUser.nickname,
          cashBalance: nextCash,
          createdAt: lockedUser.createdAt.toISOString(),
        };

        return {
          success: true,
          message: formatSuccessMessage(
            input.side,
            playerLabel,
            input.quantity,
            totalAmount
          ),
          executedPrice,
          totalAmount,
          ...(realizedPnL !== undefined ? { realizedPnL } : {}),
          entry,
          portfolio: {
            user: userProfile,
            cashBalance: nextCash,
            holdings: holdingsMap,
            entries,
          },
        };
      });
    } catch (err) {
      if (err instanceof OrderRollbackError) {
        return {
          success: false,
          code: err.code,
          message: err.message,
          ...(err.executedPrice !== undefined
            ? { executedPrice: err.executedPrice }
            : {}),
        };
      }
      throw err;
    }
  }

  async adjustCash(input: {
    userId: string;
    delta: number;
    nickname?: string;
    email?: string;
  }): Promise<LedgerUserProfile> {
    const normalizedId = normalizeLedgerUserId(input.userId);
    const safeDelta = roundTen(input.delta);

    return this.db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({
          id: normalizedId,
          email:
            input.email?.trim().toLowerCase() || defaultEmailForUser(normalizedId),
          nickname: input.nickname?.trim() || input.userId.trim(),
          cashBalance: INITIAL_SEED_CASH,
        })
        .onConflictDoNothing({ target: users.id });

      const locked = await tx
        .select()
        .from(users)
        .where(eq(users.id, normalizedId))
        .for("update");
      const current = locked[0];
      const nextCash = Math.max(0, roundTen(Number(current.cashBalance) + safeDelta));

      const updated = await tx
        .update(users)
        .set({ cashBalance: nextCash })
        .where(eq(users.id, normalizedId))
        .returning();

      const row = updated[0] ?? current;
      return {
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        cashBalance: Number(row.cashBalance),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async resetUser(input: {
    userId: string;
    initialCash?: number;
    nickname?: string;
    email?: string;
  }): Promise<PortfolioSnapshot> {
    const normalizedId = normalizeLedgerUserId(input.userId);
    const seedCash = roundTen(input.initialCash ?? INITIAL_SEED_CASH);

    return this.db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({
          id: normalizedId,
          email:
            input.email?.trim().toLowerCase() || defaultEmailForUser(normalizedId),
          nickname: input.nickname?.trim() || input.userId.trim(),
          cashBalance: seedCash,
        })
        .onConflictDoNothing({ target: users.id });

      await tx.delete(holdings).where(eq(holdings.userId, normalizedId));
      await tx
        .delete(ledgerEntries)
        .where(eq(ledgerEntries.userId, normalizedId));

      const updated = await tx
        .update(users)
        .set({ cashBalance: seedCash })
        .where(eq(users.id, normalizedId))
        .returning();
      const row = updated[0];

      const userProfile: LedgerUserProfile = {
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        cashBalance: Number(row.cashBalance),
        createdAt: row.createdAt.toISOString(),
      };

      return {
        user: userProfile,
        cashBalance: userProfile.cashBalance,
        holdings: {},
        entries: [],
      };
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Local File Fallback Repository (`.cache/trade-ledger.json` + per-user mutex)
// ---------------------------------------------------------------------------

interface FileLedgerAccountState {
  user: LedgerUserProfile;
  holdings: Record<string, Holding>;
  entries: LedgerTradeEntry[];
}

interface FileLedgerDiskPayload {
  version: 1;
  /** Preserves simulated event entries if ever pointed at `.cache/ledger.json`. */
  entries?: Record<string, unknown>;
  tradeAccounts: Record<string, FileLedgerAccountState>;
}

/**
 * File-backed fallback trade ledger used automatically when `DATABASE_URL` is unset.
 * - Uses `.cache/trade-ledger.json` by default so `SimulatedEventsProvider`'s `.cache/ledger.json`
 *   event ledger remains 100% isolated and untouched.
 * - Mirrors `SimulatedEventsProvider`'s in-memory fallback for read-only sandboxes.
 * - Enforces per-user async serialization and snapshot rollback for atomic BUY/SELL semantics.
 */
export class FileLedgerRepository implements LedgerRepository {
  readonly kind = "file" as const;

  private static readonly memoryStoreByPath = new Map<
    string,
    FileLedgerDiskPayload
  >();
  private static readonly userLocks = new Map<string, Promise<void>>();

  private readonly ledgerFilePath: string;

  constructor(options?: { ledgerFilePath?: string }) {
    this.ledgerFilePath =
      options?.ledgerFilePath ??
      path.join(process.cwd(), ".cache", "trade-ledger.json");
  }

  getFilePath(): string {
    return this.ledgerFilePath;
  }

  private async withUserLock<T>(
    normalizedUserId: string,
    fn: () => Promise<T> | T
  ): Promise<T> {
    const lockKey = `${this.ledgerFilePath}::${normalizedUserId}`;
    const prev = FileLedgerRepository.userLocks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => next);
    FileLedgerRepository.userLocks.set(lockKey, chained);

    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (FileLedgerRepository.userLocks.get(lockKey) === chained) {
        FileLedgerRepository.userLocks.delete(lockKey);
      }
    }
  }

  private readStore(): FileLedgerDiskPayload {
    const mem = FileLedgerRepository.memoryStoreByPath.get(this.ledgerFilePath);
    if (mem) {
      return structuredClone(mem);
    }

    try {
      if (fs.existsSync(this.ledgerFilePath)) {
        const raw = fs.readFileSync(this.ledgerFilePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<FileLedgerDiskPayload>;
        const normalized: FileLedgerDiskPayload = {
          version: 1,
          ...(parsed.entries !== undefined ? { entries: parsed.entries } : {}),
          tradeAccounts:
            parsed.tradeAccounts && typeof parsed.tradeAccounts === "object"
              ? parsed.tradeAccounts
              : {},
        };
        FileLedgerRepository.memoryStoreByPath.set(
          this.ledgerFilePath,
          structuredClone(normalized)
        );
        return normalized;
      }
    } catch {
      // Corrupt or unreadable file falls back cleanly to empty store
    }

    return { version: 1, tradeAccounts: {} };
  }

  private writeStore(payload: FileLedgerDiskPayload): void {
    const snapshot = structuredClone(payload);
    FileLedgerRepository.memoryStoreByPath.set(this.ledgerFilePath, snapshot);
    try {
      const dir = path.dirname(this.ledgerFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.ledgerFilePath,
        JSON.stringify(snapshot, null, 2),
        "utf8"
      );
    } catch {
      // In read-only sandboxes, in-memory mirror preserves deterministic state
    }
  }

  private ensureAccountInStore(
    store: FileLedgerDiskPayload,
    input: EnsureUserInput
  ): { account: FileLedgerAccountState; created: boolean } {
    const normalizedId = normalizeLedgerUserId(input.userId);
    const existing = store.tradeAccounts[normalizedId];
    if (existing) {
      return { account: existing, created: false };
    }

    const seedCash = roundTen(input.initialCash ?? INITIAL_SEED_CASH);
    const createdAccount: FileLedgerAccountState = {
      user: {
        id: normalizedId,
        email:
          input.email?.trim().toLowerCase() || defaultEmailForUser(normalizedId),
        nickname: input.nickname?.trim() || input.userId.trim(),
        cashBalance: seedCash,
        createdAt: new Date().toISOString(),
      },
      holdings: {},
      entries: [],
    };
    store.tradeAccounts[normalizedId] = createdAccount;
    return { account: createdAccount, created: true };
  }

  async ensureUser(input: EnsureUserInput): Promise<LedgerUserProfile> {
    const normalizedId = normalizeLedgerUserId(input.userId);
    return this.withUserLock(normalizedId, () => {
      const store = this.readStore();
      const { account, created } = this.ensureAccountInStore(store, input);
      if (created) {
        this.writeStore(store);
      }
      return structuredClone(account.user);
    });
  }

  async getPortfolio(
    userId: string,
    options?: {
      nickname?: string;
      email?: string;
      autoCreate?: boolean;
      limit?: number;
    }
  ): Promise<PortfolioSnapshot | null> {
    const normalizedId = normalizeLedgerUserId(userId);
    if (!normalizedId) return null;

    return this.withUserLock(normalizedId, () => {
      const store = this.readStore();
      let account = store.tradeAccounts[normalizedId];
      if (!account) {
        if (options?.autoCreate === false) return null;
        const ensured = this.ensureAccountInStore(store, {
          userId,
          nickname: options?.nickname,
          email: options?.email,
        });
        account = ensured.account;
        this.writeStore(store);
      }

      const limit = Math.max(
        1,
        Math.min(200, options?.limit ?? DEFAULT_ENTRIES_LIMIT)
      );
      return {
        user: structuredClone(account.user),
        cashBalance: account.user.cashBalance,
        holdings: structuredClone(account.holdings),
        entries: structuredClone(account.entries.slice(0, limit)),
      };
    });
  }

  async executeOrder(input: ExecuteOrderInput): Promise<ExecuteOrderResult> {
    const inputErr = validateRawOrderInput(input);
    if (inputErr) {
      return {
        success: false,
        code: inputErr.code,
        message: inputErr.message,
      };
    }

    const normalizedUserId = normalizeLedgerUserId(input.userId);
    const playerId = input.playerId.trim();
    const nowMs = input.nowMs ?? Date.now();
    const playerLabel = input.playerName?.trim() || playerId;

    return this.withUserLock(normalizedUserId, () => {
      const store = this.readStore();
      const { account } = this.ensureAccountInStore(store, {
        userId: input.userId,
        nickname: input.nickname,
        email: input.email,
      });

      const currentCash = account.user.cashBalance;
      const existingHolding = account.holdings[playerId];
      const currentQty = existingHolding?.quantity ?? 0;

      // Enforce v2.5 orderGate rules + balance/holdings checks BEFORE mutating state
      const gate = validateTradeOrder({
        side: input.side,
        matchStatus: input.matchStatus,
        basePrice: input.basePrice,
        currentPrice: input.currentPrice,
        quantity: input.quantity,
        cash: currentCash,
        holdingQuantity: currentQty,
        lastMajorEventAt: input.lastMajorEventAt,
        nowMs,
      });

      if (!gate.allowed) {
        const code = classifyGateFailure(
          input,
          currentCash,
          currentQty,
          gate.executedPrice,
          gate.message
        );
        // Atomic rollback: discard working copy without persisting any change
        return {
          success: false,
          code,
          message: gate.message ?? "주문을 실행할 수 없습니다.",
          executedPrice: gate.executedPrice,
        };
      }

      const executedPrice = gate.executedPrice;
      const totalAmount = roundTen(executedPrice * input.quantity);
      const entryId = generateLedgerEntryId(nowMs);
      let nextCash = currentCash;
      let realizedPnL: number | undefined;

      if (input.side === "BUY") {
        if (totalAmount > currentCash) {
          return {
            success: false,
            code: "INSUFFICIENT_FUNDS",
            message: `보유 포인트가 부족합니다. (필요: ${totalAmount.toLocaleString()} P)`,
            executedPrice,
          };
        }
        nextCash = roundTen(currentCash - totalAmount);
        const prevInvested = currentQty * (existingHolding?.avgBuyPrice ?? 0);
        const newQty = currentQty + input.quantity;
        const newAvg = roundTen((prevInvested + totalAmount) / newQty);
        const nextContext =
          input.matchContext !== undefined
            ? input.matchContext ?? undefined
            : existingHolding?.matchContext;

        account.holdings[playerId] = {
          playerId,
          quantity: newQty,
          avgBuyPrice: newAvg,
          ...(nextContext ? { matchContext: nextContext } : {}),
        };
      } else {
        if (!existingHolding || currentQty < input.quantity) {
          return {
            success: false,
            code: "INSUFFICIENT_HOLDINGS",
            message: `보유 수량이 부족합니다. (현재 보유: ${currentQty}주)`,
            executedPrice,
          };
        }
        realizedPnL = roundTen(
          (executedPrice - existingHolding.avgBuyPrice) * input.quantity
        );
        const remainingQty = currentQty - input.quantity;
        if (remainingQty === 0) {
          delete account.holdings[playerId];
        } else {
          account.holdings[playerId] = {
            ...existingHolding,
            quantity: remainingQty,
          };
        }
        nextCash = roundTen(currentCash + totalAmount);
      }

      account.user.cashBalance = nextCash;

      const entry: LedgerTradeEntry = {
        id: entryId,
        userId: normalizedUserId,
        playerId,
        side: input.side,
        quantity: input.quantity,
        unitPrice: executedPrice,
        totalAmount,
        createdAt: new Date(nowMs).toISOString(),
        ...(input.playerName ? { playerName: input.playerName } : {}),
        ...(input.teamShort ? { teamShort: input.teamShort } : {}),
        balanceAfter: nextCash,
        ...(realizedPnL !== undefined ? { realizedPnL } : {}),
      };

      // Append-only ledger history (newest first for UI/API query convenience)
      account.entries = [entry, ...account.entries];
      this.writeStore(store);

      return {
        success: true,
        message: formatSuccessMessage(
          input.side,
          playerLabel,
          input.quantity,
          totalAmount
        ),
        executedPrice,
        totalAmount,
        ...(realizedPnL !== undefined ? { realizedPnL } : {}),
        entry: structuredClone(entry),
        portfolio: {
          user: structuredClone(account.user),
          cashBalance: nextCash,
          holdings: structuredClone(account.holdings),
          entries: structuredClone(account.entries.slice(0, DEFAULT_ENTRIES_LIMIT)),
        },
      };
    });
  }

  async adjustCash(input: {
    userId: string;
    delta: number;
    nickname?: string;
    email?: string;
  }): Promise<LedgerUserProfile> {
    const normalizedId = normalizeLedgerUserId(input.userId);
    return this.withUserLock(normalizedId, () => {
      const store = this.readStore();
      const { account } = this.ensureAccountInStore(store, {
        userId: input.userId,
        nickname: input.nickname,
        email: input.email,
      });
      account.user.cashBalance = Math.max(
        0,
        roundTen(account.user.cashBalance + roundTen(input.delta))
      );
      this.writeStore(store);
      return structuredClone(account.user);
    });
  }

  async resetUser(input: {
    userId: string;
    initialCash?: number;
    nickname?: string;
    email?: string;
  }): Promise<PortfolioSnapshot> {
    const normalizedId = normalizeLedgerUserId(input.userId);
    const seedCash = roundTen(input.initialCash ?? INITIAL_SEED_CASH);
    return this.withUserLock(normalizedId, () => {
      const store = this.readStore();
      const { account } = this.ensureAccountInStore(store, {
        userId: input.userId,
        nickname: input.nickname,
        email: input.email,
        initialCash: seedCash,
      });
      account.user.cashBalance = seedCash;
      account.holdings = {};
      account.entries = [];
      this.writeStore(store);
      return {
        user: structuredClone(account.user),
        cashBalance: seedCash,
        holdings: {},
        entries: [],
      };
    });
  }

  static clearMemoryForTesting(filePath?: string): void {
    if (filePath) {
      FileLedgerRepository.memoryStoreByPath.delete(filePath);
    } else {
      FileLedgerRepository.memoryStoreByPath.clear();
    }
  }
}

const defaultFileRepo = new FileLedgerRepository();

/**
 * Factory returning `PostgresLedgerRepository` when `DATABASE_URL` is configured,
 * or safely falling back to `FileLedgerRepository` when unset.
 */
export function getDefaultLedgerRepository(
  rawUrl: string | undefined = process.env.DATABASE_URL
): LedgerRepository {
  if (!isDatabaseConfigured(rawUrl)) {
    return defaultFileRepo;
  }
  const db = getDb(rawUrl);
  if (!db) {
    return defaultFileRepo;
  }
  return new PostgresLedgerRepository(db);
}

export function clearDefaultLedgerRepositoryForTesting(): void {
  FileLedgerRepository.clearMemoryForTesting(defaultFileRepo.getFilePath());
}
