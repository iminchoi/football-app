import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLineupEntryMeta,
  mergePinnedFixturesForToday,
  reconcileTeamGoalMarkers,
  resolveMatchManagers,
  resolvePlayerMatchStatus,
} from "../src/lib/lineupStatus.ts";
import { extractInitialMatchEvents } from "../src/lib/priceEngine.ts";
import { FixtureReplayProvider } from "../src/lib/providers/index.ts";
import type { Match, Player } from "../src/types/index.ts";

function makeBasePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p-test-1",
    name: "테스트 선수",
    englishName: "Test Player",
    nationalTeam: "잉글랜드",
    matchId: "m-test-1",
    teamId: "eng",
    teamName: "잉글랜드",
    teamShort: "ENG",
    teamColor: "#1E3A8A",
    position: "LW",
    backNumber: 11,
    tier: "A",
    totalShares: 1000,
    marketSupply: 300,
    basePrice: 12000,
    openPrice: 12000,
    initialPrice: 12000,
    currentPrice: 12000,
    previousPrice: 12000,
    priceHistory: [{ minute: 0, timeLabel: "0'", price: 12000 }],
    lastEvent: { text: "선발 출전", sentiment: "neutral", minute: 0 },
    stats: {
      rating: 7.4,
      goals: 0,
      assists: 0,
      shotsOnTarget: 0,
      keyPasses: 0,
    },
    ...overrides,
  };
}

function makeBaseMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "m-test-1",
    leagueId: "ec",
    leagueName: "UEFA 유로",
    leagueCountry: "유럽",
    status: "LIVE",
    minute: 88,
    kickoffTime: "04:00",
    homeTeam: {
      id: "eng",
      name: "잉글랜드",
      shortName: "ENG",
      color: "#1E3A8A",
      score: 1,
      formation: "4-2-3-1",
      lineup: [],
      bench: [],
    },
    awayTeam: {
      id: "esp",
      name: "스페인",
      shortName: "ESP",
      color: "#AA151B",
      score: 1,
      formation: "4-3-3",
      lineup: [],
      bench: [],
    },
    ...overrides,
  };
}

test("resolves starter sub-out, bench sub-in, and re-substitution (both subInMinute & subOutMinute)", () => {
  const starter = makeBasePlayer({ id: "p-gordon", name: "앤서니 고든", englishName: "Anthony Gordon" });
  const benchSub = makeBasePlayer({ id: "p-palmer", name: "콜 파머", englishName: "Cole Palmer", position: "CAM" });
  const reSubbed = makeBasePlayer({ id: "p-foden", name: "필 포든", englishName: "Phil Foden", position: "RAM" });

  const match = makeBaseMatch({
    homeTeam: {
      id: "eng",
      name: "잉글랜드",
      shortName: "ENG",
      color: "#1E3A8A",
      score: 1,
      formation: "4-2-3-1",
      lineup: [{ id: "p-gordon", name: "앤서니 고든", position: "LAM", shirtNumber: 11, subOutMinute: 65 }],
      bench: [
        { id: "p-palmer", name: "콜 파머", position: "CAM", shirtNumber: 20 },
        { id: "p-foden", name: "필 포든", position: "RAM", shirtNumber: 47, subInMinute: 65, subOutMinute: 90 },
      ],
    },
    events: [
      {
        id: "ev-sub-65",
        minute: 65,
        type: "SUB",
        playerName: "콜 파머",
        playerOutId: "p-gordon",
        playerOutName: "앤서니 고든",
        playerInId: "p-palmer",
        playerInName: "콜 파머",
        source: "REAL",
      },
    ],
  });

  const starterStatus = resolvePlayerMatchStatus({ player: starter, match });
  assert.equal(starterStatus.subOutMinute, 65);
  assert.equal(starterStatus.subInMinute, undefined);

  const benchSubStatus = resolvePlayerMatchStatus({ player: benchSub, match });
  assert.equal(benchSubStatus.subInMinute, 65);
  assert.equal(benchSubStatus.subOutMinute, undefined);

  const reSubbedStatus = resolvePlayerMatchStatus({ player: reSubbed, match });
  assert.equal(reSubbedStatus.subInMinute, 65);
  assert.equal(reSubbedStatus.subOutMinute, 90);
});

test("resolves yellow cards, red cards, and compound events without double counting across sources", () => {
  const defender = makeBasePlayer({
    id: "p-carvajal",
    name: "다니 카르바할",
    englishName: "Dani Carvajal",
    position: "RB",
    events: [
      {
        id: "ev-yc-42",
        playerId: "p-carvajal",
        minute: 42,
        type: "YELLOW_CARD",
        description: "경고",
        priceImpactPercent: -2.5,
        source: "REAL",
      },
    ],
    priceHistory: [
      { minute: 0, timeLabel: "0'", price: 12000 },
      {
        minute: 42,
        timeLabel: "42'",
        price: 11700,
        event: { type: "YELLOW_CARD", label: "🟨 경고 (-2.5%)", impactPercent: -2.5, source: "REAL" },
      },
    ],
  });

  const match = makeBaseMatch({
    events: [
      { id: "m-yc-42", minute: 42, type: "YELLOW_CARD", playerId: "p-carvajal", playerName: "다니 카르바할", source: "REAL" },
      { id: "m-rc-71", minute: 71, type: "RED_CARD", playerId: "p-carvajal", playerName: "다니 카르바할", source: "REAL" },
      { id: "m-sub-80", minute: 80, type: "SUB_OUT", playerId: "p-carvajal", playerName: "다니 카르바할", source: "REAL" },
    ],
  });

  const status = resolvePlayerMatchStatus({ player: defender, match });
  // Minute 42 yellow card appears in match.events, player.events, and priceHistory — must count as 1, not 3
  assert.equal(status.yellowCards, 1);
  assert.equal(status.redCards, 1);
  assert.equal(status.subOutMinute, 80);
});

test("connects FixtureReplayProvider YELLOW_CARD, RED_CARD, SUB_IN, and SUB_OUT events while preserving source", async () => {
  const provider = new FixtureReplayProvider({
    "m-replay-ui": [
      {
        id: "rep-yc",
        matchId: "m-replay-ui",
        minute: 31,
        teamSide: "HOME",
        kind: "YELLOW_CARD",
        actorPlayerId: "p-starter",
        source: "REAL",
        estimated: false,
        metadata: { estimated: false },
      },
      {
        id: "rep-sub-out",
        matchId: "m-replay-ui",
        minute: 80,
        teamSide: "HOME",
        kind: "SUB_OUT",
        actorPlayerId: "p-starter",
        source: "REAL",
        estimated: false,
        metadata: { estimated: false },
      },
      {
        id: "rep-sub-in",
        matchId: "m-replay-ui",
        minute: 80,
        teamSide: "HOME",
        kind: "SUB_IN",
        actorPlayerId: "p-bench",
        source: "REAL",
        estimated: false,
        metadata: { estimated: false },
      },
      {
        id: "rep-rc",
        matchId: "m-replay-ui",
        minute: 89,
        teamSide: "HOME",
        kind: "RED_CARD",
        actorPlayerId: "p-bench",
        source: "REAL",
        estimated: false,
        metadata: { estimated: false },
      },
    ],
  });

  const evalRes = await provider.evaluateSnapshot(
    null,
    { matchId: "m-replay-ui", homeScore: 0, awayScore: 0, status: "LIVE", minute: 90 },
    [],
    [
      { playerId: "p-starter", teamSide: "HOME", position: "CM", isStarter: true },
      { playerId: "p-bench", teamSide: "HOME", position: "ST", isStarter: false, subInMinute: 80 },
    ]
  );

  assert.equal(evalRes.playerEvents["p-starter"].every((e) => e.source === "REAL"), true);
  assert.equal(evalRes.playerEvents["p-bench"].every((e) => e.source === "REAL"), true);

  const starterPlayer = makeBasePlayer({ id: "p-starter", matchId: "m-replay-ui" });
  const benchPlayer = makeBasePlayer({ id: "p-bench", matchId: "m-replay-ui" });
  const match = makeBaseMatch({ id: "m-replay-ui", minute: 90 });

  const starterStatus = resolvePlayerMatchStatus({
    player: starterPlayer,
    match,
    providerPlayerEvents: evalRes.playerEvents["p-starter"],
  });
  assert.equal(starterStatus.yellowCards, 1);
  assert.equal(starterStatus.subOutMinute, 80);

  const benchStatus = resolvePlayerMatchStatus({
    player: benchPlayer,
    match,
    providerPlayerEvents: evalRes.playerEvents["p-bench"],
  });
  assert.equal(benchStatus.subInMinute, 80);
  assert.equal(benchStatus.redCards, 1);
});

test("clears cards and substitutions for UPCOMING matches while preserving captain marker", () => {
  const player = makeBasePlayer({
    id: "p-cap",
    isCaptain: true,
    subOutMinute: 75,
    yellowCards: 1,
    redCards: 1,
  });
  const upcomingMatch = makeBaseMatch({ status: "UPCOMING", rawStatus: "TIMED" });

  const status = resolvePlayerMatchStatus({ player, match: upcomingMatch });
  assert.equal(status.isCaptain, true);
  assert.equal(status.subInMinute, undefined);
  assert.equal(status.subOutMinute, undefined);
  assert.equal(status.yellowCards, 0);
  assert.equal(status.redCards, 0);

  const applied = applyLineupEntryMeta(
    player,
    { id: "p-cap", name: "테스트", isCaptain: true, subOutMinute: 75, yellowCards: 1 },
    true
  );
  assert.equal(applied.isCaptain, true);
  assert.equal(applied.subOutMinute, undefined);
  assert.equal(applied.yellowCards, 0);
});

test("ScoreOnly mode and 0-score teams suppress spurious individual goal/assist markers and reconcileTeamGoalMarkers caps to teamScore", () => {
  const staleScorer = makeBasePlayer({
    id: "p-stale-fw",
    matchId: "m-score-only",
    teamId: "eng",
    teamShort: "ENG",
    teamName: "잉글랜드",
    stats: { rating: 8.2, goals: 2, assists: 1, shotsOnTarget: 3, keyPasses: 2 },
    events: [
      { id: "stale-g", playerId: "p-stale-fw", minute: 20, type: "GOAL", description: "득점", priceImpactPercent: 8.5, source: "REAL" },
    ],
  });

  const scoreOnlyMatch = makeBaseMatch({
    id: "m-score-only",
    providerMode: "SCORE_ONLY",
    homeTeam: {
      id: "eng",
      name: "잉글랜드",
      shortName: "ENG",
      color: "#1E3A8A",
      score: 1,
      formation: "4-2-3-1",
    },
    events: [],
  });

  const scoreOnlyStatus = resolvePlayerMatchStatus({
    player: staleScorer,
    match: scoreOnlyMatch,
    teamSide: "HOME",
  });
  assert.equal(scoreOnlyStatus.goals, 0);
  assert.equal(scoreOnlyStatus.assists, 0);

  const zeroScoreMatch = makeBaseMatch({
    id: "m-score-only",
    homeTeam: {
      id: "eng",
      name: "잉글랜드",
      shortName: "ENG",
      color: "#1E3A8A",
      score: 0,
      formation: "4-2-3-1",
    },
  });
  const zeroScoreStatus = resolvePlayerMatchStatus({
    player: staleScorer,
    match: zeroScoreMatch,
    teamSide: "HOME",
  });
  assert.equal(zeroScoreStatus.goals, 0);
  assert.equal(zeroScoreStatus.assists, 0);

  // Reconcile caps total goal/assist badges across team players to match teamScore
  const reconciled = reconcileTeamGoalMarkers(
    ["p1", "p2"],
    {
      p1: { yellowCards: 0, redCards: 0, goals: 1, assists: 1, isCaptain: false },
      p2: { yellowCards: 0, redCards: 0, goals: 1, assists: 1, isCaptain: false },
    },
    1
  );
  assert.equal(reconciled.p1.goals + reconciled.p2.goals, 1);
  assert.equal(reconciled.p1.assists + reconciled.p2.assists, 1);
});

test("clicking a pitch or cross-match player never fabricates yellow cards or assists", () => {
  // 1) Synthetic/API pitch player with price variation and empty events array
  const clickedPitchPlayer = makeBasePlayer({
    id: "pitch-api-m-new-ars-new-2",
    matchId: "m-new-ars",
    position: "CAM",
    openPrice: 10000,
    basePrice: 10000,
    currentPrice: 9850, // negative diff must NOT synthesize YELLOW_CARD when events is []
    events: [],
    lastEvent: { text: "⚡ 포지션 정상 소화", sentiment: "neutral", minute: 45 },
  });
  assert.deepEqual(extractInitialMatchEvents(clickedPitchPlayer, "LIVE"), []);

  const positivePitchPlayer = makeBasePlayer({
    id: "pitch-api-m-new-ars-ars-4",
    matchId: "m-new-ars",
    position: "CM",
    openPrice: 10000,
    basePrice: 10000,
    currentPrice: 10200, // positive diff must NOT synthesize ASSIST when pitch-
    events: undefined,
    lastEvent: { text: "⚡ 포지션 정상 소화", sentiment: "positive", minute: 45 },
  });
  assert.deepEqual(extractInitialMatchEvents(positivePitchPlayer, "LIVE"), []);

  // 2) Cross-match player (from m-tot-ars) evaluated inside m-new-ars does not leak m-tot-ars yellow card/assist
  const crossMatchOdegaard = makeBasePlayer({
    id: "p-odegaard",
    name: "마르틴 외데고르",
    englishName: "Martin Odegaard",
    matchId: "m-tot-ars",
    teamId: "ars",
    stats: { rating: 7.1, goals: 0, assists: 1, shotsOnTarget: 1, keyPasses: 3 },
    events: [
      { id: "tot-ars-a", playerId: "p-odegaard", minute: 32, type: "ASSIST", description: "도움", priceImpactPercent: 3.2, source: "REAL" },
      { id: "tot-ars-yc", playerId: "p-odegaard", minute: 58, type: "YELLOW_CARD", description: "경고", priceImpactPercent: -1.9, source: "REAL" },
    ],
  });

  const newArsMatch = makeBaseMatch({
    id: "m-new-ars",
    homeManager: "Matthias Jaissle",
    awayManager: "Mikel Arteta",
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 1, formation: "4-2-3-1", manager: "Matthias Jaissle" },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2, formation: "4-2-3-1", manager: "Mikel Arteta" },
    events: [],
  });

  const statusInNewMatch = resolvePlayerMatchStatus({
    player: crossMatchOdegaard,
    match: newArsMatch,
    teamSide: "AWAY",
  });
  assert.equal(statusInNewMatch.yellowCards, 0);
  assert.equal(statusInNewMatch.assists, 0);
  assert.equal(statusInNewMatch.goals, 0);

  // Manager metadata resolves cleanly for non-tradable manager display
  const managers = resolveMatchManagers(newArsMatch);
  assert.equal(managers.homeManager, "Matthias Jaissle");
  assert.equal(managers.awayManager, "Mikel Arteta");
});

test("mergePinnedFixturesForToday merges m-new-ars into a matching live API fixture without duplicating, pins separately when unmatched, and skips on past/future dates", () => {
  const pinnedNewArs = makeBaseMatch({
    id: "m-new-ars",
    leagueId: "epl",
    homeManager: "Matthias Jaissle",
    awayManager: "Mikel Arteta",
    homeTeam: {
      id: "new",
      name: "Newcastle",
      shortName: "NEW",
      color: "#241F20",
      score: 1,
      formation: "4-2-3-1",
      manager: "Matthias Jaissle",
      lineup: [{ id: "p-new-osula", name: "Osula", position: "ST", shirtNumber: 10, yellowCards: 1 }],
    },
    awayTeam: {
      id: "ars",
      name: "Arsenal",
      shortName: "ARS",
      color: "#EF0107",
      score: 2,
      formation: "4-2-3-1",
      manager: "Mikel Arteta",
      lineup: [{ id: "p-ars-havertz", name: "Havertz", position: "ST", shirtNumber: 29, subOutMinute: 68 }],
    },
    events: [
      { id: "ev-na-g1", minute: 19, type: "GOAL", playerId: "p-ars-havertz", playerName: "Havertz", source: "REAL" },
    ],
  });

  const matchingLiveApiMatches: Match[] = [
    makeBaseMatch({
      id: "fd-560651",
      leagueId: "pl-2021",
      leagueEmblem: "https://crests.football-data.org/PL.png",
      providerMode: "SCORE_ONLY",
      usesDummyLineup: true,
      minute: 23,
      homeTeam: { id: "new", name: "Newcastle United", shortName: "NEW", color: "#241F20", score: 0, formation: "4-3-3" },
      awayTeam: { id: "ars", name: "Arsenal FC", shortName: "ARS", color: "#EF0107", score: 0, formation: "4-2-3-1" },
    }),
  ];

  // Today with matching live fixture: merges into fd-560651 (no duplicate card!) while preserving SCORE_ONLY live score/clock/events
  const todayMerged = mergePinnedFixturesForToday(matchingLiveApiMatches, [pinnedNewArs], true);
  assert.equal(todayMerged.length, 1);
  assert.equal(todayMerged[0].id, "fd-560651");
  assert.equal(todayMerged[0].leagueId, "pl-2021");
  assert.equal(todayMerged[0].providerMode, "SCORE_ONLY");
  assert.equal(todayMerged[0].minute, 23);
  assert.equal(todayMerged[0].homeTeam.score, 0);
  assert.equal(todayMerged[0].awayTeam.score, 0);
  assert.equal(todayMerged[0].homeManager, "Matthias Jaissle");
  assert.equal(todayMerged[0].awayManager, "Mikel Arteta");
  assert.equal(todayMerged[0].events, undefined);
  assert.equal(todayMerged[0].homeTeam.lineup?.[0]?.yellowCards, undefined);
  assert.equal(todayMerged[0].awayTeam.lineup?.[0]?.subOutMinute, undefined);

  // Today with unrelated live API match: pins m-new-ars at top cleanly separated from live SCORE_ONLY API match
  const unrelatedLiveApiMatches: Match[] = [
    makeBaseMatch({
      id: "fd-560700",
      leagueId: "pl-2021",
      leagueEmblem: "https://crests.football-data.org/PL.png",
      providerMode: "SCORE_ONLY",
      usesDummyLineup: true,
      homeTeam: { id: "che", name: "Chelsea", shortName: "CHE", color: "#034694", score: 1, formation: "4-2-3-1" },
      awayTeam: { id: "liv", name: "Liverpool", shortName: "LIV", color: "#C8102E", score: 0, formation: "4-3-3" },
    }),
  ];
  const separatedMerged = mergePinnedFixturesForToday(unrelatedLiveApiMatches, [pinnedNewArs], true);
  assert.equal(separatedMerged.length, 2);
  assert.equal(separatedMerged[0].id, "m-new-ars");
  assert.equal(separatedMerged[0].leagueId, "pl-2021");
  assert.equal(separatedMerged[1].id, "fd-560700");
  assert.equal(separatedMerged[1].providerMode, "SCORE_ONLY");

  // Non-today: pinned today fixture is not injected
  const otherDay = mergePinnedFixturesForToday(unrelatedLiveApiMatches, [pinnedNewArs], false);
  assert.equal(otherDay.length, 1);
  assert.equal(otherDay[0].id, "fd-560700");
});

test("strict event-only gating blocks stale, simulated, estimated, ScoreOnly, and invalid-minute sub/card badges", () => {
  // 1) Stale player-level fields without matching real event or verified lineup entry
  const stalePlayer = makeBasePlayer({
    id: "p-stale-meta",
    matchId: "m-strict-1",
    subInMinute: 60,
    subOutMinute: 82,
    yellowCards: 1,
    redCards: 1,
    stats: {
      rating: 7.0,
      goals: 0,
      assists: 0,
      shotsOnTarget: 0,
      keyPasses: 0,
      yellowCards: 1,
      redCards: 1,
    },
    events: [
      {
        id: "ev-sim-yc",
        playerId: "p-stale-meta",
        minute: 41,
        type: "YELLOW_CARD",
        description: "시뮬레이션 경고",
        priceImpactPercent: -2.0,
        source: "SIMULATED",
      },
      {
        id: "ev-est-rc",
        playerId: "p-stale-meta",
        minute: 70,
        type: "RED_CARD",
        description: "추정 퇴장",
        priceImpactPercent: -8.0,
        source: "REAL",
        estimated: true,
      },
    ],
    priceHistory: [
      { minute: 0, timeLabel: "0'", price: 12000 },
      {
        minute: 55,
        timeLabel: "55'",
        price: 11800,
        event: {
          type: "SUB_OUT",
          label: "교체 아웃",
          impactPercent: 0,
          source: "SIMULATED",
        },
      },
    ],
  });

  const liveMatchNoEvents = makeBaseMatch({
    id: "m-strict-1",
    events: undefined,
  });
  const strictStatus = resolvePlayerMatchStatus({
    player: stalePlayer,
    match: liveMatchNoEvents,
  });
  assert.equal(strictStatus.subInMinute, undefined);
  assert.equal(strictStatus.subOutMinute, undefined);
  assert.equal(strictStatus.yellowCards, 0);
  assert.equal(strictStatus.redCards, 0);

  // 2) Explicit match.events: [] suppresses stale player.events even for same matchId
  const sameMatchStaleEventPlayer = makeBasePlayer({
    id: "p-stale-ev",
    matchId: "m-strict-empty",
    events: [
      {
        id: "ev-old-yc",
        playerId: "p-stale-ev",
        minute: 33,
        type: "YELLOW_CARD",
        description: "이전 캐시 경고",
        priceImpactPercent: -2.0,
        source: "REAL",
      },
    ],
  });
  const emptyEventsMatch = makeBaseMatch({
    id: "m-strict-empty",
    events: [],
  });
  const emptyEventsStatus = resolvePlayerMatchStatus({
    player: sameMatchStaleEventPlayer,
    match: emptyEventsMatch,
  });
  assert.equal(emptyEventsStatus.yellowCards, 0);
  assert.equal(emptyEventsStatus.redCards, 0);
  assert.equal(emptyEventsStatus.subInMinute, undefined);
  assert.equal(emptyEventsStatus.subOutMinute, undefined);

  // 3) Simulated / estimated / 0-minute events in match.events & providerPlayerEvents never render badges
  const matchWithInvalidAndSimulated = makeBaseMatch({
    id: "m-strict-sim",
    events: [
      {
        id: "sim-sub",
        minute: 62,
        type: "SUB",
        playerName: "테스트 선수",
        playerOutId: "p-test-1",
        playerOutName: "테스트 선수",
        source: "SIMULATED",
      },
      {
        id: "est-yc",
        minute: 40,
        type: "YELLOW_CARD",
        playerId: "p-test-1",
        playerName: "테스트 선수",
        source: "REAL",
        metadata: { estimated: true },
      },
      {
        id: "zero-min-sub",
        minute: 0,
        type: "SUB_IN",
        playerId: "p-test-1",
        playerName: "테스트 선수",
        source: "REAL",
      },
    ],
  });
  const cleanPlayer = makeBasePlayer({ id: "p-test-1", matchId: "m-strict-sim" });
  const simStatus = resolvePlayerMatchStatus({
    player: cleanPlayer,
    match: matchWithInvalidAndSimulated,
    providerPlayerEvents: [
      {
        id: "pev-sim-rc",
        playerId: "p-test-1",
        minute: 77,
        type: "RED_CARD",
        source: "SIMULATED",
      },
    ],
  });
  assert.equal(simStatus.subInMinute, undefined);
  assert.equal(simStatus.subOutMinute, undefined);
  assert.equal(simStatus.yellowCards, 0);
  assert.equal(simStatus.redCards, 0);

  // 4) SCORE_ONLY & usesDummyLineup block sub/card badges across lineup meta, match.events, providerPlayerEvents, and player.events
  const scoreOnlyDummyMatch = makeBaseMatch({
    id: "m-score-only-badges",
    providerMode: "SCORE_ONLY",
    usesDummyLineup: true,
    homeTeam: {
      id: "eng",
      name: "잉글랜드",
      shortName: "ENG",
      color: "#1E3A8A",
      score: 0,
      formation: "4-2-3-1",
      lineup: [
        {
          id: "p-test-1",
          name: "테스트 선수",
          position: "LW",
          subOutMinute: 70,
          yellowCards: 1,
          redCards: 1,
        },
      ],
    },
    events: [
      { id: "so-yc", minute: 22, type: "YELLOW_CARD", playerId: "p-test-1", playerName: "테스트 선수", source: "REAL" },
      { id: "so-rc", minute: 65, type: "RED_CARD", playerId: "p-test-1", playerName: "테스트 선수", source: "REAL" },
      { id: "so-sub", minute: 70, type: "SUB", playerName: "테스트 선수", playerOutId: "p-test-1", playerOutName: "테스트 선수", playerInId: "p-test-2", playerInName: "벤치 선수", source: "REAL" },
    ],
  });
  const scoreOnlyBadgeStatus = resolvePlayerMatchStatus({
    player: makeBasePlayer({
      id: "p-test-1",
      matchId: "m-score-only-badges",
      events: [
        { id: "p-so-yc", playerId: "p-test-1", minute: 22, type: "YELLOW_CARD", description: "경고", priceImpactPercent: -2.0, source: "REAL" },
      ],
    }),
    match: scoreOnlyDummyMatch,
    providerPlayerEvents: [
      { id: "pev-so-sub", playerId: "p-test-1", minute: 70, type: "SUB_OUT", source: "REAL" },
      { id: "pev-so-yc", playerId: "p-test-1", minute: 22, type: "YELLOW_CARD", source: "REAL" },
    ],
  });
  assert.equal(scoreOnlyBadgeStatus.subInMinute, undefined);
  assert.equal(scoreOnlyBadgeStatus.subOutMinute, undefined);
  assert.equal(scoreOnlyBadgeStatus.yellowCards, 0);
  assert.equal(scoreOnlyBadgeStatus.redCards, 0);

  // 5) Dummy lineup match (even without SCORE_ONLY) suppresses player.events / match.events card & sub badges
  const dummyLineupOnlyMatch = makeBaseMatch({
    id: "m-dummy-lineup-only",
    usesDummyLineup: true,
    events: undefined,
  });
  const dummyLineupStatus = resolvePlayerMatchStatus({
    player: makeBasePlayer({
      id: "p-test-1",
      matchId: "m-dummy-lineup-only",
      events: [
        { id: "dl-yc", playerId: "p-test-1", minute: 30, type: "YELLOW_CARD", description: "경고", priceImpactPercent: -2.0, source: "REAL" },
      ],
    }),
    match: dummyLineupOnlyMatch,
  });
  assert.equal(dummyLineupStatus.yellowCards, 0);
  assert.equal(dummyLineupStatus.redCards, 0);
  assert.equal(dummyLineupStatus.subInMinute, undefined);
  assert.equal(dummyLineupStatus.subOutMinute, undefined);
});

test("cross-script and accented names preserve exact player event matching for badges without leaking to teammates", () => {
  const odegaard = makeBasePlayer({
    id: "p-odegaard",
    name: "마르틴 외데고르",
    englishName: "Martin Odegaard",
    matchId: "m-new-ars",
    teamId: "ars",
    teamName: "아스날",
    teamShort: "ARS",
  });
  const timber = makeBasePlayer({
    id: "p-ars-timber",
    name: "위리엔 팀버",
    englishName: "Jurriën Timber",
    matchId: "m-new-ars",
    teamId: "ars",
    teamName: "아스날",
    teamShort: "ARS",
  });

  const match = makeBaseMatch({
    id: "m-new-ars",
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
      lineup: [
        { id: "p-ars-odegaard", name: "Ødegaard", position: "CAM", isCaptain: true, subOutMinute: 78 },
        { id: "p-ars-timber", name: "Timber", position: "RB", yellowCards: 1 },
      ],
    },
    events: [
      { id: "ev-a1", minute: 19, type: "ASSIST", playerId: "p-ars-odegaard", playerName: "Ødegaard", source: "REAL" },
      { id: "ev-yc1", minute: 56, type: "YELLOW_CARD", playerId: "p-ars-timber", playerName: "Timber", source: "REAL" },
      { id: "ev-sub1", minute: 78, type: "SUB_OUT", playerId: "p-ars-odegaard", playerName: "Ødegaard", source: "REAL" },
    ],
  });

  const odeStatus = resolvePlayerMatchStatus({ player: odegaard, match, teamSide: "AWAY" });
  assert.equal(odeStatus.isCaptain, true);
  assert.equal(odeStatus.assists, 1);
  assert.equal(odeStatus.subOutMinute, 78);
  assert.equal(odeStatus.yellowCards, 0);

  const timberStatus = resolvePlayerMatchStatus({ player: timber, match, teamSide: "AWAY" });
  assert.equal(timberStatus.yellowCards, 1);
  assert.equal(timberStatus.subOutMinute, undefined);
  assert.equal(timberStatus.assists, 0);
});
