import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as squadFeedModule from "../src/lib/squadFeed.ts";
import {
  REQUIRED_SQUAD_SIZE,
  addSquadFeedComment,
  createSquadFeedPost,
  deleteSquadFeedComment,
  deleteSquadFeedPost,
  resolveSquadAuthorHoldings,
  resolveSquadFeedSaleSummary,
  resolveSquadPlayerSaleStatus,
  sanitizePersistedSquadFeeds,
  validateSquadDraft,
} from "../src/lib/squadFeed.ts";
import type {
  Holding,
  Player,
  PointTransaction,
  Position,
  SquadFeedPost,
} from "../src/types/index.ts";

function makePlayer(
  id: string,
  name: string,
  position: Position,
  price = 10_000,
  backNumber = 10
): Player {
  return {
    id,
    name,
    englishName: name,
    nationalTeam: "잉글랜드",
    matchId: "m-test-1",
    teamId: "t-test",
    teamName: "테스트 FC",
    teamShort: "TST",
    teamColor: "#111827",
    position,
    backNumber,
    tier: "A",
    totalShares: 2500,
    marketSupply: 1000,
    basePrice: price,
    openPrice: price,
    initialPrice: price,
    currentPrice: price,
    previousPrice: price,
    events: [],
    priceHistory: [{ minute: 0, timeLabel: "0'", price }],
    lastEvent: { text: "경기 전", sentiment: "neutral", minute: 0 },
    stats: {
      rating: 7.2,
      goals: 0,
      assists: 0,
      shotsOnTarget: 0,
      keyPasses: 0,
    },
  };
}

function buildTestRoster(): {
  players: Player[];
  holdings: Record<string, Holding>;
  transactions: PointTransaction[];
} {
  const specs: Array<{
    id: string;
    name: string;
    pos: Position;
    qty: number;
    price: number;
  }> = [
    { id: "p-gk-1", name: "라야", pos: "GK", qty: 2, price: 8_000 },
    { id: "p-df-1", name: "살리바", pos: "CB", qty: 3, price: 11_000 },
    { id: "p-df-2", name: "마갈량이스", pos: "CB", qty: 2, price: 10_500 },
    { id: "p-df-3", name: "화이트", pos: "RB", qty: 1, price: 9_800 },
    { id: "p-df-4", name: "팀버", pos: "LB", qty: 2, price: 9_500 },
    { id: "p-mf-1", name: "라이스", pos: "DM", qty: 4, price: 12_500 },
    { id: "p-mf-2", name: "외데고르", pos: "CAM", qty: 3, price: 13_000 },
    { id: "p-mf-3", name: "메리노", pos: "CM", qty: 1, price: 9_200 },
    { id: "p-fw-1", name: "사카", pos: "RW", qty: 5, price: 14_000 },
    { id: "p-fw-2", name: "마르티넬리", pos: "LW", qty: 2, price: 11_500 },
    { id: "p-fw-3", name: "하베르츠", pos: "ST", qty: 2, price: 12_000 },
    // Extra 12th player (outfield) for >11 and no-GK tests
    { id: "p-fw-4", name: "트로사르", pos: "LW", qty: 1, price: 10_200 },
    // Unowned player (in players list, not in holdings)
    { id: "p-unowned", name: "미보유선수", pos: "ST", qty: 0, price: 10_000 },
  ];

  const players: Player[] = [];
  const holdings: Record<string, Holding> = {};

  specs.forEach((s, idx) => {
    players.push(makePlayer(s.id, s.name, s.pos, s.price, idx + 1));
    if (s.qty > 0) {
      holdings[s.id] = {
        playerId: s.id,
        quantity: s.qty,
        avgBuyPrice: s.price,
      };
    }
  });

  // Dynamic API-Football holding not present in master `players` list
  holdings["af-p-99999"] = {
    playerId: "af-p-99999",
    quantity: 3,
    avgBuyPrice: 9_600,
  };
  const transactions: PointTransaction[] = [
    {
      id: "tx-af-1",
      type: "BUY",
      playerId: "af-p-99999",
      playerName: "동적수비수",
      teamShort: "DYN",
      quantity: 3,
      unitPrice: 9_600,
      totalAmount: 28_800,
      balanceAfter: 71_200,
      timestamp: "2026-11-23T12:00:00.000Z",
    },
  ];

  return { players, holdings, transactions };
}

const VALID_11_IDS = [
  "p-gk-1",
  "p-df-1",
  "p-df-2",
  "p-df-3",
  "p-df-4",
  "p-mf-1",
  "p-mf-2",
  "p-mf-3",
  "p-fw-1",
  "p-fw-2",
  "p-fw-3",
];

describe("11-Player Squad Maker & Community Feed (squadFeed)", () => {
  it("enforces 11 distinct owned players, mandatory GK, non-empty title, and auth", () => {
    const { players, holdings } = buildTestRoster();
    const author = { id: "user1", name: "트레이더A" };

    // 1. Unauthenticated publish blocked
    const authRes = createSquadFeedPost({
      existingFeeds: [],
      user: null,
      title: "테스트 스쿼드",
      selectedPlayerIds: VALID_11_IDS,
      holdings,
      players,
    });
    assert.equal(authRes.success, false);
    assert.equal(authRes.code, "AUTH_REQUIRED");

    // 2. Empty title blocked
    const emptyTitle = validateSquadDraft({
      title: "   ",
      selectedPlayerIds: VALID_11_IDS,
      holdings,
      players,
    });
    assert.equal(emptyTitle.valid, false);
    if (!emptyTitle.valid) assert.equal(emptyTitle.code, "EMPTY_TITLE");

    // 3. Fewer than 11 players blocked
    const tenPlayers = validateSquadDraft({
      title: "10명 스쿼드",
      selectedPlayerIds: VALID_11_IDS.slice(0, 10),
      holdings,
      players,
    });
    assert.equal(tenPlayers.valid, false);
    if (!tenPlayers.valid) assert.equal(tenPlayers.code, "INVALID_COUNT");

    // 4. More than 11 players blocked
    const twelvePlayers = validateSquadDraft({
      title: "12명 스쿼드",
      selectedPlayerIds: [...VALID_11_IDS, "p-fw-4"],
      holdings,
      players,
    });
    assert.equal(twelvePlayers.valid, false);
    if (!twelvePlayers.valid) assert.equal(twelvePlayers.code, "INVALID_COUNT");

    // 5. Duplicate player blocked even when array length is 11
    const duplicated = validateSquadDraft({
      title: "중복 스쿼드",
      selectedPlayerIds: [...VALID_11_IDS.slice(0, 10), "p-gk-1"],
      holdings,
      players,
    });
    assert.equal(duplicated.valid, false);
    if (!duplicated.valid) assert.equal(duplicated.code, "DUPLICATE_PLAYER");

    // 6. Unowned or 0-quantity player blocked
    const withUnowned = validateSquadDraft({
      title: "미보유 포함",
      selectedPlayerIds: [...VALID_11_IDS.slice(0, 10), "p-unowned"],
      holdings,
      players,
    });
    assert.equal(withUnowned.valid, false);
    if (!withUnowned.valid) assert.equal(withUnowned.code, "NOT_OWNED");

    const withZeroQty = validateSquadDraft({
      title: "0주 보유 포함",
      selectedPlayerIds: [...VALID_11_IDS.slice(0, 10), "p-fw-3"],
      holdings: {
        ...holdings,
        "p-fw-3": { playerId: "p-fw-3", quantity: 0, avgBuyPrice: 12_000 },
      },
      players,
    });
    assert.equal(withZeroQty.valid, false);
    if (!withZeroQty.valid) assert.equal(withZeroQty.code, "NOT_OWNED");

    // 7. 11 owned players without any GK blocked
    const noGkIds = [...VALID_11_IDS.slice(1), "p-fw-4"];
    assert.equal(noGkIds.length, REQUIRED_SQUAD_SIZE);
    const missingGk = validateSquadDraft({
      title: "키퍼 없음",
      selectedPlayerIds: noGkIds,
      holdings,
      players,
    });
    assert.equal(missingGk.valid, false);
    if (!missingGk.valid) {
      assert.equal(missingGk.code, "MISSING_GK");
      assert.match(missingGk.message, /골키퍼\(GK\)/);
    }

    // 8. Valid 11 owned players with GK succeeds (and sorts Attack -> GK)
    const published = createSquadFeedPost({
      existingFeeds: [],
      user: author,
      title: "아스날 코어 11인",
      description: "클린시트 + 공격포인트 집중 전략",
      formation: "4-3-3",
      selectedPlayerIds: VALID_11_IDS,
      holdings,
      players,
      nowIso: "2026-11-23T15:00:00.000Z",
      idOverride: "squad-1",
    });
    assert.equal(published.success, true);
    assert.equal(published.feeds.length, 1);
    assert.equal(published.feed?.players.length, 11);
    // GK is ordered at the end for top-down pitch layout
    assert.equal(published.feed?.players[10].position, "GK");
    assert.equal(published.feed?.players[10].publishedQuantity, 2);
  });

  it("supports dynamic API-Football holdings (af-p-...) during squad publishing", () => {
    const { players, holdings, transactions } = buildTestRoster();
    const withDynamic = [...VALID_11_IDS.slice(0, 10), "af-p-99999"];
    const published = createSquadFeedPost({
      existingFeeds: [],
      user: { id: "user1", name: "트레이더A" },
      title: "실데이터 선수 포함 스쿼드",
      selectedPlayerIds: withDynamic,
      holdings,
      players,
      transactions,
      idOverride: "squad-dyn",
    });

    assert.equal(published.success, true);
    const dynSnap = published.feed?.players.find(
      (p) => p.playerId === "af-p-99999"
    );
    assert.ok(dynSnap);
    assert.equal(dynSnap.name, "동적수비수");
    assert.equal(dynSnap.publishedQuantity, 3);
  });

  it("enforces publish immutability (no edit API), multiple feeds per user, and delete-only permissions", () => {
    // Domain module exposes zero edit/update functions for published squads
    const exportedNames = Object.keys(squadFeedModule);
    assert.equal(
      exportedNames.some((k) => /edit|update/i.test(k)),
      false
    );

    const { players, holdings } = buildTestRoster();
    const alice = { id: "alice", name: "앨리스", role: "user" as const };
    const bob = { id: "bob", name: "밥", role: "user" as const };
    const admin = { id: "admin", name: "관리자", role: "admin" as const };

    // Alice publishes two independent squad feeds
    const r1 = createSquadFeedPost({
      existingFeeds: [],
      user: alice,
      title: "앨리스 스쿼드 #1",
      formation: "4-3-3",
      selectedPlayerIds: VALID_11_IDS,
      holdings,
      players,
      idOverride: "sq-a1",
    });
    assert.equal(r1.success, true);

    const r2 = createSquadFeedPost({
      existingFeeds: r1.feeds,
      user: alice,
      title: "앨리스 스쿼드 #2",
      formation: "4-2-3-1",
      selectedPlayerIds: [...VALID_11_IDS.slice(0, 10), "p-fw-4"],
      holdings,
      players,
      idOverride: "sq-a2",
    });
    assert.equal(r2.success, true);
    assert.equal(r2.feeds.length, 2);
    assert.equal(r2.feeds[0].id, "sq-a2");
    assert.equal(r2.feeds[1].id, "sq-a1");

    // Bob cannot delete Alice's feed
    const bobDel = deleteSquadFeedPost({
      existingFeeds: r2.feeds,
      feedId: "sq-a1",
      user: bob,
    });
    assert.equal(bobDel.success, false);
    assert.equal(bobDel.feeds.length, 2);

    // Alice deletes #1 while #2 remains intact
    const aliceDel = deleteSquadFeedPost({
      existingFeeds: r2.feeds,
      feedId: "sq-a1",
      user: alice,
    });
    assert.equal(aliceDel.success, true);
    assert.equal(aliceDel.feeds.length, 1);
    assert.equal(aliceDel.feeds[0].id, "sq-a2");

    // Admin can delete remaining feed
    const adminDel = deleteSquadFeedPost({
      existingFeeds: aliceDel.feeds,
      feedId: "sq-a2",
      user: admin,
    });
    assert.equal(adminDel.success, true);
    assert.equal(adminDel.feeds.length, 0);
  });

  it("evaluates '보유 중' / '일부 매도' / '전량 매도' badges accurately at player and squad level across accounts", () => {
    const { players, holdings } = buildTestRoster();
    const author = { id: "alice", name: "앨리스" };

    const pub = createSquadFeedPost({
      existingFeeds: [],
      user: author,
      title: "매도 배지 추적 스쿼드",
      selectedPlayerIds: VALID_11_IDS,
      holdings,
      players,
      idOverride: "sq-sale",
    });
    assert.equal(pub.success, true);
    const post = pub.feed as SquadFeedPost;

    // 1. Immediately after publish -> 전원 보유 중
    const initialSummary = resolveSquadFeedSaleSummary(post, holdings);
    assert.equal(initialSummary.status, "HOLDING");
    assert.equal(initialSummary.label, "전원 보유 중");
    assert.equal(initialSummary.holdingCount, 11);
    assert.equal(initialSummary.partialSoldCount, 0);
    assert.equal(initialSummary.fullySoldCount, 0);

    // 2. Partial sell on p-df-1 (3 -> 2) & additional buy on p-fw-1 (5 -> 7)
    const afterPartialHoldings: Record<string, Holding> = {
      ...holdings,
      "p-df-1": { ...holdings["p-df-1"], quantity: 2 },
      "p-fw-1": { ...holdings["p-fw-1"], quantity: 7 },
    };
    const partialSummary = resolveSquadFeedSaleSummary(
      post,
      afterPartialHoldings
    );
    assert.equal(partialSummary.status, "PARTIAL_SOLD");
    assert.equal(partialSummary.label, "일부 매도");
    assert.equal(partialSummary.partialSoldCount, 1);
    assert.equal(partialSummary.fullySoldCount, 0);
    assert.equal(partialSummary.holdingCount, 10);
    assert.equal(partialSummary.byPlayerId["p-df-1"].status, "PARTIAL_SOLD");
    assert.equal(partialSummary.byPlayerId["p-df-1"].label, "일부 매도");
    assert.equal(partialSummary.byPlayerId["p-df-1"].soldQuantity, 1);
    // Additional buy stays HOLDING
    assert.equal(partialSummary.byPlayerId["p-fw-1"].status, "HOLDING");

    // 3. Full sell of 1 player (p-gk-1 removed from holdings map)
    const afterOneFullHoldings: Record<string, Holding> = {
      ...afterPartialHoldings,
    };
    delete afterOneFullHoldings["p-gk-1"];
    const gkStatus = resolveSquadPlayerSaleStatus(
      { playerId: "p-gk-1", publishedQuantity: 2 },
      afterOneFullHoldings
    );
    assert.equal(gkStatus.status, "FULLY_SOLD");
    assert.equal(gkStatus.label, "전량 매도");
    assert.equal(gkStatus.currentQuantity, 0);

    const mixedSummary = resolveSquadFeedSaleSummary(
      post,
      afterOneFullHoldings
    );
    assert.equal(mixedSummary.status, "PARTIAL_SOLD");
    assert.equal(mixedSummary.label, "일부 매도");
    assert.equal(mixedSummary.fullySoldCount, 1);
    assert.equal(mixedSummary.partialSoldCount, 1);
    assert.equal(mixedSummary.holdingCount, 9);

    // 4. Full sell of all 11 players -> squad status FULLY_SOLD ('전량 매도')
    const allSoldSummary = resolveSquadFeedSaleSummary(post, {});
    assert.equal(allSoldSummary.status, "FULLY_SOLD");
    assert.equal(allSoldSummary.label, "전량 매도");
    assert.equal(allSoldSummary.fullySoldCount, 11);
    assert.equal(allSoldSummary.holdingCount, 0);

    // 5. Cross-account / logged-out guest viewer resolves author's persisted account holdings
    const accounts = {
      alice: { holdings: afterOneFullHoldings },
      bob: { holdings: {} },
    };
    const viewedByBob = resolveSquadAuthorHoldings({
      authorId: "Alice",
      activeUser: { id: "bob" },
      activeHoldings: {},
      accounts,
    });
    const bobSummary = resolveSquadFeedSaleSummary(post, viewedByBob);
    assert.equal(bobSummary.fullySoldCount, 1);
    assert.equal(bobSummary.partialSoldCount, 1);

    const viewedByGuest = resolveSquadAuthorHoldings({
      authorId: "alice",
      activeUser: null,
      activeHoldings: {},
      accounts,
    });
    const guestSummary = resolveSquadFeedSaleSummary(post, viewedByGuest);
    assert.equal(guestSummary.status, "PARTIAL_SOLD");
  });

  it("supports community comments without mutating the squad and enforces comment delete permissions", () => {
    const { players, holdings } = buildTestRoster();
    const alice = { id: "alice", name: "앨리스", role: "user" as const };
    const bob = { id: "bob", name: "밥", role: "user" as const };
    const charlie = { id: "charlie", name: "찰리", role: "user" as const };

    const pub = createSquadFeedPost({
      existingFeeds: [],
      user: alice,
      title: "코멘트 테스트 스쿼드",
      selectedPlayerIds: VALID_11_IDS,
      holdings,
      players,
      idOverride: "sq-c1",
    });
    assert.equal(pub.success, true);

    // Blank comment rejected
    const blank = addSquadFeedComment({
      existingFeeds: pub.feeds,
      feedId: "sq-c1",
      user: bob,
      content: "   ",
    });
    assert.equal(blank.success, false);

    // Unauthenticated comment rejected
    const unauth = addSquadFeedComment({
      existingFeeds: pub.feeds,
      feedId: "sq-c1",
      user: null,
      content: "멋진 스쿼드네요",
    });
    assert.equal(unauth.success, false);

    // Bob adds a comment; squad snapshot remains identical
    const added = addSquadFeedComment({
      existingFeeds: pub.feeds,
      feedId: "sq-c1",
      user: bob,
      content: "사카 + 라이스 조합 탄탄하네요!",
      nowIso: "2026-11-23T15:10:00.000Z",
      commentIdOverride: "cmt-1",
    });
    assert.equal(added.success, true);
    assert.equal(added.feeds[0].comments.length, 1);
    assert.equal(added.feeds[0].comments[0].content, "사카 + 라이스 조합 탄탄하네요!");
    assert.deepEqual(added.feeds[0].players, pub.feeds[0].players);
    assert.equal(added.feeds[0].title, pub.feeds[0].title);

    // Unrelated user Charlie cannot delete Bob's comment
    const charlieDel = deleteSquadFeedComment({
      existingFeeds: added.feeds,
      feedId: "sq-c1",
      commentId: "cmt-1",
      user: charlie,
    });
    assert.equal(charlieDel.success, false);
    assert.equal(charlieDel.feeds[0].comments.length, 1);

    // Feed author Alice can delete comment on her feed
    const aliceDel = deleteSquadFeedComment({
      existingFeeds: added.feeds,
      feedId: "sq-c1",
      commentId: "cmt-1",
      user: alice,
    });
    assert.equal(aliceDel.success, true);
    assert.equal(aliceDel.feeds[0].comments.length, 0);
  });

  it("persists and sanitizes squad feeds, publish snapshots, and comments cleanly across reload", () => {
    const { players, holdings } = buildTestRoster();
    const pub = createSquadFeedPost({
      existingFeeds: [],
      user: { id: "alice", name: "앨리스" },
      title: "리로드 유지 스쿼드",
      formation: "3-5-2",
      selectedPlayerIds: VALID_11_IDS,
      holdings,
      players,
      idOverride: "sq-persist",
    });
    const withComment = addSquadFeedComment({
      existingFeeds: pub.feeds,
      feedId: "sq-persist",
      user: { id: "bob", name: "밥" },
      content: "새로고침 후에도 유지되어야 함",
      commentIdOverride: "cmt-persist",
    });

    // Simulate localStorage JSON serialization + corrupted entries alongside valid post
    const corruptedMissingGk = {
      ...withComment.feeds[0],
      id: "sq-corrupt-no-gk",
      players: withComment.feeds[0].players.map((p) => ({
        ...p,
        position: "ST" as Position,
      })),
    };
    const corruptedTooFew = {
      ...withComment.feeds[0],
      id: "sq-corrupt-10",
      players: withComment.feeds[0].players.slice(0, 10),
    };

    const rawFromStorage: unknown = JSON.parse(
      JSON.stringify([
        withComment.feeds[0],
        corruptedMissingGk,
        corruptedTooFew,
        null,
      ])
    );

    const hydrated = sanitizePersistedSquadFeeds(rawFromStorage);
    assert.equal(hydrated.length, 1);
    assert.equal(hydrated[0].id, "sq-persist");
    assert.equal(hydrated[0].formation, "3-5-2");
    assert.equal(hydrated[0].players.length, 11);
    assert.equal(hydrated[0].comments.length, 1);
    assert.equal(
      hydrated[0].comments[0].content,
      "새로고침 후에도 유지되어야 함"
    );

    // Sell badge after reload still reads publishedQuantity snapshot accurately
    const summaryAfterReload = resolveSquadFeedSaleSummary(hydrated[0], {
      ...holdings,
      "p-fw-1": { ...holdings["p-fw-1"], quantity: 1 }, // was 5 at publish
    });
    assert.equal(summaryAfterReload.status, "PARTIAL_SOLD");
    assert.equal(summaryAfterReload.byPlayerId["p-fw-1"].publishedQuantity, 5);
    assert.equal(summaryAfterReload.byPlayerId["p-fw-1"].currentQuantity, 1);
    assert.equal(summaryAfterReload.byPlayerId["p-fw-1"].label, "일부 매도");
  });
});
