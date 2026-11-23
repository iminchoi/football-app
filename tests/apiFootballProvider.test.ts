import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiFootballProvider,
  CACHE_TTL_MS,
  mapApiFootballStatus,
  normalizeApiFootballEvents,
  normalizeApiFootballFixture,
  type ApiFootballRawEvent,
  type ApiFootballRawFixtureItem,
  type ApiFootballRawLineup,
} from "../src/lib/providers/index.ts";

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
