import test from "node:test";
import assert from "node:assert/strict";
import { getTableName } from "drizzle-orm";
import {
  getDb,
  isDatabaseConfigured,
} from "../src/db/index.ts";
import {
  fixturesCache,
  holdings,
  ledgerEntries,
  squadComments,
  squadPosts,
  squadSlots,
  users,
} from "../src/db/schema.ts";
import {
  MemoryFixtureCacheRepository,
  deriveDateMatchesStatus,
  deriveSingleFixtureStatus,
  getDefaultFixtureCacheRepository,
} from "../src/lib/repositories/fixtureCacheRepository.ts";
import {
  ApiFootballProvider,
  CACHE_TTL_MS,
  type ApiFootballRawFixtureItem,
} from "../src/lib/providers/index.ts";

function createFullFtFixturePayload(fixtureId: number): ApiFootballRawFixtureItem {
  return {
    fixture: {
      id: fixtureId,
      date: "2026-11-22T15:00:00+00:00",
      status: { short: "FT", elapsed: 90 },
    },
    league: { id: 39, name: "Premier League", country: "England" },
    teams: {
      home: { id: 42, name: "Arsenal" },
      away: { id: 40, name: "Liverpool" },
    },
    goals: { home: 2, away: 1 },
    lineups: [
      {
        team: { id: 42, name: "Arsenal" },
        coach: { id: 10, name: "Mikel Arteta" },
        formation: "4-3-3",
        startXI: [
          { player: { id: 1001, name: "David Raya", number: 22, pos: "G", grid: "1:1" } },
          { player: { id: 1002, name: "Bukayo Saka", number: 7, pos: "F", grid: "4:3" } },
          { player: { id: 1003, name: "Martin Odegaard", number: 8, pos: "M", grid: "3:3" } },
        ],
        substitutes: [
          { player: { id: 1004, name: "Leandro Trossard", number: 19, pos: "F", grid: null } },
        ],
      },
      {
        team: { id: 40, name: "Liverpool" },
        coach: { id: 20, name: "Arne Slot" },
        formation: "4-2-3-1",
        startXI: [
          { player: { id: 2001, name: "Alisson Becker", number: 1, pos: "G", grid: "1:1" } },
          { player: { id: 2002, name: "Mohamed Salah", number: 11, pos: "F", grid: "4:3" } },
        ],
        substitutes: [
          { player: { id: 2003, name: "Cody Gakpo", number: 18, pos: "F", grid: null } },
        ],
      },
    ],
    events: [
      {
        time: { elapsed: 31, extra: null },
        team: { id: 42, name: "Arsenal" },
        player: { id: 1002, name: "Bukayo Saka" },
        assist: { id: 1003, name: "Martin Odegaard" },
        type: "Goal",
        detail: "Normal Goal",
      },
      {
        time: { elapsed: 74, extra: null },
        team: { id: 42, name: "Arsenal" },
        player: { id: 1002, name: "Bukayo Saka" },
        assist: { id: 1004, name: "Leandro Trossard" },
        type: "subst",
        detail: "Substitution 1",
      },
    ],
    players: [
      {
        team: { id: 42, name: "Arsenal" },
        players: [
          {
            player: { id: 1001, name: "David Raya" },
            statistics: [
              {
                games: { minutes: 90, rating: "7.9", captain: false },
                goals: { saves: 5 },
                passes: { total: 34, accuracy: "85%" },
              },
            ],
          },
          {
            player: { id: 1003, name: "Martin Odegaard" },
            statistics: [
              {
                games: { minutes: 90, rating: "8.4", captain: true },
                goals: { assists: 1 },
                passes: { total: 68, key: 4, accuracy: "91%" },
              },
            ],
          },
        ],
      },
    ],
  };
}

test("1. Unset DATABASE_URL safely falls back to in-memory cache repository without DB connection errors", async () => {
  assert.equal(isDatabaseConfigured(undefined), false);
  assert.equal(isDatabaseConfigured(""), false);
  assert.equal(isDatabaseConfigured("   "), false);
  assert.equal(isDatabaseConfigured("https://example.com"), false);
  assert.equal(
    isDatabaseConfigured("postgresql://user:pass@aws-0.pooler.supabase.com:6543/postgres"),
    true
  );

  assert.equal(getDb(undefined), null);
  assert.equal(getDb(""), null);

  const fallbackRepo = getDefaultFixtureCacheRepository(undefined);
  assert.equal(fallbackRepo.kind, "memory");

  // Confirm ApiFootballProvider works cleanly with default repository when DATABASE_URL is absent
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  ApiFootballProvider.clearCachesForTesting();
  try {
    let fetchCalls = 0;
    const mockFetch: typeof fetch = async (input) => {
      fetchCalls += 1;
      const url = String(input);
      if (url.includes("/fixtures?date=")) {
        return new Response(
          JSON.stringify({
            errors: [],
            response: [createFullFtFixturePayload(1558001)],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ errors: [], response: [] }), {
        status: 200,
      });
    };

    const provider = new ApiFootballProvider({
      apiKey: "valid-api_key-1234567890",
      fetchImpl: mockFetch,
    });

    const first = await provider.getMatchesByDate("2026-11-22");
    assert.equal(first.fromCache, false);
    assert.equal(first.matches.length, 1);
    assert.equal(fetchCalls, 1);

    const second = await provider.getMatchesByDate("2026-11-22");
    assert.equal(second.fromCache, true);
    assert.equal(fetchCalls, 1);
  } finally {
    ApiFootballProvider.clearCachesForTesting();
    if (prevDbUrl !== undefined) {
      process.env.DATABASE_URL = prevDbUrl;
    }
  }
});

test("2. DB cache hit serves permanently retained FT fixture (lineups, events, stats) with 0 external API calls even after memory clear and 30 days", async () => {
  ApiFootballProvider.clearCachesForTesting();
  const persistentDbRepo = new MemoryFixtureCacheRepository();
  let nowMs = 1_750_000_000_000;
  let fetchCalls = 0;

  const mockFetchInitial: typeof fetch = async (input) => {
    fetchCalls += 1;
    const url = String(input);
    if (url.includes("/fixtures?date=2026-11-22")) {
      return new Response(
        JSON.stringify({
          errors: [],
          response: [
            {
              fixture: {
                id: 1558001,
                date: "2026-11-22T15:00:00+00:00",
                status: { short: "FT", elapsed: 90 },
              },
              league: { id: 39, name: "Premier League", country: "England" },
              teams: {
                home: { id: 42, name: "Arsenal" },
                away: { id: 40, name: "Liverpool" },
              },
              goals: { home: 2, away: 1 },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes("/fixtures?id=1558001")) {
      return new Response(
        JSON.stringify({
          errors: [],
          response: [createFullFtFixturePayload(1558001)],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ errors: [], response: [] }), {
      status: 200,
    });
  };

  const coldProvider1 = new ApiFootballProvider({
    apiKey: "valid-api_key-1234567890",
    fetchImpl: mockFetchInitial,
    nowFn: () => nowMs,
    cacheRepo: persistentDbRepo,
  });

  // Step 1: Initial cold fetch hits upstream (date + single detail) and persists permanently to DB cache
  const initial = await coldProvider1.getMatchesByDate("2026-11-22");
  assert.equal(initial.fromCache, false);
  assert.equal(initial.matches.length, 1);
  assert.equal(fetchCalls, 2);

  // Verify permanent FT retention (`expiresAtMs === null`) in DB repository for both date list & single fixture
  const savedDate = await persistentDbRepo.getMatchesByDate("2026-11-22", nowMs);
  assert.ok(savedDate);
  assert.equal(savedDate?.status, "FT");
  assert.equal(savedDate?.expiresAtMs, null);

  const savedFixture = await persistentDbRepo.getFixtureDetail(1558001, nowMs);
  assert.ok(savedFixture);
  assert.equal(savedFixture?.status, "FT");
  assert.equal(savedFixture?.expiresAtMs, null);

  // Step 2: Simulate server cold restart (clear all static memory caches) + jump 30 days ahead
  ApiFootballProvider.clearCachesForTesting();
  nowMs += 30 * 24 * 60 * 60 * 1000;

  let unexpectedExternalCalls = 0;
  const forbiddenFetch: typeof fetch = async () => {
    unexpectedExternalCalls += 1;
    throw new Error("External API must NOT be called for permanently cached FT fixture");
  };

  const restartedProvider = new ApiFootballProvider({
    apiKey: "valid-api_key-1234567890",
    fetchImpl: forbiddenFetch,
    nowFn: () => nowMs,
    cacheRepo: persistentDbRepo,
  });

  // Step 3: Both date lookup and single-fixture detail hit DB cache with 0 external calls
  const fromDbDate = await restartedProvider.getMatchesByDate("2026-11-22");
  assert.equal(fromDbDate.fromCache, true);
  assert.equal(fromDbDate.staleFallback, false);
  assert.equal(unexpectedExternalCalls, 0);

  const match = fromDbDate.matches[0];
  assert.equal(match.status, "FT");
  assert.equal(match.homeManager, "Mikel Arteta");
  assert.equal(match.homeTeam.lineup?.length, 3);
  assert.equal(match.homeTeam.bench?.length, 1);
  assert.equal(match.events?.length, 4); // GOAL + ASSIST + SUB_OUT + SUB_IN
  assert.ok(match.events?.every((e) => e.source === "REAL"));

  const odegaard = match.homeTeam.lineup?.find((p) => p.id === "af-p-1003");
  assert.equal(odegaard?.passesTotal, 68);
  assert.equal(odegaard?.keyPasses, 4);
  assert.equal(odegaard?.passAccuracy, 91);
  assert.equal(odegaard?.rating, 8.4);
  assert.equal(odegaard?.isCaptain, true);

  const raya = match.homeTeam.lineup?.find((p) => p.id === "af-p-1001");
  assert.equal(raya?.saves, 5);

  // Clear memory again and verify fetchFixtureDetail also serves from DB cache with 0 external calls
  ApiFootballProvider.clearCachesForTesting();
  const fromDbDetail = await restartedProvider.fetchFixtureDetail(1558001);
  assert.equal(fromDbDetail.fromCache, true);
  assert.equal(fromDbDetail.match?.id, "af-1558001");
  assert.equal(fromDbDetail.match?.homeTeam.lineup?.length, 3);
  assert.equal(unexpectedExternalCalls, 0);

  ApiFootballProvider.clearCachesForTesting();
});

test("3. LIVE/PRE caches expire by TTL, trigger re-fetch, reuse already-FT DB details, and upgrade to permanent retention upon FT", async () => {
  ApiFootballProvider.clearCachesForTesting();
  const dbRepo = new MemoryFixtureCacheRepository();
  let nowMs = 1_760_000_000_000;
  let phase: "LIVE" | "FT" = "LIVE";
  const requestedUrls: string[] = [];

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.includes("/fixtures?date=2026-11-24")) {
      return new Response(
        JSON.stringify({
          errors: [],
          response: [
            {
              fixture: {
                id: 9001,
                date: "2026-11-24T12:30:00+00:00",
                status: { short: "FT", elapsed: 90 },
              },
              league: { id: 39, name: "Premier League", country: "England" },
              teams: {
                home: { id: 42, name: "Arsenal" },
                away: { id: 40, name: "Liverpool" },
              },
              goals: { home: 2, away: 1 },
            },
            {
              fixture: {
                id: 9002,
                date: "2026-11-24T15:00:00+00:00",
                status:
                  phase === "LIVE"
                    ? { short: "1H", elapsed: 28 }
                    : { short: "FT", elapsed: 90 },
              },
              league: { id: 39, name: "Premier League", country: "England" },
              teams: {
                home: { id: 50, name: "Manchester City" },
                away: { id: 49, name: "Chelsea" },
              },
              goals: phase === "LIVE" ? { home: 1, away: 0 } : { home: 3, away: 1 },
            },
          ],
        }),
        { status: 200 }
      );
    }

    if (url.includes("/fixtures?ids=")) {
      const idsPart = url.split("ids=")[1]?.split("&")[0] ?? "";
      const ids = idsPart.split("-").map(Number);
      return new Response(
        JSON.stringify({
          errors: [],
          response: ids.map((id) => {
            if (id === 9001) return createFullFtFixturePayload(9001);
            return {
              fixture: {
                id: 9002,
                date: "2026-11-24T15:00:00+00:00",
                status:
                  phase === "LIVE"
                    ? { short: "1H", elapsed: 28 }
                    : { short: "FT", elapsed: 90 },
              },
              league: { id: 39, name: "Premier League", country: "England" },
              teams: {
                home: { id: 50, name: "Manchester City" },
                away: { id: 49, name: "Chelsea" },
              },
              goals: phase === "LIVE" ? { home: 1, away: 0 } : { home: 3, away: 1 },
              lineups: [
                {
                  team: { id: 50, name: "Manchester City" },
                  formation: "4-3-3",
                  startXI: [
                    { player: { id: 5001, name: "Erling Haaland", number: 9, pos: "F", grid: "4:2" } },
                  ],
                  substitutes: [],
                },
              ],
              events: [],
            };
          }),
        }),
        { status: 200 }
      );
    }

    if (url.includes("/fixtures?id=9002")) {
      return new Response(
        JSON.stringify({
          errors: [],
          response: [
            {
              fixture: {
                id: 9002,
                date: "2026-11-24T15:00:00+00:00",
                status: { short: "FT", elapsed: 90 },
              },
              league: { id: 39, name: "Premier League", country: "England" },
              teams: {
                home: { id: 50, name: "Manchester City" },
                away: { id: 49, name: "Chelsea" },
              },
              goals: { home: 3, away: 1 },
              lineups: [
                {
                  team: { id: 50, name: "Manchester City" },
                  formation: "4-3-3",
                  startXI: [
                    { player: { id: 5001, name: "Erling Haaland", number: 9, pos: "F", grid: "4:2" } },
                  ],
                  substitutes: [],
                },
              ],
              events: [
                {
                  time: { elapsed: 82 },
                  team: { id: 50, name: "Manchester City" },
                  player: { id: 5001, name: "Erling Haaland" },
                  type: "Goal",
                  detail: "Normal Goal",
                },
              ],
            },
          ],
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ errors: [], response: [] }), {
      status: 200,
    });
  };

  const provider = new ApiFootballProvider({
    apiKey: "valid-api_key-1234567890",
    fetchImpl: mockFetch,
    nowFn: () => nowMs,
    cacheRepo: dbRepo,
  });

  // 1) Initial fetch while 9001=FT and 9002=LIVE
  const first = await provider.getMatchesByDate("2026-11-24");
  assert.equal(first.fromCache, false);
  assert.equal(first.matches.length, 2);

  const liveDateRec = await dbRepo.getMatchesByDate("2026-11-24", nowMs);
  assert.equal(liveDateRec?.status, "LIVE");
  assert.equal(liveDateRec?.expiresAtMs, nowMs + CACHE_TTL_MS.LIVE_FIXTURES);

  const ftFixtureRec = await dbRepo.getFixtureDetail(9001, nowMs);
  assert.equal(ftFixtureRec?.status, "FT");
  assert.equal(ftFixtureRec?.expiresAtMs, null);

  const liveFixtureRec = await dbRepo.getFixtureDetail(9002, nowMs);
  assert.equal(liveFixtureRec?.status, "LIVE");
  assert.equal(liveFixtureRec?.expiresAtMs, nowMs + CACHE_TTL_MS.LIVE_EVENTS);

  // 2) Clear memory cache; within 20s (< 35s LIVE TTL), DB cache serves directly with 0 new requests
  ApiFootballProvider.clearCachesForTesting();
  nowMs += 20_000;
  const countBeforeDbHit = requestedUrls.length;
  const second = await provider.getMatchesByDate("2026-11-24");
  assert.equal(second.fromCache, true);
  assert.equal(requestedUrls.length, countBeforeDbHit);

  // 3) Advance past LIVE TTL (+40s), clear memory cache, and transition 9002 -> FT
  ApiFootballProvider.clearCachesForTesting();
  nowMs += CACHE_TTL_MS.LIVE_FIXTURES + 5_000;
  phase = "FT";
  requestedUrls.length = 0;

  const third = await provider.getMatchesByDate("2026-11-24");
  assert.equal(third.fromCache, false);
  assert.equal(third.matches.length, 2);
  assert.equal(third.matches[1].status, "FT");
  assert.equal(third.matches[1].homeTeam.score, 3);
  assert.equal(third.matches[1].awayTeam.score, 1);

  // Crucial quota saving: 9001 was reused from DB cache, so detail was ONLY fetched for 9002!
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls[0].includes("/fixtures?date=2026-11-24"));
  assert.ok(requestedUrls[1].includes("/fixtures?id=9002"));
  assert.ok(!requestedUrls.some((u) => u.includes("9001")));

  // Both 9002 and the date list are now permanently retained (`expiresAtMs === null`)
  const upgradedDateRec = await dbRepo.getMatchesByDate("2026-11-24", nowMs);
  assert.equal(upgradedDateRec?.status, "FT");
  assert.equal(upgradedDateRec?.expiresAtMs, null);

  const upgradedFixtureRec = await dbRepo.getFixtureDetail(9002, nowMs);
  assert.equal(upgradedFixtureRec?.status, "FT");
  assert.equal(upgradedFixtureRec?.expiresAtMs, null);

  // Verify PRE fixture TTL expiration as well
  let preCalls = 0;
  const preFetch: typeof fetch = async () => {
    preCalls += 1;
    return new Response(
      JSON.stringify({
        errors: [],
        response: [
          {
            fixture: {
              id: 9500,
              date: "2026-11-25T19:00:00+00:00",
              status: { short: "NS", elapsed: null },
            },
            league: { id: 39, name: "Premier League", country: "England" },
            teams: {
              home: { id: 42, name: "Arsenal" },
              away: { id: 49, name: "Chelsea" },
            },
            goals: { home: null, away: null },
          },
        ],
      }),
      { status: 200 }
    );
  };
  const preProvider = new ApiFootballProvider({
    apiKey: "valid-api_key-1234567890",
    fetchImpl: preFetch,
    nowFn: () => nowMs,
    cacheRepo: dbRepo,
  });
  await preProvider.fetchFixtureDetail(9500);
  assert.equal(preCalls, 1);
  const preRec = await dbRepo.getFixtureDetail(9500, nowMs);
  assert.equal(preRec?.status, "PRE");
  assert.equal(preRec?.expiresAtMs, nowMs + CACHE_TTL_MS.PRE_LINEUPS);

  ApiFootballProvider.clearCachesForTesting();
  nowMs += CACHE_TTL_MS.PRE_LINEUPS + 1_000;
  await preProvider.fetchFixtureDetail(9500);
  assert.equal(preCalls, 2);

  ApiFootballProvider.clearCachesForTesting();
});

test("4. Expired DB snapshot still acts as staleFallback during 429 rate-limit after memory restart", async () => {
  ApiFootballProvider.clearCachesForTesting();
  const dbRepo = new MemoryFixtureCacheRepository();
  let nowMs = 1_770_000_000_000;
  let rateLimited = false;

  const mockFetch: typeof fetch = async () => {
    if (rateLimited) {
      return new Response(JSON.stringify({ message: "Too Many Requests" }), {
        status: 429,
      });
    }
    return new Response(
      JSON.stringify({
        errors: [],
        response: [
          {
            fixture: {
              id: 9901,
              date: "2026-11-26T15:00:00+00:00",
              status: { short: "1H", elapsed: 15 },
            },
            league: { id: 39, name: "Premier League", country: "England" },
            teams: {
              home: { id: 40, name: "Liverpool" },
              away: { id: 50, name: "Manchester City" },
            },
            goals: { home: 0, away: 0 },
            lineups: [
              {
                team: { id: 40, name: "Liverpool" },
                formation: "4-3-3",
                startXI: [
                  { player: { id: 301, name: "Mohamed Salah", number: 11, pos: "F" } },
                ],
                substitutes: [],
              },
            ],
            events: [],
          },
        ],
      }),
      { status: 200 }
    );
  };

  const provider = new ApiFootballProvider({
    apiKey: "valid-api_key-1234567890",
    fetchImpl: mockFetch,
    nowFn: () => nowMs,
    cacheRepo: dbRepo,
  });

  await provider.getMatchesByDate("2026-11-26");

  // Clear memory, expire TTL, trigger 429 -> falls back to stale DB snapshot gracefully
  ApiFootballProvider.clearCachesForTesting();
  nowMs += CACHE_TTL_MS.LIVE_FIXTURES + 10_000;
  rateLimited = true;

  const staleRes = await provider.getMatchesByDate("2026-11-26");
  assert.equal(staleRes.fromCache, true);
  assert.equal(staleRes.staleFallback, true);
  assert.equal(staleRes.matches.length, 1);
  assert.equal(staleRes.matches[0].id, "af-9901");

  ApiFootballProvider.clearCachesForTesting();
});

test("5. Core Drizzle PostgreSQL domain schema defines all 7 Phase 1-3 tables and status helpers", () => {
  assert.equal(getTableName(fixturesCache), "fixtures_cache");
  assert.equal(getTableName(users), "users");
  assert.equal(getTableName(holdings), "holdings");
  assert.equal(getTableName(ledgerEntries), "ledger_entries");
  assert.equal(getTableName(squadPosts), "squad_posts");
  assert.equal(getTableName(squadSlots), "squad_slots");
  assert.equal(getTableName(squadComments), "squad_comments");

  assert.equal(deriveDateMatchesStatus([]), "PRE");
  assert.equal(
    deriveSingleFixtureStatus({
      id: "af-1",
      leagueId: "pl-2021",
      leagueName: "프리미어리그",
      leagueCountry: "잉글랜드",
      status: "FT",
      kickoffTime: "종료",
      homeTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", formation: "4-3-3" },
      awayTeam: { id: "liv", name: "Liverpool", shortName: "LIV", color: "#C8102E", formation: "4-3-3" },
    }),
    "FT"
  );
});
