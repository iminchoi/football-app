import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiFootballError,
  ApiFootballProvider,
  CACHE_TTL_MS,
  mapApiFootballStatus,
  normalizeApiFootballEvents,
  normalizeApiFootballFixture,
  type ApiFootballRawEvent,
  type ApiFootballRawFixtureItem,
  type ApiFootballRawLineup,
} from "../src/lib/providers/index.ts";
import { resolveFetchedMatchesForDate } from "../src/lib/matchSync.ts";
import {
  resolveHoldingPlayer,
  resolvePlayerQuote,
} from "../src/lib/playerQuote.ts";

test("1. API-Football status, lineup, and event normalization maps to PRE/1H/HT/2H/FT and REAL DEEP_DATA events", () => {
  assert.deepEqual(mapApiFootballStatus("NS", null), {
    status: "UPCOMING",
    rawStatus: "SCHEDULED",
    phase: "PRE",
    minute: undefined,
  });
  assert.deepEqual(mapApiFootballStatus("1H", 34), {
    status: "LIVE",
    rawStatus: "1H",
    phase: "1H",
    minute: 34,
  });
  assert.deepEqual(mapApiFootballStatus("HT", 45), {
    status: "LIVE",
    rawStatus: "HT",
    phase: "HT",
    minute: 45,
  });
  assert.deepEqual(mapApiFootballStatus("2H", 73), {
    status: "LIVE",
    rawStatus: "2H",
    phase: "2H",
    minute: 73,
  });
  assert.deepEqual(mapApiFootballStatus("FT", 90), {
    status: "FT",
    rawStatus: "FINISHED",
    phase: "FT",
    minute: 90,
  });

  const rawEvents: ApiFootballRawEvent[] = [
    {
      time: { elapsed: 22 },
      team: { id: 33, name: "Arsenal" },
      player: { id: 101, name: "Bukayo Saka" },
      assist: { id: 102, name: "Martin Odegaard" },
      type: "Goal",
      detail: "Normal Goal",
    },
    {
      time: { elapsed: 58 },
      team: { id: 34, name: "Newcastle" },
      player: { id: 201, name: "Bruno Guimaraes" },
      type: "Card",
      detail: "Yellow Card",
    },
    {
      time: { elapsed: 81 },
      team: { id: 34, name: "Newcastle" },
      player: { id: 202, name: "Anthony Gordon" },
      type: "Card",
      detail: "Red Card",
    },
  ];

  const rawLineups: ApiFootballRawLineup[] = [
    {
      team: { id: 33, name: "Arsenal" },
      coach: { name: "Mikel Arteta" },
      formation: "4-3-3",
      startXI: [
        { player: { id: 100, name: "David Raya", number: 22, pos: "G" } },
        { player: { id: 101, name: "Bukayo Saka", number: 7, pos: "F" } },
      ],
      substitutes: [
        { player: { id: 103, name: "Leandro Trossard", number: 19, pos: "F" } },
      ],
    },
    {
      team: { id: 34, name: "Newcastle" },
      coach: { name: "Eddie Howe" },
      formation: "4-3-3",
      startXI: [
        { player: { id: 200, name: "Nick Pope", number: 22, pos: "G" } },
        { player: { id: 201, name: "Bruno Guimaraes", number: 39, pos: "M" } },
      ],
      substitutes: [],
    },
  ];

  const rawFixture: ApiFootballRawFixtureItem = {
    fixture: {
      id: 998877,
      date: "2026-11-23T15:00:00+00:00",
      status: { short: "2H", elapsed: 82 },
    },
    league: { id: 39, name: "Premier League", country: "England" },
    teams: {
      home: { id: 33, name: "Arsenal" },
      away: { id: 34, name: "Newcastle" },
    },
    goals: { home: 1, away: 0 },
    events: rawEvents,
    lineups: rawLineups,
  };

  const normalized = normalizeApiFootballFixture(rawFixture);
  assert.equal(normalized.id, "af-998877");
  assert.equal(normalized.status, "LIVE");
  assert.equal(normalized.rawStatus, "2H");
  assert.equal(normalized.minute, 82);
  assert.equal(normalized.providerMode, "DEEP_DATA");
  assert.equal(normalized.usesDummyLineup, false);
  assert.equal(normalized.homeTeam.score, 1);
  assert.equal(normalized.awayTeam.score, 0);
  assert.equal(normalized.homeTeam.lineup?.length, 2);
  assert.equal(normalized.homeTeam.bench?.length, 1);

  assert.ok(normalized.events && normalized.events.length === 4);
  for (const ev of normalized.events) {
    assert.equal(ev.source, "REAL");
    assert.equal(ev.estimated, false);
    assert.deepEqual(ev.metadata, { estimated: false });
  }

  const { teamEvents } = normalizeApiFootballEvents(
    rawEvents,
    "af-998877",
    33,
    "Arsenal",
    "Newcastle"
  );
  assert.equal(teamEvents.length, 4);
  assert.equal(teamEvents[0].kind, "GOAL");
  assert.equal(teamEvents[0].goalContext, "OPENER");
  assert.equal(teamEvents[1].kind, "ASSIST");
  assert.equal(teamEvents[2].kind, "YELLOW_CARD");
  assert.equal(teamEvents[3].kind, "RED_CARD");
});

test("2. ApiFootballProvider caches date queries by TTL and falls back to last cached snapshot on 429 or error", async () => {
  ApiFootballProvider.clearCachesForTesting();

  let currentTimeMs = 1_700_000_000_000;
  let callCount = 0;
  let shouldReturn429 = false;

  const mockFetch: typeof fetch = async (input) => {
    callCount += 1;
    const url = String(input);

    if (shouldReturn429) {
      return new Response(JSON.stringify({ message: "Too Many Requests" }), {
        status: 429,
      });
    }

    if (url.includes("/fixtures?date=")) {
      const payload = {
        errors: [],
        response: [
          {
            fixture: {
              id: 5001,
              date: "2026-11-23T12:30:00+00:00",
              status: { short: "1H", elapsed: 28 },
            },
            league: { id: 39, name: "Premier League", country: "England" },
            teams: {
              home: { id: 40, name: "Liverpool" },
              away: { id: 50, name: "Manchester City" },
            },
            goals: { home: 1, away: 1 },
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
            events: [
              {
                time: { elapsed: 19 },
                team: { id: 40, name: "Liverpool" },
                player: { id: 301, name: "Mohamed Salah" },
                type: "Goal",
                detail: "Normal Goal",
              },
            ],
          },
        ],
      };
      return new Response(JSON.stringify(payload), { status: 200 });
    }

    return new Response(JSON.stringify({ errors: [], response: [] }), {
      status: 200,
    });
  };

  const provider = new ApiFootballProvider({
    apiKey: "testapikey1234567890abcdef",
    fetchImpl: mockFetch,
    nowFn: () => currentTimeMs,
  });

  // 1) Initial fetch hits upstream
  const first = await provider.fetchMatchesForDate("2026-11-23");
  assert.equal(first.fromCache, false);
  assert.equal(first.staleFallback, false);
  assert.equal(first.matches.length, 1);
  assert.equal(callCount, 1);

  // 2) Second fetch within LIVE_FIXTURES TTL (35s) is served from memory cache without calling fetch
  currentTimeMs += 20_000;
  const second = await provider.fetchMatchesForDate("2026-11-23");
  assert.equal(second.fromCache, true);
  assert.equal(second.staleFallback, false);
  assert.equal(callCount, 1);

  // 3) After TTL expires (e.g. +40s > 35s), upstream returns 429 -> provider returns stale cached snapshot safely
  currentTimeMs += CACHE_TTL_MS.LIVE_FIXTURES + 5_000;
  shouldReturn429 = true;
  const third = await provider.fetchMatchesForDate("2026-11-23");
  assert.equal(third.fromCache, true);
  assert.equal(third.staleFallback, true);
  assert.equal(third.matches.length, 1);
  assert.equal(third.matches[0].id, "af-5001");
  assert.equal(callCount, 2);

  ApiFootballProvider.clearCachesForTesting();
});

test("3. Date-scoped API_FOOTBALL queries isolate cache per date and preserve empty/past/future dates without demo fallback", async () => {
  ApiFootballProvider.clearCachesForTesting();

  const seenUrls: string[] = [];
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    seenUrls.push(url);

    if (url.includes("date=2026-11-18")) {
      return new Response(
        JSON.stringify({
          errors: [],
          response: [
            {
              fixture: {
                id: 7001,
                date: "2026-11-18T19:45:00+00:00",
                status: { short: "FT", elapsed: 90 },
              },
              league: { id: 39, name: "Premier League", country: "England" },
              teams: {
                home: { id: 42, name: "Arsenal" },
                away: { id: 49, name: "Chelsea" },
              },
              goals: { home: 2, away: 1 },
            },
          ],
        }),
        { status: 200 }
      );
    }

    if (url.includes("date=2026-11-26")) {
      return new Response(
        JSON.stringify({ errors: [], response: [] }),
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

  const pastRes = await provider.fetchMatchesForDate("2026-11-18", {
    enrichTopDetailsCount: 0,
  });
  assert.equal(pastRes.matches.length, 1);
  assert.equal(pastRes.matches[0].status, "FT");
  assert.equal(pastRes.matches[0].providerMode, "DEEP_DATA");

  const emptyFutureRes = await provider.fetchMatchesForDate("2026-11-26", {
    enrichTopDetailsCount: 0,
  });
  assert.equal(emptyFutureRes.matches.length, 0);
  assert.equal(emptyFutureRes.fromCache, false);

  // Confirm resolveFetchedMatchesForDate keeps empty API_FOOTBALL date empty instead of falling back to demo fixtures
  const mergedEmptyFuture = resolveFetchedMatchesForDate({
    source: "API_FOOTBALL",
    matches: emptyFutureRes.matches,
    fallbackMatches: pastRes.matches,
    fixturePool: pastRes.matches,
    requestedDateStr: "2026-11-26",
    todayStr: "2026-11-23",
  });
  assert.equal(mergedEmptyFuture.length, 0);

  // Second query on 2026-11-26 hits cache without another external call
  const cachedEmpty = await provider.fetchMatchesForDate("2026-11-26", {
    enrichTopDetailsCount: 0,
  });
  assert.equal(cachedEmpty.fromCache, true);
  assert.equal(seenUrls.length, 2);

  ApiFootballProvider.clearCachesForTesting();
});

test("4. Free Plan 3-day window PLAN_WINDOW error returns clean Korean userMessage, negative-caches, and does not corrupt valid date caches", async () => {
  ApiFootballProvider.clearCachesForTesting();

  let nowMs = 1_700_000_000_000;
  let outOfWindowCalls = 0;
  let inWindowCalls = 0;

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("date=2026-11-28")) {
      outOfWindowCalls += 1;
      return new Response(
        JSON.stringify({
          errors: {
            plan: "Free plans do not have access to this date, try from 2026-11-22 to 2026-11-24.",
          },
          response: [],
        }),
        { status: 200 }
      );
    }

    inWindowCalls += 1;
    return new Response(
      JSON.stringify({
        errors: [],
        response: [
          {
            fixture: {
              id: 8001,
              date: "2026-11-23T19:00:00+00:00",
              status: { short: "NS", elapsed: null },
            },
            league: { id: 39, name: "Premier League", country: "England" },
            teams: {
              home: { id: 40, name: "Liverpool" },
              away: { id: 42, name: "Arsenal" },
            },
            goals: { home: null, away: null },
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
  });

  // Valid in-window date populates positive cache
  const validRes = await provider.fetchMatchesForDate("2026-11-23", {
    enrichTopDetailsCount: 0,
  });
  assert.equal(validRes.matches.length, 1);
  assert.equal(inWindowCalls, 1);

  // Out-of-window date throws typed ApiFootballError with clean Korean message (no raw JSON)
  await assert.rejects(
    () => provider.fetchMatchesForDate("2026-11-28"),
    (err: unknown) => {
      assert.ok(err instanceof ApiFootballError);
      assert.equal(err.code, "PLAN_WINDOW");
      assert.ok(err.userMessage.includes("3일"));
      assert.ok(!err.userMessage.includes("{"));
      return true;
    }
  );
  assert.equal(outOfWindowCalls, 1);

  // Repeat click on the same out-of-window date within TTL rethrows cached error without burning quota
  nowMs += 60_000;
  await assert.rejects(
    () => provider.fetchMatchesForDate("2026-11-28"),
    (err: unknown) => err instanceof ApiFootballError && err.code === "PLAN_WINDOW"
  );
  assert.equal(outOfWindowCalls, 1);

  // Valid in-window cache remains completely untouched
  const stillCached = await provider.fetchMatchesForDate("2026-11-23", {
    enrichTopDetailsCount: 0,
  });
  assert.equal(stillCached.fromCache, true);
  assert.equal(stillCached.matches.length, 1);
  assert.equal(inWindowCalls, 1);

  ApiFootballProvider.clearCachesForTesting();
});

test("5. resolveHoldingPlayer preserves dynamic API-Football holdings and matchContext consistently across PRE/LIVE quotes", () => {
  const holding = {
    playerId: "af-p-90123",
    quantity: 3,
    avgBuyPrice: 12400,
    matchContext: {
      matchId: "af-8001",
      competition: "Premier League",
      homeTeam: "LIV",
      awayTeam: "ARS",
      homeScore: 0,
      awayScore: 0,
      status: "PRE" as const,
      rawStatus: "SCHEDULED",
      kickoffTime: "04:00",
      minute: 0,
    },
  };

  const resolved = resolveHoldingPlayer(
    holding,
    [],
    [
      {
        id: "tx-1",
        timestamp: "2026-11-23T01:00:00Z",
        type: "BUY",
        playerId: "af-p-90123",
        playerName: "Dominik Szoboszlai",
        teamShort: "LIV",
        quantity: 3,
        unitPrice: 12400,
        totalAmount: 37200,
        balanceAfter: 62800,
      },
    ],
    {
      "af-p-90123": {
        openPrice: 12400,
        previousPrice: 12400,
        currentPrice: 13100,
        highPrice: 13100,
        lowPrice: 12400,
        volume: 12,
        priceHistory: [
          { minute: 0, price: 12400 },
          { minute: 30, price: 13100 },
        ],
        events: [],
      },
    }
  );

  assert.equal(resolved.id, "af-p-90123");
  assert.equal(resolved.name, "Dominik Szoboszlai");
  assert.equal(resolved.matchId, "af-8001");
  assert.equal(resolved.currentPrice, 13100);

  // Under UPCOMING (PRE), quote pins cleanly to basePrice (12400, 0%)
  const preQuote = resolvePlayerQuote(resolved, "UPCOMING");
  assert.equal(preQuote.isPreMatch, true);
  assert.equal(preQuote.currentPrice, 12400);
  assert.equal(preQuote.diff, 0);
  assert.equal(preQuote.changePct, 0);

  // Under LIVE, quote reflects live price (13100)
  const liveQuote = resolvePlayerQuote(resolved, "LIVE");
  assert.equal(liveQuote.isPreMatch, false);
  assert.equal(liveQuote.currentPrice, 13100);
  assert.equal(liveQuote.diff, 700);
});
