import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getSupabaseAuthConfig,
  isSupabaseAuthConfigured,
  mapSupabaseAuthUser,
  type AuthenticatedUser,
} from "../src/lib/supabase/config.ts";
import {
  handleOrdersGet,
  handleOrdersPost,
  handlePortfolioGet,
  handlePortfolioPost,
  handleSquadCommentCreate,
  handleSquadCommentDelete,
  handleSquadPostCreate,
  handleSquadPostDelete,
  resolveApiActorFromContext,
} from "../src/lib/auth/apiAuthService.ts";
import {
  FileLedgerRepository,
  INITIAL_SEED_CASH,
} from "../src/lib/repositories/ledgerRepository.ts";
import {
  FileSquadFeedRepository,
  type SquadSlotDraftInput,
} from "../src/lib/repositories/squadFeedRepository.ts";
import type { Position } from "../src/types/index.ts";

const TEST_AUTH_LEDGER = path.join(
  os.tmpdir(),
  "pitchtrade-auth-test-ledger.json"
);
const TEST_AUTH_SQUAD = path.join(
  os.tmpdir(),
  "pitchtrade-auth-test-squad.json"
);

const USER_A: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@example.com",
  nickname: "앨리스",
  role: "user",
};

const USER_B: AuthenticatedUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "bob@example.com",
  nickname: "밥",
  role: "user",
};

const USER_C: AuthenticatedUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "charlie@example.com",
  nickname: "찰리",
  role: "user",
};

const ADMIN_USER: AuthenticatedUser = {
  id: "99999999-9999-4999-8999-999999999999",
  email: "admin@example.com",
  nickname: "관리자",
  role: "admin",
};

const ROSTER_11: Array<{
  playerId: string;
  playerName: string;
  position: Position;
  price: number;
}> = [
  { playerId: "p-gk-1", playerName: "David Raya", position: "GK", price: 8_000 },
  { playerId: "p-df-1", playerName: "William Saliba", position: "CB", price: 9_000 },
  { playerId: "p-df-2", playerName: "Gabriel Magalhaes", position: "CB", price: 9_000 },
  { playerId: "p-df-3", playerName: "Ben White", position: "RB", price: 8_500 },
  { playerId: "p-df-4", playerName: "Jurrien Timber", position: "LB", price: 8_500 },
  { playerId: "p-mf-1", playerName: "Declan Rice", position: "DM", price: 9_500 },
  { playerId: "p-mf-2", playerName: "Martin Odegaard", position: "CAM", price: 9_500 },
  { playerId: "p-mf-3", playerName: "Mikel Merino", position: "CM", price: 8_000 },
  { playerId: "p-fw-1", playerName: "Bukayo Saka", position: "RW", price: 9_500 },
  { playerId: "p-fw-2", playerName: "Gabriel Martinelli", position: "LW", price: 8_500 },
  { playerId: "p-fw-3", playerName: "Kai Havertz", position: "ST", price: 9_000 },
];

function buildDraftSlots(): SquadSlotDraftInput[] {
  return ROSTER_11.map((p, idx) => ({
    slotIndex: idx,
    playerId: p.playerId,
    playerName: p.playerName,
    teamName: "Arsenal",
    teamShort: "ARS",
    teamColor: "#EF0107",
    position: p.position,
    backNumber: idx + 1,
    currentPrice: p.price,
  }));
}

function cleanup(): void {
  FileLedgerRepository.clearMemoryForTesting(TEST_AUTH_LEDGER);
  FileSquadFeedRepository.clearMemoryForTesting(TEST_AUTH_SQUAD);
  for (const fp of [TEST_AUTH_LEDGER, TEST_AUTH_SQUAD]) {
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      // Ignore cleanup errors
    }
  }
}

test("1. Supabase Auth config detects ANON_KEY or PUBLISHABLE_KEY and safely maps server-verified users", () => {
  assert.equal(isSupabaseAuthConfigured({}), false);
  assert.equal(
    isSupabaseAuthConfigured({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    }),
    false
  );

  const anonCfg = getSupabaseAuthConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJ-anon-token",
  });
  assert.deepEqual(anonCfg, {
    url: "https://demo.supabase.co",
    anonKey: "eyJ-anon-token",
  });

  const pubCfg = getSupabaseAuthConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxx",
  });
  assert.deepEqual(pubCfg, {
    url: "https://demo.supabase.co",
    anonKey: "sb_publishable_xxx",
  });

  // Role comes strictly from app_metadata, never user_metadata
  const mappedUser = mapSupabaseAuthUser({
    id: USER_A.id,
    email: "Alice@Example.com",
    user_metadata: { nickname: "앨리스", role: "admin" },
    app_metadata: {},
  });
  assert.deepEqual(mappedUser, {
    id: USER_A.id,
    email: "alice@example.com",
    nickname: "앨리스",
    role: "user",
  });

  const mappedAdmin = mapSupabaseAuthUser({
    id: ADMIN_USER.id,
    email: "admin@example.com",
    user_metadata: {},
    app_metadata: { role: "admin" },
  });
  assert.equal(mappedAdmin?.role, "admin");
  assert.equal(mappedAdmin?.nickname, "admin");
});

test("2. Portfolio & Orders APIs enforce authenticated session user, initialize users row, and block unauthenticated/cross-user tampering", async () => {
  cleanup();
  try {
    const ledgerRepo = new FileLedgerRepository({
      ledgerFilePath: TEST_AUTH_LEDGER,
    });

    // 2-a) Unauthenticated request when Supabase Auth is active -> 401 even if client supplies userId
    const unauthPortfolio = await handlePortfolioGet({
      auth: { authConfigured: true, sessionUser: null },
      repo: ledgerRepo,
      requestedUserId: USER_A.id,
    });
    assert.equal(unauthPortfolio.status, 401);
    assert.equal(unauthPortfolio.body.code, "AUTH_REQUIRED");

    const unauthOrder = await handleOrdersPost({
      auth: { authConfigured: true, sessionUser: null },
      repo: ledgerRepo,
      body: {
        userId: USER_A.id,
        side: "BUY",
        playerId: "p-fw-1",
        quantity: 1,
        matchStatus: "LIVE",
        basePrice: 10_000,
        currentPrice: 10_000,
      },
    });
    assert.equal(unauthOrder.status, 401);
    assert.equal(unauthOrder.body.code, "AUTH_REQUIRED");

    // 2-b) Authenticated User A initializes portfolio with 100,000 P without needing query userId
    const initA = await handlePortfolioGet({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: ledgerRepo,
    });
    assert.equal(initA.status, 200);
    assert.equal(initA.body.authSource, "supabase_session");
    assert.equal(initA.body.cashBalance, INITIAL_SEED_CASH);

    // 2-c) Authenticated User A trying to read User B's portfolio or place order as User B -> 403 FORBIDDEN
    const spoofPortfolio = await handlePortfolioGet({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: ledgerRepo,
      requestedUserId: USER_B.id,
    });
    assert.equal(spoofPortfolio.status, 403);
    assert.equal(spoofPortfolio.body.code, "FORBIDDEN");

    const spoofOrder = await handleOrdersPost({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: ledgerRepo,
      body: {
        userId: USER_B.id,
        side: "BUY",
        playerId: "p-fw-1",
        quantity: 2,
        matchStatus: "LIVE",
        basePrice: 10_000,
        currentPrice: 10_000,
      },
    });
    assert.equal(spoofOrder.status, 403);
    assert.equal(spoofOrder.body.code, "FORBIDDEN");
    assert.equal(
      await ledgerRepo.getPortfolio(USER_B.id, { autoCreate: false }),
      null
    );

    // 2-d) Authenticated User A executes BUY strictly under session user (even when body.userId omitted)
    const buyA = await handleOrdersPost({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: ledgerRepo,
      body: {
        side: "BUY",
        playerId: "p-fw-1",
        playerName: "Bukayo Saka",
        quantity: 2,
        matchStatus: "LIVE",
        basePrice: 10_000,
        currentPrice: 10_000,
        nowMs: 1_770_000_001_000,
      },
    });
    assert.equal(buyA.status, 200);
    assert.equal(buyA.body.success, true);

    const ordersA = await handleOrdersGet({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: ledgerRepo,
    });
    assert.equal(ordersA.status, 200);
    assert.equal(ordersA.body.cashBalance, 80_000);
    assert.equal((ordersA.body.entries as unknown[]).length, 1);

    // 2-e) Non-admin session user cannot invoke ADMIN_TOPUP (403); admin allowed only in non-prod
    const nonAdminTopup = await handlePortfolioPost({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: ledgerRepo,
      action: "ADMIN_TOPUP",
      amount: 500_000,
      nodeEnv: "development",
    });
    assert.equal(nonAdminTopup.status, 403);

    const prodAdminTopup = await handlePortfolioPost({
      auth: { authConfigured: true, sessionUser: ADMIN_USER },
      repo: ledgerRepo,
      action: "ADMIN_TOPUP",
      amount: 500_000,
      nodeEnv: "production",
    });
    assert.equal(prodAdminTopup.status, 403);

    const devAdminTopup = await handlePortfolioPost({
      auth: { authConfigured: true, sessionUser: ADMIN_USER },
      repo: ledgerRepo,
      action: "ADMIN_TOPUP",
      amount: 500_000,
      nodeEnv: "development",
    });
    assert.equal(devAdminTopup.status, 200);
    assert.equal(devAdminTopup.body.cashBalance, INITIAL_SEED_CASH + 500_000);
  } finally {
    cleanup();
  }
});

test("3. Squad Feed & Comment APIs block unauthenticated writes, prevent author spoofing, and enforce strict delete ownership", async () => {
  cleanup();
  try {
    const ledgerRepo = new FileLedgerRepository({
      ledgerFilePath: TEST_AUTH_LEDGER,
    });
    const squadRepo = new FileSquadFeedRepository({
      feedFilePath: TEST_AUTH_SQUAD,
      ledgerRepo,
    });

    // Give User A enough cash & buy all 11 players (including GK) via ledger
    await ledgerRepo.ensureUser({
      userId: USER_A.id,
      email: USER_A.email,
      nickname: USER_A.nickname,
      initialCash: 5_000_000,
    });
    for (let i = 0; i < ROSTER_11.length; i += 1) {
      const p = ROSTER_11[i];
      const buy = await handleOrdersPost({
        auth: { authConfigured: true, sessionUser: USER_A },
        repo: ledgerRepo,
        body: {
          side: "BUY",
          playerId: p.playerId,
          playerName: p.playerName,
          quantity: 2,
          matchStatus: "LIVE",
          basePrice: p.price,
          currentPrice: p.price,
          nowMs: 1_770_000_100_000 + i * 100,
        },
      });
      assert.equal(buy.status, 200);
    }

    const slots = buildDraftSlots();

    // 3-a) Unauthenticated publish -> 401
    const unauthCreate = await handleSquadPostCreate({
      auth: { authConfigured: true, sessionUser: null },
      repo: squadRepo,
      body: {
        authorId: USER_A.id,
        title: "무단 발행 시도",
        formation: "4-3-3",
        slots,
      },
    });
    assert.equal(unauthCreate.status, 401);

    // 3-b) User B trying to spoof User A as authorId -> 403 FORBIDDEN
    const spoofCreate = await handleSquadPostCreate({
      auth: { authConfigured: true, sessionUser: USER_B },
      repo: squadRepo,
      body: {
        authorId: USER_A.id,
        title: "사칭 스쿼드",
        formation: "4-3-3",
        slots,
      },
    });
    assert.equal(spoofCreate.status, 403);

    // 3-c) Authenticated User A publishes 11-player squad -> 201 Created
    const created = await handleSquadPostCreate({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: squadRepo,
      body: {
        title: "앨리스 실보유 베스트 11",
        formation: "4-3-3",
        slots,
        nowMs: 1_770_000_200_000,
      },
    });
    assert.equal(created.status, 201);
    const postId = (created.body.post as { id: string }).id;

    // 3-d) Unauthenticated & non-author User B cannot delete User A's post
    const unauthDelete = await handleSquadPostDelete({
      auth: { authConfigured: true, sessionUser: null },
      repo: squadRepo,
      postId,
      requestedUserId: USER_A.id,
    });
    assert.equal(unauthDelete.status, 401);

    const otherUserDelete = await handleSquadPostDelete({
      auth: { authConfigured: true, sessionUser: USER_B },
      repo: squadRepo,
      postId,
    });
    assert.equal(otherUserDelete.status, 403);
    assert.equal((await squadRepo.listPosts()).length, 1);

    // 3-e) Comments: unauthenticated -> 401; User B comments -> 201; User C delete -> 403; User B delete -> 200
    const unauthComment = await handleSquadCommentCreate({
      auth: { authConfigured: true, sessionUser: null },
      repo: squadRepo,
      postId,
      body: { authorId: USER_B.id, content: "비인증 댓글" },
    });
    assert.equal(unauthComment.status, 401);

    const commentB = await handleSquadCommentCreate({
      auth: { authConfigured: true, sessionUser: USER_B },
      repo: squadRepo,
      postId,
      body: { content: "좋은 스쿼드 구성이네요!", nowMs: 1_770_000_210_000 },
    });
    assert.equal(commentB.status, 201);
    const commentId1 = (commentB.body.comment as { id: string }).id;

    const charlieDel = await handleSquadCommentDelete({
      auth: { authConfigured: true, sessionUser: USER_C },
      repo: squadRepo,
      postId,
      commentId: commentId1,
    });
    assert.equal(charlieDel.status, 403);

    const bobDel = await handleSquadCommentDelete({
      auth: { authConfigured: true, sessionUser: USER_B },
      repo: squadRepo,
      postId,
      commentId: commentId1,
    });
    assert.equal(bobDel.status, 200);

    // Squad author User A can delete another user's comment on her own post
    const commentB2 = await handleSquadCommentCreate({
      auth: { authConfigured: true, sessionUser: USER_B },
      repo: squadRepo,
      postId,
      body: { content: "작성자 정리 테스트 댓글", nowMs: 1_770_000_220_000 },
    });
    assert.equal(commentB2.status, 201);
    const commentId2 = (commentB2.body.comment as { id: string }).id;

    const authorDelComment = await handleSquadCommentDelete({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: squadRepo,
      postId,
      commentId: commentId2,
    });
    assert.equal(authorDelComment.status, 200);

    // 3-f) Squad author User A deletes own post -> 200 OK
    const ownerDel = await handleSquadPostDelete({
      auth: { authConfigured: true, sessionUser: USER_A },
      repo: squadRepo,
      postId,
    });
    assert.equal(ownerDel.status, 200);
    assert.equal((await squadRepo.listPosts()).length, 0);
  } finally {
    cleanup();
  }
});

test("4. Unconfigured Supabase Auth safely preserves local/offline fallback compatibility while still enforcing ownership", async () => {
  cleanup();
  try {
    const ledgerRepo = new FileLedgerRepository({
      ledgerFilePath: TEST_AUTH_LEDGER,
    });
    const squadRepo = new FileSquadFeedRepository({
      feedFilePath: TEST_AUTH_SQUAD,
      ledgerRepo,
    });

    // Fallback actor resolution rejects missing ID cleanly
    const missing = resolveApiActorFromContext({
      authConfigured: false,
      sessionUser: null,
      requestedUserId: "",
      missingFallbackStatus: 400,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 400);

    // Fallback portfolio + order + squad publish work smoothly when Supabase Auth env is absent
    await ledgerRepo.ensureUser({
      userId: "demo-alice",
      nickname: "데모앨리스",
      initialCash: 5_000_000,
    });
    for (let i = 0; i < ROSTER_11.length; i += 1) {
      const p = ROSTER_11[i];
      const res = await handleOrdersPost({
        auth: { authConfigured: false, sessionUser: null },
        repo: ledgerRepo,
        body: {
          userId: "demo-alice",
          side: "BUY",
          playerId: p.playerId,
          playerName: p.playerName,
          quantity: 1,
          matchStatus: "LIVE",
          basePrice: p.price,
          currentPrice: p.price,
          nowMs: 1_770_000_300_000 + i * 100,
        },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.authSource, "fallback");
    }

    const postRes = await handleSquadPostCreate({
      auth: { authConfigured: false, sessionUser: null },
      repo: squadRepo,
      body: {
        authorId: "demo-alice",
        authorName: "데모앨리스",
        title: "폴백 모드 스쿼드",
        formation: "4-3-3",
        slots: buildDraftSlots(),
        nowMs: 1_770_000_400_000,
      },
    });
    assert.equal(postRes.status, 201);
    assert.equal(postRes.body.authSource, "fallback");

    const postId = (postRes.body.post as { id: string }).id;

    // Non-author deletion is STILL forbidden in fallback mode
    const forbiddenDel = await handleSquadPostDelete({
      auth: { authConfigured: false, sessionUser: null },
      repo: squadRepo,
      postId,
      requestedUserId: "demo-bob",
    });
    assert.equal(forbiddenDel.status, 403);

    // Author deletion succeeds
    const okDel = await handleSquadPostDelete({
      auth: { authConfigured: false, sessionUser: null },
      repo: squadRepo,
      postId,
      requestedUserId: "demo-alice",
    });
    assert.equal(okDel.status, 200);
  } finally {
    cleanup();
  }
});
