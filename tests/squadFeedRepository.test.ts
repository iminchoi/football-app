import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PitchTradeDb } from "../src/db/index.ts";
import {
  holdings,
  squadComments,
  squadPosts,
  squadSlots,
  users,
} from "../src/db/schema.ts";
import {
  FileLedgerRepository,
  INITIAL_SEED_CASH,
} from "../src/lib/repositories/ledgerRepository.ts";
import {
  FileSquadFeedRepository,
  PostgresSquadFeedRepository,
  clearDefaultSquadFeedRepositoryForTesting,
  evaluateSlotSaleStatus,
  getDefaultSquadFeedRepository,
  type SquadSlotDraftInput,
} from "../src/lib/repositories/squadFeedRepository.ts";
import { SimulatedEventsProvider } from "../src/lib/providers/index.ts";
import type { Position } from "../src/types/index.ts";

const TEST_LEDGER_FILE = path.join(
  os.tmpdir(),
  "pitchtrade-squad-test-ledger.json"
);
const TEST_SQUAD_FILE = path.join(
  os.tmpdir(),
  "pitchtrade-squad-test-feed.json"
);

interface SeedPlayerSpec {
  playerId: string;
  playerName: string;
  position: Position;
  quantity: number;
  price: number;
  backNumber: number;
}

const ROSTER_12: SeedPlayerSpec[] = [
  { playerId: "p-gk-1", playerName: "David Raya", position: "GK", quantity: 2, price: 8_000, backNumber: 22 },
  { playerId: "p-df-1", playerName: "William Saliba", position: "CB", quantity: 3, price: 10_000, backNumber: 2 },
  { playerId: "p-df-2", playerName: "Gabriel Magalhaes", position: "CB", quantity: 2, price: 9_500, backNumber: 6 },
  { playerId: "p-df-3", playerName: "Ben White", position: "RB", quantity: 1, price: 9_000, backNumber: 4 },
  { playerId: "p-df-4", playerName: "Jurrien Timber", position: "LB", quantity: 2, price: 9_000, backNumber: 12 },
  { playerId: "p-mf-1", playerName: "Declan Rice", position: "DM", quantity: 4, price: 11_000, backNumber: 41 },
  { playerId: "p-mf-2", playerName: "Martin Odegaard", position: "CAM", quantity: 3, price: 12_000, backNumber: 8 },
  { playerId: "p-mf-3", playerName: "Mikel Merino", position: "CM", quantity: 2, price: 9_000, backNumber: 23 },
  { playerId: "p-fw-1", playerName: "Bukayo Saka", position: "RW", quantity: 5, price: 12_000, backNumber: 7 },
  { playerId: "p-fw-2", playerName: "Gabriel Martinelli", position: "LW", quantity: 2, price: 10_000, backNumber: 11 },
  { playerId: "p-fw-3", playerName: "Kai Havertz", position: "ST", quantity: 2, price: 11_000, backNumber: 29 },
  // 12th owned player (outfield) for >11 & no-GK validation tests
  { playerId: "p-fw-4", playerName: "Leandro Trossard", position: "LW", quantity: 1, price: 9_500, backNumber: 19 },
];

function toDraftSlot(spec: SeedPlayerSpec, slotIndex: number): SquadSlotDraftInput {
  return {
    slotIndex,
    playerId: spec.playerId,
    playerName: spec.playerName,
    teamName: "Arsenal",
    teamShort: "ARS",
    teamColor: "#EF0107",
    position: spec.position,
    backNumber: spec.backNumber,
    currentPrice: spec.price,
  };
}

function cleanupFiles(): void {
  FileLedgerRepository.clearMemoryForTesting(TEST_LEDGER_FILE);
  FileSquadFeedRepository.clearMemoryForTesting(TEST_SQUAD_FILE);
  for (const fp of [TEST_LEDGER_FILE, TEST_SQUAD_FILE]) {
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      // Ignore cleanup issues
    }
  }
}

async function seedOwnedRoster(
  ledgerRepo: FileLedgerRepository,
  userId: string
): Promise<void> {
  await ledgerRepo.ensureUser({
    userId,
    nickname: userId,
    initialCash: 5_000_000,
  });
  for (let i = 0; i < ROSTER_12.length; i += 1) {
    const spec = ROSTER_12[i];
    const res = await ledgerRepo.executeOrder({
      userId,
      side: "BUY",
      playerId: spec.playerId,
      playerName: spec.playerName,
      quantity: spec.quantity,
      matchStatus: "LIVE",
      basePrice: spec.price,
      currentPrice: spec.price,
      nowMs: 1_765_000_000_000 + i * 1_000,
    });
    assert.equal(res.success, true);
  }
}

test("1. Server squad publish strictly rejects <11, >11, duplicate players, unowned players, missing GK, and empty title", async () => {
  cleanupFiles();
  try {
    const ledgerRepo = new FileLedgerRepository({
      ledgerFilePath: TEST_LEDGER_FILE,
    });
    const squadRepo = new FileSquadFeedRepository({
      feedFilePath: TEST_SQUAD_FILE,
      ledgerRepo,
    });

    await seedOwnedRoster(ledgerRepo, "manager-a");
    const valid11 = ROSTER_12.slice(0, 11).map((spec, idx) =>
      toDraftSlot(spec, idx)
    );

    // 1-a) Empty title
    const emptyTitle = await squadRepo.createPost({
      authorId: "manager-a",
      authorName: "감독A",
      title: "   ",
      formation: "4-3-3",
      slots: valid11,
    });
    assert.equal(emptyTitle.success, false);
    assert.equal(emptyTitle.code, "EMPTY_TITLE");

    // 1-b) Less than 11 players (10 players)
    const under11 = await squadRepo.createPost({
      authorId: "manager-a",
      title: "10명 스쿼드",
      formation: "4-3-3",
      slots: valid11.slice(0, 10),
    });
    assert.equal(under11.success, false);
    assert.equal(under11.code, "INVALID_COUNT");

    // 1-c) More than 11 players (12 players)
    const over11 = await squadRepo.createPost({
      authorId: "manager-a",
      title: "12명 스쿼드",
      formation: "4-3-3",
      slots: ROSTER_12.map((spec, idx) => toDraftSlot(spec, idx)),
    });
    assert.equal(over11.success, false);
    assert.equal(over11.code, "INVALID_COUNT");

    // 1-d) Duplicate player (11 entries with p-fw-1 repeated)
    const duplicateSlots = [...valid11.slice(0, 10), toDraftSlot(ROSTER_12[8], 10)];
    const dupRes = await squadRepo.createPost({
      authorId: "manager-a",
      title: "중복 스쿼드",
      formation: "4-3-3",
      slots: duplicateSlots,
    });
    assert.equal(dupRes.success, false);
    assert.equal(dupRes.code, "DUPLICATE_PLAYER");

    // 1-e) Unowned player included
    const unownedSlots: SquadSlotDraftInput[] = [
      ...valid11.slice(0, 10),
      {
        slotIndex: 10,
        playerId: "p-not-owned",
        playerName: "Unowned Striker",
        teamName: "Real Madrid",
        teamShort: "RMA",
        teamColor: "#FFFFFF",
        position: "ST",
        backNumber: 9,
        currentPrice: 15_000,
      },
    ];
    const unownedRes = await squadRepo.createPost({
      authorId: "manager-a",
      title: "미보유 포함",
      formation: "4-3-3",
      slots: unownedSlots,
    });
    assert.equal(unownedRes.success, false);
    assert.equal(unownedRes.code, "NOT_OWNED");

    // 1-f) Missing GK (11 owned outfielders, index 1..11)
    const noGkSlots = ROSTER_12.slice(1, 12).map((spec, idx) =>
      toDraftSlot(spec, idx)
    );
    const noGkRes = await squadRepo.createPost({
      authorId: "manager-a",
      title: "GK 없는 스쿼드",
      formation: "4-3-3",
      slots: noGkSlots,
    });
    assert.equal(noGkRes.success, false);
    assert.equal(noGkRes.code, "MISSING_GK");

    // Verify 0 posts persisted after all rejections
    assert.equal((await squadRepo.listPosts()).length, 0);

    // 1-g) Valid 11 distinct owned players with GK succeeds and snapshots real holdings
    const okRes = await squadRepo.createPost({
      authorId: "manager-a",
      authorName: "감독A",
      title: "아스널 베스트 11",
      description: "GK 포함 실보유 스쿼드",
      formation: "4-3-3",
      slots: valid11,
      nowMs: 1_765_000_100_000,
    });
    assert.equal(okRes.success, true);
    assert.ok(okRes.post);
    assert.equal(okRes.post.slots.length, 11);
    assert.equal(okRes.post.saleSummary.status, "HOLDING");
    assert.equal(okRes.post.saleSummary.label, "전원 보유 중");
    const sakaSlot = okRes.post.slots.find((s) => s.playerId === "p-fw-1");
    assert.equal(sakaSlot?.snapshotQuantity, 5);
    assert.equal(sakaSlot?.currentQuantity, 5);
    assert.equal(sakaSlot?.saleStatus, "HOLDING");
  } finally {
    cleanupFiles();
  }
});

test("2. Dynamic sale badges accurately reflect HOLDING, PARTIAL_SOLD, and FULL_SOLD as author holdings change", async () => {
  cleanupFiles();
  try {
    assert.equal(evaluateSlotSaleStatus(5, 5).saleStatus, "HOLDING");
    assert.equal(evaluateSlotSaleStatus(5, 7).saleStatus, "HOLDING");
    assert.equal(evaluateSlotSaleStatus(5, 3).saleStatus, "PARTIAL_SOLD");
    assert.equal(evaluateSlotSaleStatus(5, 0).saleStatus, "FULL_SOLD");

    const ledgerRepo = new FileLedgerRepository({
      ledgerFilePath: TEST_LEDGER_FILE,
    });
    const squadRepo = new FileSquadFeedRepository({
      feedFilePath: TEST_SQUAD_FILE,
      ledgerRepo,
    });

    await seedOwnedRoster(ledgerRepo, "badge-author");
    const valid11 = ROSTER_12.slice(0, 11).map((spec, idx) =>
      toDraftSlot(spec, idx)
    );

    const created = await squadRepo.createPost({
      authorId: "badge-author",
      authorName: "배지테스트",
      title: "실시간 매도 배지 스쿼드",
      formation: "4-2-3-1",
      slots: valid11,
      nowMs: 1_765_000_200_000,
    });
    assert.equal(created.success, true);
    const postId = created.post!.id;

    // 1) Partial sell: Bukayo Saka (p-fw-1) 5 -> 3 shares
    const partialSell = await ledgerRepo.executeOrder({
      userId: "badge-author",
      side: "SELL",
      playerId: "p-fw-1",
      quantity: 2,
      matchStatus: "LIVE",
      basePrice: 12_000,
      currentPrice: 12_500,
      nowMs: 1_765_000_210_000,
    });
    assert.equal(partialSell.success, true);

    const afterPartial = await squadRepo.getPostById(postId);
    assert.ok(afterPartial);
    assert.equal(afterPartial.saleSummary.status, "PARTIAL_SOLD");
    assert.equal(afterPartial.saleSummary.label, "일부 매도");
    assert.equal(afterPartial.saleSummary.partialSoldCount, 1);
    assert.equal(afterPartial.saleSummary.fullSoldCount, 0);
    assert.equal(afterPartial.saleSummary.holdingCount, 10);

    const sakaAfterPartial = afterPartial.slots.find(
      (s) => s.playerId === "p-fw-1"
    );
    assert.equal(sakaAfterPartial?.snapshotQuantity, 5);
    assert.equal(sakaAfterPartial?.currentQuantity, 3);
    assert.equal(sakaAfterPartial?.soldQuantity, 2);
    assert.equal(sakaAfterPartial?.saleStatus, "PARTIAL_SOLD");
    assert.equal(sakaAfterPartial?.saleLabel, "일부 매도");

    // 2) Full sell one player: Declan Rice (p-mf-1) 4 -> 0 shares
    const fullSellRice = await ledgerRepo.executeOrder({
      userId: "badge-author",
      side: "SELL",
      playerId: "p-mf-1",
      quantity: 4,
      matchStatus: "LIVE",
      basePrice: 11_000,
      currentPrice: 11_200,
      nowMs: 1_765_000_220_000,
    });
    assert.equal(fullSellRice.success, true);

    const afterRiceSold = await squadRepo.getPostById(postId);
    assert.ok(afterRiceSold);
    assert.equal(afterRiceSold.saleSummary.status, "PARTIAL_SOLD");
    assert.equal(afterRiceSold.saleSummary.partialSoldCount, 1);
    assert.equal(afterRiceSold.saleSummary.fullSoldCount, 1);
    assert.equal(afterRiceSold.saleSummary.holdingCount, 9);

    const riceSlot = afterRiceSold.slots.find((s) => s.playerId === "p-mf-1");
    assert.equal(riceSlot?.snapshotQuantity, 4);
    assert.equal(riceSlot?.currentQuantity, 0);
    assert.equal(riceSlot?.saleStatus, "FULL_SOLD");
    assert.equal(riceSlot?.saleLabel, "전량 매도");

    // 3) Full sell ALL remaining 10 players -> entire squad becomes FULL_SOLD
    for (let i = 0; i < 11; i += 1) {
      const spec = ROSTER_12[i];
      const portfolio = await ledgerRepo.getPortfolio("badge-author");
      const qtyLeft = portfolio?.holdings[spec.playerId]?.quantity ?? 0;
      if (qtyLeft <= 0) continue;
      const res = await ledgerRepo.executeOrder({
        userId: "badge-author",
        side: "SELL",
        playerId: spec.playerId,
        quantity: qtyLeft,
        matchStatus: "LIVE",
        basePrice: spec.price,
        currentPrice: spec.price,
        nowMs: 1_765_000_230_000 + i * 100,
      });
      assert.equal(res.success, true);
    }

    const afterAllSold = await squadRepo.getPostById(postId);
    assert.ok(afterAllSold);
    assert.equal(afterAllSold.saleSummary.status, "FULL_SOLD");
    assert.equal(afterAllSold.saleSummary.label, "전량 매도");
    assert.equal(afterAllSold.saleSummary.fullSoldCount, 11);
    assert.equal(afterAllSold.saleSummary.holdingCount, 0);
    assert.ok(afterAllSold.slots.every((s) => s.saleStatus === "FULL_SOLD"));
  } finally {
    cleanupFiles();
  }
});

test("3. Supports multiple squads per author, author-only delete, immutability, and comment create/delete permissions", async () => {
  cleanupFiles();
  try {
    const ledgerRepo = new FileLedgerRepository({
      ledgerFilePath: TEST_LEDGER_FILE,
    });
    const squadRepo = new FileSquadFeedRepository({
      feedFilePath: TEST_SQUAD_FILE,
      ledgerRepo,
    });

    await seedOwnedRoster(ledgerRepo, "alice");
    const valid11 = ROSTER_12.slice(0, 11).map((spec, idx) =>
      toDraftSlot(spec, idx)
    );

    // Immutability check: no updatePost / editPost method exists on repository
    assert.equal("updatePost" in squadRepo, false);
    assert.equal("editPost" in squadRepo, false);

    // Publish 2 distinct squads by the same author
    const post1 = await squadRepo.createPost({
      authorId: "alice",
      authorName: "앨리스",
      title: "1군 공격형 4-3-3",
      formation: "4-3-3",
      slots: valid11,
      nowMs: 1_765_000_300_000,
    });
    const post2 = await squadRepo.createPost({
      authorId: "alice",
      authorName: "앨리스",
      title: "2군 밸런스 4-2-3-1",
      formation: "4-2-3-1",
      slots: valid11,
      nowMs: 1_765_000_310_000,
    });
    assert.equal(post1.success, true);
    assert.equal(post2.success, true);

    const listAll = await squadRepo.listPosts();
    assert.equal(listAll.length, 2);
    assert.equal(listAll[0].id, post2.post!.id); // Newest first

    // Non-author delete rejected
    const forbiddenDel = await squadRepo.deletePost({
      postId: post1.post!.id,
      requesterId: "bob",
    });
    assert.equal(forbiddenDel.success, false);
    assert.equal(forbiddenDel.code, "FORBIDDEN");
    assert.equal((await squadRepo.listPosts()).length, 2);

    // Comments: empty rejected, Bob comments, Charlie cannot delete, Bob deletes own, Alice deletes another
    const emptyComment = await squadRepo.addComment({
      postId: post1.post!.id,
      authorId: "bob",
      authorName: "밥",
      content: "   ",
    });
    assert.equal(emptyComment.success, false);
    assert.equal(emptyComment.code, "EMPTY_COMMENT");

    const c1 = await squadRepo.addComment({
      postId: post1.post!.id,
      authorId: "bob",
      authorName: "밥",
      content: "미드필드 밸런스가 아주 탄탄하네요!",
      nowMs: 1_765_000_320_000,
    });
    assert.equal(c1.success, true);
    assert.ok(c1.comment);

    const charlieDel = await squadRepo.deleteComment({
      postId: post1.post!.id,
      commentId: c1.comment.id,
      requesterId: "charlie",
    });
    assert.equal(charlieDel.success, false);
    assert.equal(charlieDel.code, "FORBIDDEN");

    const bobDel = await squadRepo.deleteComment({
      postId: post1.post!.id,
      commentId: c1.comment.id,
      requesterId: "bob",
    });
    assert.equal(bobDel.success, true);

    const c2 = await squadRepo.addComment({
      postId: post1.post!.id,
      authorId: "charlie",
      authorName: "찰리",
      content: "후반 교체 카드도 궁금합니다.",
      nowMs: 1_765_000_330_000,
    });
    assert.equal(c2.success, true);

    // Post author Alice can moderate/delete comment on her own post
    const aliceDelComment = await squadRepo.deleteComment({
      postId: post1.post!.id,
      commentId: c2.comment!.id,
      requesterId: "alice",
    });
    assert.equal(aliceDelComment.success, true);

    // Author deletes own post1 -> succeeds, post2 remains intact
    const authorDel = await squadRepo.deletePost({
      postId: post1.post!.id,
      requesterId: "alice",
    });
    assert.equal(authorDel.success, true);

    const remaining = await squadRepo.listPosts();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, post2.post!.id);
  } finally {
    cleanupFiles();
  }
});

test("4. Unset DATABASE_URL falls back cleanly to FileSquadFeedRepository with disk persistence and .cache/ledger.json isolation", async () => {
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  cleanupFiles();

  const simLedgerPath = path.join(process.cwd(), ".cache", "ledger.json");
  const simBefore = fs.existsSync(simLedgerPath)
    ? fs.readFileSync(simLedgerPath, "utf8")
    : null;

  try {
    const defaultRepo = getDefaultSquadFeedRepository(undefined);
    assert.equal(defaultRepo.kind, "file");

    const ledgerRepo = new FileLedgerRepository({
      ledgerFilePath: TEST_LEDGER_FILE,
    });
    const writer = new FileSquadFeedRepository({
      feedFilePath: TEST_SQUAD_FILE,
      ledgerRepo,
    });

    await seedOwnedRoster(ledgerRepo, "disk-user");
    const valid11 = ROSTER_12.slice(0, 11).map((spec, idx) =>
      toDraftSlot(spec, idx)
    );
    const created = await writer.createPost({
      authorId: "disk-user",
      authorName: "디스크유저",
      title: "영속 스쿼드",
      formation: "4-4-2",
      slots: valid11,
      nowMs: 1_765_000_400_000,
    });
    assert.equal(created.success, true);
    await writer.addComment({
      postId: created.post!.id,
      authorId: "viewer-1",
      authorName: "관전자",
      content: "새로고침 후에도 유지되어야 합니다",
      nowMs: 1_765_000_410_000,
    });

    // Clear in-memory mirror to simulate cold server restart and reload from disk JSON
    assert.equal(fs.existsSync(TEST_SQUAD_FILE), true);
    FileSquadFeedRepository.clearMemoryForTesting(TEST_SQUAD_FILE);

    const reader = new FileSquadFeedRepository({
      feedFilePath: TEST_SQUAD_FILE,
      ledgerRepo,
    });
    const reloaded = await reader.listPosts();
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].title, "영속 스쿼드");
    assert.equal(reloaded[0].slots.length, 11);
    assert.equal(reloaded[0].comments.length, 1);
    assert.equal(reloaded[0].saleSummary.status, "HOLDING");

    // Verify SimulatedEventsProvider .cache/ledger.json remains untouched
    const simProvider = new SimulatedEventsProvider();
    assert.equal(simProvider.readLedger().version, 1);
    if (simBefore !== null) {
      assert.equal(fs.readFileSync(simLedgerPath, "utf8"), simBefore);
    }
  } finally {
    cleanupFiles();
    clearDefaultSquadFeedRepositoryForTesting();
    if (prevDbUrl !== undefined) {
      process.env.DATABASE_URL = prevDbUrl;
    }
  }
});

test("5. PostgresSquadFeedRepository validates holdings inside db.transaction, rolls back invalid drafts, evaluates live badges, and enforces author-only delete", async () => {
  interface PgUserRow {
    id: string;
    email: string;
    nickname: string;
    cashBalance: number;
    createdAt: Date;
  }
  interface PgHoldingRow {
    id: number;
    userId: string;
    playerId: string;
    quantity: number;
    avgPrice: number;
    matchContext: null;
    updatedAt: Date;
  }
  interface PgPostRow {
    id: string;
    authorId: string;
    authorName: string;
    title: string;
    description: string;
    formation: string;
    createdAt: Date;
  }
  interface PgSlotRow {
    id: number;
    postId: string;
    slotIndex: number;
    slotLabel: string;
    playerId: string;
    playerName: string;
    teamName: string;
    teamShort: string;
    teamColor: string;
    position: Position;
    backNumber: number;
    snapshotQuantity: number;
    snapshotPrice: number;
    avgBuyPrice: number;
  }
  interface PgCommentRow {
    id: string;
    postId: string;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: Date;
  }

  let state = {
    users: new Map<string, PgUserRow>([
      [
        "pg-alice",
        {
          id: "pg-alice",
          email: "pg-alice@pitchtrade.local",
          nickname: "PG앨리스",
          cashBalance: INITIAL_SEED_CASH,
          createdAt: new Date(),
        },
      ],
    ]),
    holdings: ROSTER_12.slice(0, 11).map((spec, idx) => ({
      id: idx + 1,
      userId: "pg-alice",
      playerId: spec.playerId,
      quantity: spec.quantity,
      avgPrice: spec.price,
      matchContext: null,
      updatedAt: new Date(),
    })) as PgHoldingRow[],
    posts: [] as PgPostRow[],
    slots: [] as PgSlotRow[],
    comments: [] as PgCommentRow[],
  };

  let commitCount = 0;
  let rollbackCount = 0;
  let nextSlotId = 1;

  const makeQueryApi = (dbRef: typeof state) => ({
    insert(table: unknown) {
      return {
        values(val: Record<string, unknown> | Array<Record<string, unknown>>) {
          const run = async () => {
            const list = Array.isArray(val) ? val : [val];
            if (table === users) {
              for (const row of list) {
                const id = String(row.id);
                if (!dbRef.users.has(id)) {
                  dbRef.users.set(id, {
                    id,
                    email: String(row.email),
                    nickname: String(row.nickname),
                    cashBalance: Number(row.cashBalance),
                    createdAt: new Date(),
                  });
                }
              }
            } else if (table === squadPosts) {
              for (const row of list) {
                dbRef.posts.unshift({
                  id: String(row.id),
                  authorId: String(row.authorId),
                  authorName: String(row.authorName),
                  title: String(row.title),
                  description: String(row.description ?? ""),
                  formation: String(row.formation),
                  createdAt: (row.createdAt as Date) ?? new Date(),
                });
              }
            } else if (table === squadSlots) {
              for (const row of list) {
                dbRef.slots.push({
                  id: nextSlotId++,
                  postId: String(row.postId),
                  slotIndex: Number(row.slotIndex),
                  slotLabel: String(row.slotLabel),
                  playerId: String(row.playerId),
                  playerName: String(row.playerName),
                  teamName: String(row.teamName),
                  teamShort: String(row.teamShort),
                  teamColor: String(row.teamColor),
                  position: row.position as Position,
                  backNumber: Number(row.backNumber),
                  snapshotQuantity: Number(row.snapshotQuantity),
                  snapshotPrice: Number(row.snapshotPrice),
                  avgBuyPrice: Number(row.avgBuyPrice),
                });
              }
            } else if (table === squadComments) {
              for (const row of list) {
                dbRef.comments.push({
                  id: String(row.id),
                  postId: String(row.postId),
                  authorId: String(row.authorId),
                  authorName: String(row.authorName),
                  content: String(row.content),
                  createdAt: (row.createdAt as Date) ?? new Date(),
                });
              }
            }
          };
          return {
            onConflictDoNothing: async () => run(),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              run().then(resolve, reject),
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          const allRows = (): unknown[] => {
            if (table === holdings) return [...dbRef.holdings];
            if (table === squadPosts) return [...dbRef.posts];
            if (table === squadSlots) return [...dbRef.slots];
            if (table === squadComments) return [...dbRef.comments];
            return [];
          };
          const chain = {
            where: () => chain,
            orderBy: () => chain,
            limit: async (n: number) => allRows().slice(0, n),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              Promise.resolve(allRows()).then(resolve, reject),
          };
          return chain;
        },
      };
    },
    delete(table: unknown) {
      return {
        where: async () => {
          if (table === squadPosts) {
            const removed = dbRef.posts.shift();
            if (removed) {
              dbRef.slots = dbRef.slots.filter((s) => s.postId !== removed.id);
              dbRef.comments = dbRef.comments.filter(
                (c) => c.postId !== removed.id
              );
            }
          } else if (table === squadComments) {
            dbRef.comments.pop();
          }
        },
      };
    },
  });

  const mockDb = {
    ...makeQueryApi(state),
    select() {
      return makeQueryApi(state).select();
    },
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const working = {
        users: new Map(
          Array.from(state.users.entries()).map(([k, v]) => [k, { ...v }])
        ),
        holdings: state.holdings.map((h) => ({ ...h })),
        posts: state.posts.map((p) => ({ ...p })),
        slots: state.slots.map((s) => ({ ...s })),
        comments: state.comments.map((c) => ({ ...c })),
      };
      try {
        const res = await fn(makeQueryApi(working));
        state = working;
        commitCount += 1;
        return res;
      } catch (err) {
        rollbackCount += 1;
        throw err;
      }
    },
  } as unknown as PitchTradeDb;

  const pgRepo = new PostgresSquadFeedRepository(mockDb);
  const valid11 = ROSTER_12.slice(0, 11).map((spec, idx) =>
    toDraftSlot(spec, idx)
  );

  // 1) Invalid draft (unowned player) rolls back transaction with 0 inserts
  const badDraft = await pgRepo.createPost({
    authorId: "pg-alice",
    title: "미보유 스쿼드",
    slots: [...valid11.slice(0, 10), toDraftSlot(ROSTER_12[11], 10)],
  });
  assert.equal(badDraft.success, false);
  assert.equal(badDraft.code, "NOT_OWNED");
  assert.equal(rollbackCount, 1);
  assert.equal(state.posts.length, 0);
  assert.equal(state.slots.length, 0);

  // 2) Valid publish commits 1 squad_post + 11 squad_slots
  const okPublish = await pgRepo.createPost({
    authorId: "pg-alice",
    authorName: "PG앨리스",
    title: "PG 베스트 11",
    formation: "4-3-3",
    slots: valid11,
    nowMs: 1_765_000_500_000,
  });
  assert.equal(okPublish.success, true);
  assert.equal(commitCount, 1);
  assert.equal(state.posts.length, 1);
  assert.equal(state.slots.length, 11);

  // 3) Mutate holdings in DB (Saka 5 -> 2 PARTIAL_SOLD, Rice 4 -> 0 FULL_SOLD) -> listPosts reflects live badges
  state.holdings = state.holdings
    .map((h) => (h.playerId === "p-fw-1" ? { ...h, quantity: 2 } : h))
    .filter((h) => h.playerId !== "p-mf-1");

  const listed = await pgRepo.listPosts();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].saleSummary.status, "PARTIAL_SOLD");
  assert.equal(listed[0].saleSummary.partialSoldCount, 1);
  assert.equal(listed[0].saleSummary.fullSoldCount, 1);
  assert.equal(
    listed[0].slots.find((s) => s.playerId === "p-fw-1")?.saleStatus,
    "PARTIAL_SOLD"
  );
  assert.equal(
    listed[0].slots.find((s) => s.playerId === "p-mf-1")?.saleStatus,
    "FULL_SOLD"
  );

  // 4) Non-author delete rolls back with FORBIDDEN; author delete commits and cascades slots
  const badDel = await pgRepo.deletePost({
    postId: okPublish.post!.id,
    requesterId: "pg-bob",
  });
  assert.equal(badDel.success, false);
  assert.equal(badDel.code, "FORBIDDEN");
  assert.equal(rollbackCount, 2);
  assert.equal(state.posts.length, 1);

  const okDel = await pgRepo.deletePost({
    postId: okPublish.post!.id,
    requesterId: "pg-alice",
  });
  assert.equal(okDel.success, true);
  assert.equal(state.posts.length, 0);
  assert.equal(state.slots.length, 0);
});
