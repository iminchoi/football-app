import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLineupEntryMeta,
  resolvePlayerMatchStatus,
} from "../src/lib/lineupStatus.ts";
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
