import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PitchTradeDb } from "../src/db/index.ts";
import { holdings, ledgerEntries, users } from "../src/db/schema.ts";
import {
  FileLedgerRepository,
  INITIAL_SEED_CASH,
  PostgresLedgerRepository,
  clearDefaultLedgerRepositoryForTesting,
  getDefaultLedgerRepository,
} from "../src/lib/repositories/ledgerRepository.ts";
import { SimulatedEventsProvider } from "../src/lib/providers/index.ts";
import { WEIGHTS } from "../src/lib/weights.ts";
import type { ActiveMatchContext } from "../src/types/index.ts";

const TEST_TRADE_LEDGER_PATH = path.join(
  os.tmpdir(),
  "pitchtrade-test-trade-ledger.json"
);

const SAMPLE_MATCH_CTX: ActiveMatchContext = {
  matchId: "af-1559001",
  competition: "프리미어리그",
  homeTeam: "TOT",
  awayTeam: "ARS",
  homeScore: 1,
  awayScore: 1,
  status: "LIVE",
  kickoffTime: "23:30",
  minute: 58,
};

function cleanupTestLedgerFile(filePath: string): void {
  FileLedgerRepository.clearMemoryForTesting(filePath);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors in read-only environments
  }
}

test("1. BUY execution deducts cash, computes weighted average price, upserts holdings, and appends immutable ledger entries", async () => {
  cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  try {
    const repo = new FileLedgerRepository({
      ledgerFilePath: TEST_TRADE_LEDGER_PATH,
    });

    const initialPortfolio = await repo.getPortfolio("TraderOne", {
      nickname: "트레이더1",
    });
    assert.ok(initialPortfolio);
    assert.equal(initialPortfolio.cashBalance, INITIAL_SEED_CASH);
    assert.deepEqual(initialPortfolio.holdings, {});
    assert.equal(initialPortfolio.entries.length, 0);

    // 1st BUY: 2 shares @ 10,000 P -> 20,000 P
    const buy1 = await repo.executeOrder({
      userId: "TraderOne",
      nickname: "트레이더1",
      side: "BUY",
      playerId: "p-son",
      playerName: "Heung-Min Son",
      teamShort: "TOT",
      quantity: 2,
      matchStatus: "LIVE",
      basePrice: 10_000,
      currentPrice: 10_000,
      matchContext: SAMPLE_MATCH_CTX,
      nowMs: 1_760_000_001_000,
    });

    assert.equal(buy1.success, true);
    assert.equal(buy1.executedPrice, 10_000);
    assert.equal(buy1.totalAmount, 20_000);
    assert.equal(buy1.portfolio?.cashBalance, 80_000);
    assert.equal(buy1.portfolio?.holdings["p-son"]?.quantity, 2);
    assert.equal(buy1.portfolio?.holdings["p-son"]?.avgBuyPrice, 10_000);
    assert.equal(
      buy1.portfolio?.holdings["p-son"]?.matchContext?.matchId,
      "af-1559001"
    );
    assert.equal(buy1.portfolio?.entries.length, 1);
    assert.equal(buy1.entry?.side, "BUY");
    assert.equal(buy1.entry?.totalAmount, 20_000);

    // 2nd BUY: 3 shares @ 11,000 P -> 33,000 P; weighted avg = (20,000 + 33,000) / 5 = 10,600 P
    const buy2 = await repo.executeOrder({
      userId: "TraderOne",
      side: "BUY",
      playerId: "p-son",
      playerName: "Heung-Min Son",
      teamShort: "TOT",
      quantity: 3,
      matchStatus: "LIVE",
      basePrice: 10_000,
      currentPrice: 11_000,
      matchContext: SAMPLE_MATCH_CTX,
      nowMs: 1_760_000_002_000,
    });

    assert.equal(buy2.success, true);
    assert.equal(buy2.portfolio?.cashBalance, 47_000);
    assert.equal(buy2.portfolio?.holdings["p-son"]?.quantity, 5);
    assert.equal(buy2.portfolio?.holdings["p-son"]?.avgBuyPrice, 10_600);
    assert.equal(buy2.portfolio?.entries.length, 2);
    // Append-only check: original first entry remains intact
    assert.equal(buy2.portfolio?.entries[1]?.id, buy1.entry?.id);
    assert.equal(buy2.portfolio?.entries[1]?.unitPrice, 10_000);
  } finally {
    cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  }
});

test("2. SELL execution credits cash, handles partial/full sell cleanly, and rejects overselling", async () => {
  cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  try {
    const repo = new FileLedgerRepository({
      ledgerFilePath: TEST_TRADE_LEDGER_PATH,
    });

    // Seed: buy 5 shares @ 10,600 P average (2 @ 10,000 + 3 @ 11,000)
    await repo.executeOrder({
      userId: "seller-user",
      side: "BUY",
      playerId: "p-saka",
      playerName: "Bukayo Saka",
      quantity: 2,
      matchStatus: "LIVE",
      basePrice: 10_000,
      currentPrice: 10_000,
      nowMs: 1_760_000_010_000,
    });
    await repo.executeOrder({
      userId: "seller-user",
      side: "BUY",
      playerId: "p-saka",
      playerName: "Bukayo Saka",
      quantity: 3,
      matchStatus: "LIVE",
      basePrice: 10_000,
      currentPrice: 11_000,
      nowMs: 1_760_000_011_000,
    });

    // Partial SELL: 2 shares @ 11,200 P (+22,400 P; realizedPnL = +1,200 P)
    const partialSell = await repo.executeOrder({
      userId: "seller-user",
      side: "SELL",
      playerId: "p-saka",
      playerName: "Bukayo Saka",
      quantity: 2,
      matchStatus: "LIVE",
      basePrice: 10_000,
      currentPrice: 11_200,
      nowMs: 1_760_000_012_000,
    });

    assert.equal(partialSell.success, true);
    assert.equal(partialSell.totalAmount, 22_400);
    assert.equal(partialSell.realizedPnL, 1_200);
    assert.equal(partialSell.portfolio?.cashBalance, 69_400);
    assert.equal(partialSell.portfolio?.holdings["p-saka"]?.quantity, 3);
    assert.equal(partialSell.portfolio?.holdings["p-saka"]?.avgBuyPrice, 10_600);
    assert.equal(partialSell.portfolio?.entries.length, 3);

    // Oversell attempt: 4 shares when only 3 held -> rejected with zero mutation
    const oversell = await repo.executeOrder({
      userId: "seller-user",
      side: "SELL",
      playerId: "p-saka",
      quantity: 4,
      matchStatus: "LIVE",
      basePrice: 10_000,
      currentPrice: 11_200,
      nowMs: 1_760_000_013_000,
    });
    assert.equal(oversell.success, false);
    assert.equal(oversell.code, "INSUFFICIENT_HOLDINGS");
    assert.match(oversell.message, /보유 수량이 부족/);

    const afterRejected = await repo.getPortfolio("seller-user");
    assert.equal(afterRejected?.cashBalance, 69_400);
    assert.equal(afterRejected?.holdings["p-saka"]?.quantity, 3);
    assert.equal(afterRejected?.entries.length, 3);

    // Full SELL: remaining 3 shares @ 10,000 P (+30,000 P; realizedPnL = -1,800 P; holding removed)
    const fullSell = await repo.executeOrder({
      userId: "seller-user",
      side: "SELL",
      playerId: "p-saka",
      quantity: 3,
      matchStatus: "LIVE",
      basePrice: 10_000,
      currentPrice: 10_000,
      nowMs: 1_760_000_014_000,
    });
    assert.equal(fullSell.success, true);
    assert.equal(fullSell.totalAmount, 30_000);
    assert.equal(fullSell.realizedPnL, -1_800);
    assert.equal(fullSell.portfolio?.cashBalance, 99_400);
    assert.equal(fullSell.portfolio?.holdings["p-saka"], undefined);
    assert.equal(fullSell.portfolio?.entries.length, 4);
  } finally {
    cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  }
});

test("3. Insufficient funds and orderGate rejections (+15% cap, -15% floor, FT, 30s circuit breaker) roll back with zero state mutation", async () => {
  cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  try {
    const repo = new FileLedgerRepository({
      ledgerFilePath: TEST_TRADE_LEDGER_PATH,
    });

    const basePrice = 10_000;
    const capPrice = Math.round((basePrice * (1 + WEIGHTS.CAP_LIMIT)) / 10) * 10; // 11,500
    const floorPrice = Math.round((basePrice * (1 - WEIGHTS.CAP_LIMIT)) / 10) * 10; // 8,500

    // Seed 2 shares so we can also test SELL orderGate rejections
    const seed = await repo.executeOrder({
      userId: "guard-user",
      side: "BUY",
      playerId: "p-haaland",
      quantity: 2,
      matchStatus: "LIVE",
      basePrice,
      currentPrice: basePrice,
      nowMs: 1_760_000_100_000,
    });
    assert.equal(seed.success, true);
    // Remaining cash: 80,000 P, holding: 2 shares, entries: 1

    // 3-a) Insufficient funds BUY (9 * 10,000 = 90,000 > 80,000)
    const noCash = await repo.executeOrder({
      userId: "guard-user",
      side: "BUY",
      playerId: "p-haaland",
      quantity: 9,
      matchStatus: "LIVE",
      basePrice,
      currentPrice: basePrice,
      nowMs: 1_760_000_101_000,
    });
    assert.equal(noCash.success, false);
    assert.equal(noCash.code, "INSUFFICIENT_FUNDS");

    // 3-b) +15% Upper limit BUY blocked
    const upperCap = await repo.executeOrder({
      userId: "guard-user",
      side: "BUY",
      playerId: "p-haaland",
      quantity: 1,
      matchStatus: "LIVE",
      basePrice,
      currentPrice: capPrice,
      nowMs: 1_760_000_102_000,
    });
    assert.equal(upperCap.success, false);
    assert.equal(upperCap.code, "ORDER_GATE_REJECTED");
    assert.match(upperCap.message, /상한가/);

    // 3-c) -15% Lower limit SELL blocked
    const lowerFloor = await repo.executeOrder({
      userId: "guard-user",
      side: "SELL",
      playerId: "p-haaland",
      quantity: 1,
      matchStatus: "LIVE",
      basePrice,
      currentPrice: floorPrice,
      nowMs: 1_760_000_103_000,
    });
    assert.equal(lowerFloor.success, false);
    assert.equal(lowerFloor.code, "ORDER_GATE_REJECTED");
    assert.match(lowerFloor.message, /하한가/);

    // 3-d) Finished match (FT) BUY & SELL blocked
    const ftBuy = await repo.executeOrder({
      userId: "guard-user",
      side: "BUY",
      playerId: "p-haaland",
      quantity: 1,
      matchStatus: "FT",
      basePrice,
      currentPrice: basePrice,
      nowMs: 1_760_000_104_000,
    });
    assert.equal(ftBuy.success, false);
    assert.equal(ftBuy.code, "ORDER_GATE_REJECTED");

    // 3-e) 30s Circuit Breaker active
    const majorEventAt = 1_760_000_200_000;
    const cbLocked = await repo.executeOrder({
      userId: "guard-user",
      side: "SELL",
      playerId: "p-haaland",
      quantity: 1,
      matchStatus: "LIVE",
      basePrice,
      currentPrice: basePrice,
      lastMajorEventAt: majorEventAt,
      nowMs: majorEventAt + 10_000,
    });
    assert.equal(cbLocked.success, false);
    assert.equal(cbLocked.code, "ORDER_GATE_REJECTED");
    assert.match(cbLocked.message, /서킷 브레이커/);

    // Verify ZERO mutation across cash, holdings, and ledger entries
    const finalSnapshot = await repo.getPortfolio("guard-user");
    assert.equal(finalSnapshot?.cashBalance, 80_000);
    assert.equal(finalSnapshot?.holdings["p-haaland"]?.quantity, 2);
    assert.equal(finalSnapshot?.entries.length, 1);
  } finally {
    cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  }
});

test("4. Concurrent rapid BUY/SELL bursts are serialized and never cause negative cash or overselling", async () => {
  cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  try {
    const repo = new FileLedgerRepository({
      ledgerFilePath: TEST_TRADE_LEDGER_PATH,
    });

    // 5 concurrent BUYs of 30,000 P each against 100,000 P seed -> exactly 3 fill, 2 reject
    const buyResults = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        repo.executeOrder({
          userId: "burst-user",
          side: "BUY",
          playerId: "p-salah",
          quantity: 3,
          matchStatus: "LIVE",
          basePrice: 10_000,
          currentPrice: 10_000,
          nowMs: 1_760_000_300_000 + idx,
        })
      )
    );

    const buySuccesses = buyResults.filter((r) => r.success);
    const buyFailures = buyResults.filter((r) => !r.success);
    assert.equal(buySuccesses.length, 3);
    assert.equal(buyFailures.length, 2);
    assert.ok(buyFailures.every((r) => r.code === "INSUFFICIENT_FUNDS"));

    const midPortfolio = await repo.getPortfolio("burst-user");
    assert.equal(midPortfolio?.cashBalance, 10_000);
    assert.equal(midPortfolio?.holdings["p-salah"]?.quantity, 9);
    assert.equal(midPortfolio?.entries.length, 3);

    // 4 concurrent SELLs of 4 shares each against 9 held -> exactly 2 fill (8 sold), 2 reject
    const sellResults = await Promise.all(
      Array.from({ length: 4 }, (_, idx) =>
        repo.executeOrder({
          userId: "burst-user",
          side: "SELL",
          playerId: "p-salah",
          quantity: 4,
          matchStatus: "LIVE",
          basePrice: 10_000,
          currentPrice: 10_500,
          nowMs: 1_760_000_400_000 + idx,
        })
      )
    );

    assert.equal(sellResults.filter((r) => r.success).length, 2);
    assert.equal(
      sellResults.filter((r) => !r.success && r.code === "INSUFFICIENT_HOLDINGS")
        .length,
      2
    );

    const finalPortfolio = await repo.getPortfolio("burst-user");
    assert.equal(finalPortfolio?.holdings["p-salah"]?.quantity, 1);
    assert.equal(finalPortfolio?.cashBalance, 10_000 + 8 * 10_500);
    assert.equal(finalPortfolio?.entries.length, 5);
  } finally {
    cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
  }
});

test("5. Unset DATABASE_URL safely falls back to local file ledger without disturbing SimulatedEventsProvider .cache/ledger.json", async () => {
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);

  const simLedgerPath = path.join(process.cwd(), ".cache", "ledger.json");
  const simBefore = fs.existsSync(simLedgerPath)
    ? fs.readFileSync(simLedgerPath, "utf8")
    : null;

  try {
    const defaultRepo = getDefaultLedgerRepository(undefined);
    assert.equal(defaultRepo.kind, "file");

    // Verify isolated disk persistence & cold reload using FileLedgerRepository
    const writer = new FileLedgerRepository({
      ledgerFilePath: TEST_TRADE_LEDGER_PATH,
    });
    const orderRes = await writer.executeOrder({
      userId: "persist-user",
      nickname: "영속유저",
      side: "BUY",
      playerId: "p-kane",
      playerName: "Harry Kane",
      quantity: 2,
      matchStatus: "UPCOMING",
      basePrice: 12_000,
      currentPrice: 12_000,
      nowMs: 1_760_000_500_000,
    });
    assert.equal(orderRes.success, true);

    // Clear in-memory mirror to simulate cold server restart and reload directly from disk JSON
    assert.equal(fs.existsSync(TEST_TRADE_LEDGER_PATH), true);
    FileLedgerRepository.clearMemoryForTesting(TEST_TRADE_LEDGER_PATH);
    const reader = new FileLedgerRepository({
      ledgerFilePath: TEST_TRADE_LEDGER_PATH,
    });
    const restored = await reader.getPortfolio("persist-user", {
      autoCreate: false,
    });
    assert.ok(restored);
    assert.equal(restored.cashBalance, INITIAL_SEED_CASH - 24_000);
    assert.equal(restored.holdings["p-kane"]?.quantity, 2);
    assert.equal(restored.entries.length, 1);

    // Calling ensureUser on an existing user must never overwrite their balance back to 100,000 P
    const ensuredAgain = await reader.ensureUser({
      userId: "persist-user",
      nickname: "영속유저",
    });
    assert.equal(ensuredAgain.cashBalance, INITIAL_SEED_CASH - 24_000);

    // Verify adjustCash & resetUser helpers work cleanly on the repository
    const toppedUp = await reader.adjustCash({
      userId: "persist-user",
      delta: 50_000,
    });
    assert.equal(toppedUp.cashBalance, INITIAL_SEED_CASH - 24_000 + 50_000);

    const resetPortfolio = await reader.resetUser({
      userId: "persist-user",
      initialCash: INITIAL_SEED_CASH,
    });
    assert.equal(resetPortfolio.cashBalance, INITIAL_SEED_CASH);
    assert.deepEqual(resetPortfolio.holdings, {});
    assert.equal(resetPortfolio.entries.length, 0);

    // Confirm SimulatedEventsProvider .cache/ledger.json policy remains completely intact
    const simProvider = new SimulatedEventsProvider();
    const simLedger = simProvider.readLedger();
    assert.equal(simLedger.version, 1);
    assert.equal(typeof simLedger.entries, "object");
    if (simBefore !== null) {
      assert.equal(fs.readFileSync(simLedgerPath, "utf8"), simBefore);
    }
  } finally {
    cleanupTestLedgerFile(TEST_TRADE_LEDGER_PATH);
    clearDefaultLedgerRepositoryForTesting();
    if (prevDbUrl !== undefined) {
      process.env.DATABASE_URL = prevDbUrl;
    }
  }
});

test("6. PostgresLedgerRepository enforces db.transaction + FOR UPDATE locks and rolls back atomically on orderGate/balance errors", async () => {
  interface MockUserRow {
    id: string;
    email: string;
    nickname: string;
    cashBalance: number;
    createdAt: Date;
  }
  interface MockHoldingRow {
    id: number;
    userId: string;
    playerId: string;
    quantity: number;
    avgPrice: number;
    matchContext: ActiveMatchContext | null;
    updatedAt: Date;
  }
  interface MockEntryRow {
    id: string;
    userId: string;
    playerId: string;
    side: "BUY" | "SELL";
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    createdAt: Date;
  }

  let committedState = {
    users: new Map<string, MockUserRow>(),
    holdings: new Map<string, MockHoldingRow>(),
    entries: [] as MockEntryRow[],
  };

  let txCount = 0;
  let commitCount = 0;
  let rollbackCount = 0;
  let forUpdateLockCount = 0;
  let nextHoldingId = 1;

  // Minimal transactional mock Drizzle driver verifying exact table ops, FOR UPDATE locks, and rollback isolation
  const mockDb = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      txCount += 1;
      const working = {
        users: new Map(
          Array.from(committedState.users.entries()).map(([k, v]) => [
            k,
            { ...v },
          ])
        ),
        holdings: new Map(
          Array.from(committedState.holdings.entries()).map(([k, v]) => [
            k,
            { ...v },
          ])
        ),
        entries: committedState.entries.map((e) => ({ ...e })),
      };

      const tx = {
        insert(table: unknown) {
          return {
            values(val: Record<string, unknown>) {
              const execInsert = async (mode: "plain" | "nothing" | "update", setObj?: Record<string, unknown>) => {
                if (table === users) {
                  const id = String(val.id);
                  if (!working.users.has(id)) {
                    working.users.set(id, {
                      id,
                      email: String(val.email),
                      nickname: String(val.nickname),
                      cashBalance: Number(val.cashBalance),
                      createdAt: new Date(),
                    });
                  }
                  return;
                }
                if (table === holdings) {
                  const key = `${String(val.userId)}:${String(val.playerId)}`;
                  const existing = working.holdings.get(key);
                  if (existing && mode === "update" && setObj) {
                    working.holdings.set(key, {
                      ...existing,
                      quantity: Number(setObj.quantity),
                      avgPrice: Number(setObj.avgPrice),
                      matchContext: (setObj.matchContext as ActiveMatchContext | null) ?? null,
                      updatedAt: (setObj.updatedAt as Date) ?? new Date(),
                    });
                  } else if (!existing) {
                    working.holdings.set(key, {
                      id: nextHoldingId++,
                      userId: String(val.userId),
                      playerId: String(val.playerId),
                      quantity: Number(val.quantity),
                      avgPrice: Number(val.avgPrice),
                      matchContext: (val.matchContext as ActiveMatchContext | null) ?? null,
                      updatedAt: (val.updatedAt as Date) ?? new Date(),
                    });
                  }
                  return;
                }
                if (table === ledgerEntries) {
                  working.entries.unshift({
                    id: String(val.id),
                    userId: String(val.userId),
                    playerId: String(val.playerId),
                    side: val.side as "BUY" | "SELL",
                    quantity: Number(val.quantity),
                    unitPrice: Number(val.unitPrice),
                    totalAmount: Number(val.totalAmount),
                    createdAt: (val.createdAt as Date) ?? new Date(),
                  });
                }
              };

              const builder = {
                onConflictDoNothing: async () => execInsert("nothing"),
                onConflictDoUpdate: async (cfg: { set: Record<string, unknown> }) =>
                  execInsert("update", cfg.set),
                then: (
                  resolve: (v: unknown) => void,
                  reject: (e: unknown) => void
                ) => execInsert("plain").then(resolve, reject),
              };
              return builder;
            },
          };
        },
        select() {
          return {
            from(table: unknown) {
              const runSelect = () => {
                if (table === users) return Array.from(working.users.values());
                if (table === holdings) return Array.from(working.holdings.values());
                if (table === ledgerEntries) return [...working.entries];
                return [];
              };
              return {
                where() {
                  return {
                    for(mode: string) {
                      if (mode === "update") forUpdateLockCount += 1;
                      return Promise.resolve(runSelect());
                    },
                    orderBy() {
                      return {
                        limit: async (n: number) => runSelect().slice(0, n),
                      };
                    },
                    limit: async (n: number) => runSelect().slice(0, n),
                    then: (
                      resolve: (v: unknown) => void,
                      reject: (e: unknown) => void
                    ) => Promise.resolve(runSelect()).then(resolve, reject),
                  };
                },
              };
            },
          };
        },
        update(table: unknown) {
          return {
            set(setObj: Record<string, unknown>) {
              return {
                where() {
                  return {
                    returning: async () => {
                      if (table === users) {
                        const row = Array.from(working.users.values())[0];
                        if (!row) return [];
                        // Extract numeric delta from sql`${col} - ${n}` or `+` expression
                        const expr = setObj.cashBalance as {
                          queryChunks?: Array<{ value?: string[] } | number>;
                        };
                        if (typeof setObj.cashBalance === "number") {
                          row.cashBalance = setObj.cashBalance;
                        } else if (expr?.queryChunks) {
                          const opChunk = expr.queryChunks.find(
                            (c): c is { value: string[] } =>
                              typeof c === "object" &&
                              c !== null &&
                              "value" in c &&
                              Array.isArray(c.value) &&
                              (c.value.join("").includes("-") ||
                                c.value.join("").includes("+"))
                          );
                          const numChunk = expr.queryChunks.find(
                            (c): c is number => typeof c === "number"
                          );
                          if (opChunk && numChunk !== undefined) {
                            if (opChunk.value.join("").includes("-")) {
                              if (row.cashBalance < numChunk) return [];
                              row.cashBalance -= numChunk;
                            } else {
                              row.cashBalance += numChunk;
                            }
                          }
                        }
                        return [row];
                      }
                      if (table === holdings) {
                        const row = Array.from(working.holdings.values())[0];
                        if (!row) return [];
                        const expr = setObj.quantity as {
                          queryChunks?: Array<number>;
                        };
                        const numChunk = expr?.queryChunks?.find(
                          (c): c is number => typeof c === "number"
                        );
                        if (numChunk !== undefined) {
                          if (row.quantity < numChunk) return [];
                          row.quantity -= numChunk;
                        }
                        return [row];
                      }
                      return [];
                    },
                  };
                },
              };
            },
          };
        },
        delete(table: unknown) {
          return {
            where() {
              return {
                returning: async () => {
                  if (table === holdings) {
                    const first = Array.from(working.holdings.entries())[0];
                    if (!first) return [];
                    working.holdings.delete(first[0]);
                    return [first[1]];
                  }
                  return [];
                },
              };
            },
          };
        },
      };

      try {
        const res = await fn(tx);
        committedState = working;
        commitCount += 1;
        return res;
      } catch (err) {
        rollbackCount += 1;
        throw err;
      }
    },
  } as unknown as PitchTradeDb;

  const pgRepo = new PostgresLedgerRepository(mockDb);

  // 1) Valid BUY commits inside transaction with FOR UPDATE locks on users & holdings
  const okBuy = await pgRepo.executeOrder({
    userId: "pg-trader",
    nickname: "PG트레이더",
    side: "BUY",
    playerId: "af-p-1002",
    playerName: "Bukayo Saka",
    quantity: 3,
    matchStatus: "LIVE",
    basePrice: 10_000,
    currentPrice: 10_000,
    nowMs: 1_760_000_600_000,
  });

  assert.equal(okBuy.success, true);
  assert.equal(txCount, 1);
  assert.equal(commitCount, 1);
  assert.equal(rollbackCount, 0);
  assert.equal(forUpdateLockCount, 2); // locked users + holdings
  assert.equal(committedState.users.get("pg-trader")?.cashBalance, 70_000);
  assert.equal(committedState.holdings.get("pg-trader:af-p-1002")?.quantity, 3);
  assert.equal(committedState.entries.length, 1);

  // 2) Rejected BUY (+15% upper cap) throws inside tx -> triggers DB ROLLBACK with zero committed changes
  const capFail = await pgRepo.executeOrder({
    userId: "pg-trader",
    side: "BUY",
    playerId: "af-p-1002",
    quantity: 1,
    matchStatus: "LIVE",
    basePrice: 10_000,
    currentPrice: 11_500,
    nowMs: 1_760_000_601_000,
  });

  assert.equal(capFail.success, false);
  assert.equal(capFail.code, "ORDER_GATE_REJECTED");
  assert.equal(rollbackCount, 1);
  assert.equal(commitCount, 1);
  assert.equal(committedState.users.get("pg-trader")?.cashBalance, 70_000);
  assert.equal(committedState.holdings.get("pg-trader:af-p-1002")?.quantity, 3);
  assert.equal(committedState.entries.length, 1);

  // 3) Rejected BUY (insufficient cash: 8 * 10,000 = 80,000 > 70,000) -> triggers DB ROLLBACK
  const cashFail = await pgRepo.executeOrder({
    userId: "pg-trader",
    side: "BUY",
    playerId: "af-p-1002",
    quantity: 8,
    matchStatus: "LIVE",
    basePrice: 10_000,
    currentPrice: 10_000,
    nowMs: 1_760_000_602_000,
  });

  assert.equal(cashFail.success, false);
  assert.equal(cashFail.code, "INSUFFICIENT_FUNDS");
  assert.equal(rollbackCount, 2);
  assert.equal(committedState.users.get("pg-trader")?.cashBalance, 70_000);
  assert.equal(committedState.entries.length, 1);

  // 4) Full SELL (3 shares @ 11,000 P) commits, deletes 0-qty holding, credits +33,000 P -> 103,000 P
  const fullSell = await pgRepo.executeOrder({
    userId: "pg-trader",
    side: "SELL",
    playerId: "af-p-1002",
    quantity: 3,
    matchStatus: "LIVE",
    basePrice: 10_000,
    currentPrice: 11_000,
    nowMs: 1_760_000_603_000,
  });

  assert.equal(fullSell.success, true);
  assert.equal(fullSell.realizedPnL, 3_000);
  assert.equal(commitCount, 2);
  assert.equal(committedState.users.get("pg-trader")?.cashBalance, 103_000);
  assert.equal(committedState.holdings.size, 0);
  assert.equal(committedState.entries.length, 2);
});
