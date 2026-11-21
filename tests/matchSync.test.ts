import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeTeamKey,
  deduplicateMatches,
  mergePinnedFixturesForToday,
  resolveFetchedMatchesForDate,
  resolveMatchClock,
  resolveMatchForPlayerView,
  resolveMatchScore,
  resolveSyncedMatch,
  resolveSyncedMatchFromContext,
} from "../src/lib/matchSync.ts";
import { buildActiveMatchContext, type Match, type Player } from "../src/types/index.ts";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "m-base",
    leagueId: "pl-2021",
    leagueName: "프리미어리그",
    leagueCountry: "잉글랜드",
    status: "LIVE",
    minute: 62,
    kickoffTime: "02:30",
    homeTeam: {
      id: "new",
      name: "Newcastle",
      shortName: "NEW",
      color: "#241F20",
      score: 1,
      formation: "4-2-3-1",
    },
    awayTeam: {
      id: "ars",
      name: "Arsenal",
      shortName: "ARS",
      color: "#EF0107",
      score: 2,
      formation: "4-2-3-1",
    },
    ...overrides,
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p-odegaard",
    name: "마르틴 외데고르",
    englishName: "Martin Odegaard",
    nationalTeam: "노르웨이",
    matchId: "fd-560651",
    teamId: "ars",
    teamName: "Arsenal",
    teamShort: "ARS",
    teamColor: "#EF0107",
    position: "CAM",
    backNumber: 8,
    tier: "S",
    totalShares: 500,
    marketSupply: 200,
    basePrice: 15000,
    openPrice: 15000,
    initialPrice: 15000,
    currentPrice: 15000,
    previousPrice: 15000,
    priceHistory: [{ minute: 0, timeLabel: "0'", price: 15000 }],
    lastEvent: { text: "선발 출전", sentiment: "neutral", minute: 0 },
    stats: {
      rating: 7.5,
      goals: 0,
      assists: 0,
      shotsOnTarget: 0,
      keyPasses: 0,
    },
    ...overrides,
  };
}

test("canonicalizeTeamKey unifies English API names, TLAs, and Korean club names", () => {
  assert.equal(
    canonicalizeTeamKey({ id: "new", name: "Newcastle United FC", shortName: "NEW" }),
    canonicalizeTeamKey({ id: "newcastle", name: "뉴캐슬 유나이티드", shortName: "뉴캐슬" })
  );
  assert.equal(
    canonicalizeTeamKey({ id: "ars", name: "Arsenal FC", shortName: "ARS" }),
    canonicalizeTeamKey({ id: "arsenal", name: "아스널", shortName: "아스날" })
  );
  assert.notEqual(
    canonicalizeTeamKey({ id: "new", name: "Newcastle", shortName: "NEW" }),
    canonicalizeTeamKey({ id: "ars", name: "Arsenal", shortName: "ARS" })
  );
});

test("deduplicateMatches collapses API and local duplicate fixtures for the same game while preferring live API state", () => {
  const localFixture = makeMatch({
    id: "m-new-ars",
    dateKey: "TODAY",
    leagueId: "epl",
    minute: 72,
    homeManager: "Matthias Jaissle",
    awayManager: "Mikel Arteta",
    homeTeam: {
      id: "new",
      name: "뉴캐슬",
      shortName: "NEW",
      color: "#241F20",
      score: 1,
      formation: "4-2-3-1",
      lineup: [{ id: "p-osula", name: "Osula", position: "ST", shirtNumber: 10, isCaptain: false, yellowCards: 1 }],
    },
    awayTeam: {
      id: "ars",
      name: "아스날",
      shortName: "ARS",
      color: "#EF0107",
      score: 2,
      formation: "4-2-3-1",
      lineup: [{ id: "p-havertz", name: "Havertz", position: "ST", shirtNumber: 29 }],
    },
    events: [{ id: "ev-1", minute: 19, type: "GOAL", playerId: "p-havertz", playerName: "Havertz", source: "REAL" }],
  });

  const liveScoreOnly = makeMatch({
    id: "fd-560651",
    utcDate: "2026-11-22T01:30:00Z",
    leagueId: "pl-2021",
    providerMode: "SCORE_ONLY",
    usesDummyLineup: true,
    status: "LIVE",
    rawStatus: "IN_PLAY",
    minute: 31,
    homeTeam: { id: "new", name: "Newcastle United FC", shortName: "NEW", color: "#241F20", score: 0, formation: "4-3-3" },
    awayTeam: { id: "ars", name: "Arsenal FC", shortName: "ARS", color: "#EF0107", score: 1, formation: "4-3-3" },
  });

  const deduped = deduplicateMatches([localFixture, liveScoreOnly], true);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "fd-560651");
  assert.equal(deduped[0].providerMode, "SCORE_ONLY");
  assert.equal(deduped[0].minute, 31);
  assert.equal(deduped[0].homeTeam.score, 0);
  assert.equal(deduped[0].awayTeam.score, 1);
  assert.equal(deduped[0].homeManager, "Matthias Jaissle");
  assert.equal(deduped[0].awayManager, "Mikel Arteta");
  assert.equal(deduped[0].usesDummyLineup, false);
  // Static fixture events & cards must not bleed into live SCORE_ONLY match
  assert.equal(deduped[0].events, undefined);
  assert.equal(deduped[0].homeTeam.lineup?.[0]?.yellowCards, undefined);
});

test("resolveFetchedMatchesForDate runs one unified merge path across API, fallback, and past dates", () => {
  const pinnedPool = [
    makeMatch({ id: "m-new-ars", dateKey: "TODAY", leagueId: "epl", minute: 72 }),
    makeMatch({
      id: "m-psg-bar",
      dateKey: "YESTERDAY",
      leagueId: "ucl",
      status: "FT",
      minute: 90,
      homeTeam: { id: "psg", name: "PSG", shortName: "PSG", color: "#004170", score: 2 },
      awayTeam: { id: "bar", name: "Barcelona", shortName: "BAR", color: "#A50044", score: 1 },
    }),
  ];

  const apiToday = resolveFetchedMatchesForDate({
    source: "FOOTBALL_DATA_API",
    matches: [
      makeMatch({
        id: "fd-9001",
        utcDate: "2026-11-22T02:00:00Z",
        providerMode: "SCORE_ONLY",
        minute: 18,
        homeTeam: { id: "new", name: "Newcastle United", shortName: "NEW", color: "#241F20", score: 0 },
        awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 0 },
      }),
    ],
    fallbackMatches: pinnedPool,
    fixturePool: pinnedPool,
    requestedDateStr: "2026-11-22",
    todayStr: "2026-11-22",
  });
  assert.equal(apiToday.length, 1);
  assert.equal(apiToday[0].id, "fd-9001");

  const mockToday = resolveFetchedMatchesForDate({
    source: "MOCK_FALLBACK",
    matches: pinnedPool,
    fallbackMatches: pinnedPool,
    fixturePool: pinnedPool,
    requestedDateStr: "2026-11-22",
    todayStr: "2026-11-22",
  });
  assert.equal(mockToday.length, 1);
  assert.equal(mockToday[0].id, "m-new-ars");

  const pastDay = resolveFetchedMatchesForDate({
    source: "FOOTBALL_DATA_API",
    matches: [
      makeMatch({
        id: "fd-8888",
        utcDate: "2026-11-21T12:00:00Z",
        status: "LIVE",
        minute: 60,
        homeTeam: { id: "che", name: "Chelsea", shortName: "CHE", color: "#034694", score: 2 },
        awayTeam: { id: "liv", name: "Liverpool", shortName: "LIV", color: "#C8102E", score: 1 },
      }),
    ],
    fallbackMatches: pinnedPool,
    fixturePool: pinnedPool,
    requestedDateStr: "2026-11-21",
    todayStr: "2026-11-22",
  });
  assert.equal(pastDay.length, 1);
  assert.equal(pastDay[0].status, "FT");
  assert.equal(pastDay[0].rawStatus, "FINISHED");
  assert.equal(pastDay[0].minute, 90);
});

test("resolveMatchClock & resolveMatchScore return consistent phase, labels, and scores for PRE, 1H, HT, 2H, 90+, and FT", () => {
  const pre = makeMatch({ status: "UPCOMING", rawStatus: "TIMED", minute: undefined, kickoffTime: "23:30" });
  const preClock = resolveMatchClock(pre);
  const preScore = resolveMatchScore(pre);
  assert.equal(preClock.phase, "PRE");
  assert.equal(preClock.shortLabel, "PRE");
  assert.equal(preClock.cardLabel, "23:30");
  assert.equal(preClock.chartLabel, "경기 예정 (PRE)");
  assert.equal(preScore.display, "vs");

  const firstHalf = makeMatch({ status: "LIVE", rawStatus: "IN_PLAY", minute: 38 });
  const fhClock = resolveMatchClock(firstHalf);
  assert.equal(fhClock.phase, "1H");
  assert.equal(fhClock.shortLabel, "1H 38'");
  assert.equal(fhClock.cardLabel, "전반 38'");
  assert.equal(fhClock.chartLabel, "LIVE 1H 38'");

  const halfTime = makeMatch({ status: "LIVE", rawStatus: "PAUSED", minute: 45 });
  const htClock = resolveMatchClock(halfTime);
  assert.equal(htClock.phase, "HT");
  assert.equal(htClock.isHalfTime, true);
  assert.equal(htClock.shortLabel, "HT");
  assert.equal(htClock.cardLabel, "하프타임 (HT)");
  assert.equal(htClock.chartLabel, "LIVE HT");

  // buildActiveMatchContext preserves rawStatus so HT is never lost across views
  const htCtx = buildActiveMatchContext(halfTime);
  assert.equal(htCtx.rawStatus, "PAUSED");
  assert.equal(resolveMatchClock(null, htCtx).phase, "HT");

  const stoppage = makeMatch({ status: "LIVE", rawStatus: "IN_PLAY", minute: 92 });
  const stClock = resolveMatchClock(stoppage);
  assert.equal(stClock.phase, "2H");
  assert.equal(stClock.shortLabel, "2H 90+2'");
  assert.equal(stClock.cardLabel, "후반 90+2'");
  assert.equal(stClock.chartLabel, "LIVE 2H 90+2'");

  const finished = makeMatch({ status: "FT", rawStatus: "FINISHED", minute: 90 });
  const ftClock = resolveMatchClock(finished);
  const ftScore = resolveMatchScore(finished);
  assert.equal(ftClock.phase, "FT");
  assert.equal(ftClock.shortLabel, "FT");
  assert.equal(ftClock.cardLabel, "경기 종료 (FT)");
  assert.equal(ftClock.chartLabel, "당일 경기 (FT)");
  assert.equal(ftScore.display, "1 : 2");
});

test("schedule card, lineup modal, market summary, chart, and header stay synchronized after live ticks and goals", () => {
  const initialCardMatch = makeMatch({
    id: "fd-560651",
    status: "LIVE",
    rawStatus: "IN_PLAY",
    minute: 72,
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 1 },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
  });

  // User opened player trade panel at minute 72 (1 : 2)
  const staleClickContext = buildActiveMatchContext(initialCardMatch);

  // Store ticks forward to minute 78 and home team equalizes (2 : 2)
  const liveStoreMatches: Match[] = [
    makeMatch({
      id: "fd-560651",
      status: "LIVE",
      rawStatus: "IN_PLAY",
      minute: 78,
      homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 2 },
      awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
    }),
  ];

  const scheduleMatch = resolveSyncedMatch(initialCardMatch, liveStoreMatches);
  const modalMatch = resolveSyncedMatch(initialCardMatch, liveStoreMatches);
  const headerMatch = resolveSyncedMatchFromContext(staleClickContext, liveStoreMatches);
  const chartMatch = resolveMatchForPlayerView({
    player: makePlayer({ matchId: "fd-560651" }),
    storeMatches: liveStoreMatches,
    activeMatchContext: staleClickContext,
    belongsToMatch: () => true,
  });

  // Every view resolves the exact same minute, phase, and score (zero drift)
  const views = [scheduleMatch, modalMatch, headerMatch, chartMatch];
  for (const v of views) {
    assert.ok(v);
    assert.equal(resolveMatchClock(v).minute, 78);
    assert.equal(resolveMatchClock(v).phase, "2H");
    assert.equal(resolveMatchScore(v).display, "2 : 2");
  }

  // Finalized past-date FT card & FT context must NOT be overridden by a live store mock
  const pastFtCard = makeMatch({
    id: "fd-560651",
    status: "FT",
    rawStatus: "FINISHED",
    minute: 90,
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 1 },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
  });
  const ftCtx = buildActiveMatchContext(pastFtCard);

  assert.equal(resolveMatchClock(resolveSyncedMatch(pastFtCard, liveStoreMatches)).phase, "FT");
  assert.equal(resolveMatchScore(resolveSyncedMatch(pastFtCard, liveStoreMatches)).display, "1 : 2");
  const ftResolved = resolveSyncedMatchFromContext(ftCtx, liveStoreMatches);
  assert.equal(resolveMatchClock(ftResolved, ftCtx).phase, "FT");
  assert.equal(resolveMatchScore(ftResolved, ftCtx).display, "1 : 2");
});

test("mergePinnedFixturesForToday keeps unrelated live SCORE_ONLY API fixtures untouched while deduplicating matching ones", () => {
  const pinnedPool = [
    makeMatch({
      id: "m-new-ars",
      dateKey: "TODAY",
      leagueId: "epl",
      homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 1 },
      awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
      events: [{ id: "ev-g", minute: 19, type: "GOAL", playerId: "p-1", playerName: "Havertz", source: "REAL" }],
    }),
  ];

  const apiFixtures = [
    makeMatch({
      id: "fd-100",
      providerMode: "SCORE_ONLY",
      minute: 40,
      homeTeam: { id: "liv", name: "Liverpool", shortName: "LIV", color: "#C8102E", score: 2 },
      awayTeam: { id: "mci", name: "Man City", shortName: "MCI", color: "#6CABDD", score: 1 },
    }),
    makeMatch({
      id: "fd-101",
      providerMode: "SCORE_ONLY",
      minute: 12,
      homeTeam: { id: "new", name: "Newcastle United", shortName: "NEW", color: "#241F20", score: 0 },
      awayTeam: { id: "ars", name: "Arsenal FC", shortName: "ARS", color: "#EF0107", score: 0 },
    }),
  ];

  const merged = mergePinnedFixturesForToday(apiFixtures, pinnedPool, true);
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["fd-100", "fd-101"]
  );
  assert.equal(merged[0].events, undefined);
  assert.equal(merged[1].events, undefined);
  assert.equal(merged[1].homeTeam.score, 0);
  assert.equal(merged[1].awayTeam.score, 0);
});
