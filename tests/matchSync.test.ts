import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeTeamKey,
  deduplicateMatches,
  isSameMatchFixture,
  mergePinnedFixturesForToday,
  resolveFetchedMatchesForDate,
  resolveMatchClock,
  resolveMatchForPlayerView,
  resolveMatchScore,
  resolveSyncedMatch,
  resolveSyncedMatchFromContext,
  syncActiveMatchContext,
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
  // Shared TLA "FCB" must disambiguate FC Barcelona from FC Bayern München via club name
  assert.equal(
    canonicalizeTeamKey({ id: "fcb", name: "FC Barcelona", shortName: "FCB" }),
    "BAR"
  );
  assert.equal(
    canonicalizeTeamKey({ id: "fcb", name: "FC Bayern München", shortName: "FCB" }),
    "BAY"
  );
  assert.notEqual(
    canonicalizeTeamKey({ id: "fcb", name: "FC Barcelona", shortName: "FCB" }),
    canonicalizeTeamKey({ id: "fcb", name: "FC Bayern München", shortName: "FCB" })
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

test("isolates static fixture events on UPCOMING/non-SCORE_ONLY API matches, strips future lineup badges, and prefers LIVE over FT in context fallback", () => {
  // 1) UPCOMING API match enriched with static fixture never inherits dummy events/cards while preserving captaincy
  const upcomingApiNewArs = makeMatch({
    id: "fd-upcoming-na",
    utcDate: "2026-11-22T20:00:00Z",
    status: "UPCOMING",
    rawStatus: "TIMED",
    minute: undefined,
    providerMode: "DEEP_DATA",
    homeTeam: { id: "new", name: "Newcastle United", shortName: "NEW", color: "#241F20" },
    awayTeam: { id: "ars", name: "Arsenal FC", shortName: "ARS", color: "#EF0107" },
  });
  const fixtureWithEvents = makeMatch({
    id: "m-new-ars",
    dateKey: "TODAY",
    homeTeam: {
      id: "new",
      name: "Newcastle",
      shortName: "NEW",
      color: "#241F20",
      score: 1,
      lineup: [{ id: "p-burn", name: "Burn", position: "CB", yellowCards: 1, subOutMinute: 65, isCaptain: true }],
    },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
    events: [{ id: "ev-1", minute: 19, type: "GOAL", playerId: "p-havertz", playerName: "Havertz", source: "REAL" }],
  });
  const mergedUpcoming = mergePinnedFixturesForToday(
    [upcomingApiNewArs],
    [fixtureWithEvents],
    true,
    "2026-11-22"
  );
  assert.equal(mergedUpcoming.length, 1);
  assert.equal(mergedUpcoming[0].id, "fd-upcoming-na");
  assert.equal(mergedUpcoming[0].events, undefined);
  assert.equal(mergedUpcoming[0].homeTeam.lineup?.[0]?.yellowCards, undefined);
  assert.equal(mergedUpcoming[0].homeTeam.lineup?.[0]?.subOutMinute, undefined);
  assert.equal(mergedUpcoming[0].homeTeam.lineup?.[0]?.isCaptain, true);

  // 2) Future-date AMATCH_FALLBACK strips lineup yellowCards/subOutMinute alongside scores/events
  const liveAMatchWithLineup = makeMatch({
    id: "m-kor-jpn",
    dateKey: "TODAY",
    leagueId: "amatch",
    status: "LIVE",
    minute: 62,
    kickoffTime: "20:00",
    homeTeam: {
      id: "kor",
      name: "대한민국",
      shortName: "KOR",
      color: "#E6002D",
      score: 2,
      lineup: [{ id: "p-park", name: "박용우", position: "DM", yellowCards: 1, subOutMinute: 46, isCaptain: false }],
    },
    awayTeam: { id: "jpn", name: "일본", shortName: "JPN", color: "#00005B", score: 1 },
    events: [{ id: "ev-kj-1", minute: 27, type: "GOAL", playerId: "p-son", playerName: "손흥민", source: "REAL" }],
  });
  const futureAMatch = resolveFetchedMatchesForDate({
    source: "AMATCH_FALLBACK",
    matches: [liveAMatchWithLineup],
    fallbackMatches: [liveAMatchWithLineup],
    fixturePool: [fixtureWithEvents],
    requestedDateStr: "2026-11-25",
    todayStr: "2026-11-22",
  });
  assert.equal(futureAMatch[0].homeTeam.lineup?.[0]?.yellowCards, undefined);
  assert.equal(futureAMatch[0].homeTeam.lineup?.[0]?.subOutMinute, undefined);

  // 3) KST-today late-night kickoff (2026-11-21T17:30:00Z === 2026-11-22 02:30 KST) stays LIVE on 2026-11-22
  const kstMidnightMatch = resolveFetchedMatchesForDate({
    source: "FOOTBALL_DATA_API",
    matches: [
      makeMatch({
        id: "fd-kst-midnight",
        utcDate: "2026-11-21T17:30:00Z",
        status: "LIVE",
        rawStatus: "IN_PLAY",
        minute: 35,
      }),
    ],
    fallbackMatches: [],
    fixturePool: [],
    requestedDateStr: "2026-11-22",
    todayStr: "2026-11-22",
  });
  assert.equal(kstMidnightMatch[0].status, "LIVE");
  assert.equal(resolveMatchClock(kstMidnightMatch[0]).phase, "1H");

  // 4) resolveSyncedMatchFromContext team-pair fallback prefers LIVE match over an earlier past FT match
  const pastFtNewArs = makeMatch({
    id: "fd-old-na",
    utcDate: "2026-05-01T15:00:00Z",
    status: "FT",
    rawStatus: "FINISHED",
    minute: 90,
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 0 },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 3 },
  });
  const liveApiNewArs = makeMatch({
    id: "fd-live-na",
    utcDate: "2026-11-22T01:30:00Z",
    status: "LIVE",
    rawStatus: "IN_PLAY",
    minute: 41,
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 1 },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 1 },
  });
  const replacedLiveCtx = buildActiveMatchContext(
    makeMatch({ id: "m-new-ars", status: "LIVE", minute: 40 })
  );
  const resolvedLive = resolveSyncedMatchFromContext(replacedLiveCtx, [
    pastFtNewArs,
    liveApiNewArs,
  ]);
  assert.equal(resolvedLive?.id, "fd-live-na");
  assert.equal(resolveMatchClock(resolvedLive).minute, 41);
  assert.equal(resolveMatchScore(resolvedLive).display, "1 : 1");
});

test("future dates and multi-day past dates normalize status/scores cleanly without leaking LIVE state", () => {
  const liveAMatch = makeMatch({
    id: "m-kor-jpn",
    dateKey: "TODAY",
    leagueId: "amatch",
    isInternational: true,
    status: "LIVE",
    minute: 62,
    kickoffTime: "20:00",
    homeTeam: { id: "kor", name: "대한민국", shortName: "KOR", color: "#E6002D", score: 2 },
    awayTeam: { id: "jpn", name: "일본", shortName: "JPN", color: "#00005B", score: 1 },
    events: [{ id: "ev-kj-1", minute: 27, type: "GOAL", playerId: "p-son", playerName: "손흥민", source: "REAL" }],
  });

  const pinnedPool = [
    makeMatch({ id: "m-new-ars", dateKey: "TODAY", leagueId: "epl", minute: 72 }),
    makeMatch({
      id: "m-psg-bar",
      dateKey: "YESTERDAY",
      leagueId: "ucl",
      status: "FT",
      minute: 90,
      homeTeam: { id: "psg", name: "PSG", shortName: "PSG", color: "#004170", score: 2 },
      awayTeam: { id: "bar", name: "Barcelona", shortName: "BAR", color: "#A50044", score: 2 },
    }),
    makeMatch({
      id: "m-tot-mci",
      dateKey: "WEEKEND",
      leagueId: "epl",
      status: "UPCOMING",
      minute: undefined,
      kickoffTime: "21:30",
      homeTeam: { id: "tot", name: "토트넘", shortName: "TOT", color: "#132257" },
      awayTeam: { id: "mci", name: "맨시티", shortName: "MCI", color: "#6CABDD" },
    }),
  ];

  // Future date AMATCH_FALLBACK must never show LIVE scores/minutes or inject today's pinned match
  const futureAMatch = resolveFetchedMatchesForDate({
    source: "AMATCH_FALLBACK",
    matches: [liveAMatch],
    fallbackMatches: pinnedPool,
    fixturePool: pinnedPool,
    requestedDateStr: "2026-11-25",
    todayStr: "2026-11-22",
  });
  assert.equal(futureAMatch.length, 1);
  assert.equal(futureAMatch[0].id, "m-kor-jpn");
  assert.equal(futureAMatch[0].status, "UPCOMING");
  assert.equal(futureAMatch[0].rawStatus, "SCHEDULED");
  assert.equal(futureAMatch[0].minute, undefined);
  assert.equal(futureAMatch[0].homeTeam.score, undefined);
  assert.equal(futureAMatch[0].awayTeam.score, undefined);
  assert.equal(futureAMatch[0].events, undefined);
  assert.equal(resolveMatchClock(futureAMatch[0]).phase, "PRE");
  assert.equal(resolveMatchScore(futureAMatch[0]).display, "vs");

  // Future date UPCOMING card is NOT overwritten by today's LIVE store copy of m-kor-jpn
  const syncedFutureCard = resolveSyncedMatch(futureAMatch[0], [liveAMatch], "2026-11-22");
  assert.equal(resolveMatchClock(syncedFutureCard).phase, "PRE");
  assert.equal(resolveMatchScore(syncedFutureCard).display, "vs");

  // Clicking a player on a future UPCOMING card preserves PRE context even across live ticks
  const futureCtx = buildActiveMatchContext(syncedFutureCard);
  assert.equal(futureCtx.status, "PRE");
  const syncedFutureCtx = syncActiveMatchContext(futureCtx, [liveAMatch]);
  assert.equal(syncedFutureCtx?.status, "PRE");
  const resolvedFutureFromCtx = resolveSyncedMatchFromContext(futureCtx, [liveAMatch]);
  assert.equal(resolveMatchClock(resolvedFutureFromCtx).phase, "PRE");

  // Past date 2 days ago under MOCK_FALLBACK selects YESTERDAY (past) fixtures, never WEEKEND
  const twoDaysAgoMock = resolveFetchedMatchesForDate({
    source: "MOCK_FALLBACK",
    matches: pinnedPool,
    fallbackMatches: pinnedPool,
    fixturePool: pinnedPool,
    requestedDateStr: "2026-11-20",
    todayStr: "2026-11-22",
  });
  assert.equal(twoDaysAgoMock.length, 1);
  assert.equal(twoDaysAgoMock[0].id, "m-psg-bar");
  assert.equal(twoDaysAgoMock[0].status, "FT");

  // Past/future API match for NEW vs ARS on another date must NOT collapse into today's m-new-ars
  const futureApiNewArs = makeMatch({
    id: "fd-77777",
    utcDate: "2026-11-29T15:00:00Z",
    status: "UPCOMING",
    rawStatus: "TIMED",
    minute: undefined,
    homeTeam: { id: "new", name: "Newcastle United", shortName: "NEW", color: "#241F20" },
    awayTeam: { id: "ars", name: "Arsenal FC", shortName: "ARS", color: "#EF0107" },
  });
  assert.equal(isSameMatchFixture(pinnedPool[0], futureApiNewArs, "2026-11-22"), false);
  const todayCardWithFutureStore = resolveSyncedMatch(
    pinnedPool[0],
    [futureApiNewArs],
    "2026-11-22"
  );
  assert.equal(todayCardWithFutureStore.id, "m-new-ars");
  assert.equal(resolveMatchClock(todayCardWithFutureStore).phase, "2H");
});

test("edge-case rawStatuses (POSTPONED, HALF_TIME, AWARDED, 0:0 UPCOMING) and stale/unrelated contexts stay isolated", () => {
  // POSTPONED upcoming match with 0:0 API score must still display PRE / "vs"
  const postponed = makeMatch({
    status: "UPCOMING",
    rawStatus: "POSTPONED",
    minute: undefined,
    kickoffTime: "22:00",
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 0 },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 0 },
  });
  assert.equal(resolveMatchClock(postponed).phase, "PRE");
  assert.equal(resolveMatchScore(postponed).hasScore, false);
  assert.equal(resolveMatchScore(postponed).display, "vs");
  assert.equal(buildActiveMatchContext(postponed).status, "PRE");

  // HALF_TIME rawStatus matches HT phase in both resolveMatchClock and buildActiveMatchContext
  const htAlt = makeMatch({ status: "LIVE", rawStatus: "HALF_TIME", minute: 46 });
  assert.equal(resolveMatchClock(htAlt).phase, "HT");
  assert.equal(resolveMatchClock(htAlt).minute, 45);
  assert.equal(buildActiveMatchContext(htAlt).minute, 45);

  // AWARDED with stale minute resolves to FT / minute 90
  const awarded = makeMatch({ status: "LIVE", rawStatus: "AWARDED", minute: 72 });
  assert.equal(resolveMatchClock(awarded).phase, "FT");
  assert.equal(resolveMatchClock(awarded).minute, 90);
  assert.equal(buildActiveMatchContext(awarded).status, "FT");
  assert.equal(buildActiveMatchContext(awarded).minute, 90);

  // Non-null local match (rawStatus: undefined) must NOT inherit stale PAUSED/FINISHED from fallbackContext
  const liveLocal = makeMatch({
    id: "m-new-ars",
    status: "LIVE",
    rawStatus: undefined,
    minute: 72,
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 1 },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
  });
  const stalePausedCtx = buildActiveMatchContext(
    makeMatch({ id: "fd-other", status: "LIVE", rawStatus: "PAUSED", minute: 45 })
  );
  assert.equal(resolveMatchClock(liveLocal, stalePausedCtx).phase, "2H");
  assert.equal(resolveMatchClock(liveLocal, stalePausedCtx).minute, 72);

  // Unrelated activeMatchContext (PSG vs BAR) must NOT hijack Arsenal player resolution
  const psgBarFt = makeMatch({
    id: "m-psg-bar",
    status: "FT",
    rawStatus: "FINISHED",
    minute: 90,
    homeTeam: { id: "psg", name: "PSG", shortName: "PSG", color: "#004170", score: 2 },
    awayTeam: { id: "bar", name: "Barcelona", shortName: "BAR", color: "#A50044", score: 1 },
  });
  const resolvedForArsPlayer = resolveMatchForPlayerView({
    player: makePlayer({ matchId: "m-new-ars", teamId: "ars", teamShort: "ARS", teamName: "Arsenal" }),
    storeMatches: [liveLocal, psgBarFt],
    activeMatchContext: buildActiveMatchContext(psgBarFt),
  });
  assert.equal(resolvedForArsPlayer?.id, "m-new-ars");
  assert.equal(resolveMatchClock(resolvedForArsPlayer).phase, "2H");
});
