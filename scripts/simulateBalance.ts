import {
  buildPriceSeries,
  fanOutTeamEventsToPlayers,
} from "../src/lib/priceEngine.ts";
import type {
  GoalContext,
  MatchParticipant,
  TeamMatchRawEvent,
} from "../src/lib/priceEngine.ts";
import type { Position } from "../src/types/index.ts";

/**
 * Deterministic PRNG (Mulberry32) so 100-match balance runs are 100% reproducible.
 */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORMATION_433: Position[] = [
  "GK",
  "LB",
  "CB",
  "CB",
  "RB",
  "DM",
  "CM",
  "CAM",
  "LW",
  "ST",
  "RW",
];

type PosGroup = "FW" | "MF" | "DF" | "GK";

function toPosGroup(pos: Position): PosGroup {
  if (pos === "GK") return "GK";
  if (pos === "LB" || pos === "CB" || pos === "RB") return "DF";
  if (pos === "LW" || pos === "ST" || pos === "RW") return "FW";
  return "MF";
}

function pickWeightedPlayer(
  teamPlayers: MatchParticipant[],
  weights: Record<PosGroup, number>,
  rng: () => number
): MatchParticipant {
  const scored = teamPlayers.map((p) => ({
    p,
    w: weights[toPosGroup(p.position as Position)] ?? 1,
  }));
  const total = scored.reduce((s, x) => s + x.w, 0);
  let roll = rng() * total;
  for (const item of scored) {
    roll -= item.w;
    if (roll <= 0) return item.p;
  }
  return teamPlayers[teamPlayers.length - 1];
}

function simulate100Matches(): void {
  const rng = createRng(20261119);
  const MATCH_COUNT = 100;

  let totalPlayers = 0;
  let upperLimitHits = 0;
  let lowerLimitHits = 0;
  let absReturnSum = 0;

  const groupReturns: Record<PosGroup, number[]> = {
    FW: [],
    MF: [],
    DF: [],
    GK: [],
  };

  for (let m = 0; m < MATCH_COUNT; m++) {
    const participants: MatchParticipant[] = [];
    for (let i = 0; i < 11; i++) {
      participants.push({
        playerId: `m${m}-home-${i}`,
        teamSide: "HOME",
        position: FORMATION_433[i],
        isStarter: true,
      });
      participants.push({
        playerId: `m${m}-away-${i}`,
        teamSide: "AWAY",
        position: FORMATION_433[i],
        isStarter: true,
      });
    }

    const teamEvents: TeamMatchRawEvent[] = [];
    let evSeq = 0;

    // 1) Lineup confirmation (pre-match)
    for (const p of participants) {
      teamEvents.push({
        id: `m${m}-ev-${evSeq++}`,
        minute: 0,
        teamSide: p.teamSide,
        kind: "LINEUP_CONFIRMED",
        actorPlayerId: p.playerId,
      });
    }

    // 2) Generate realistic match goals (~2.7 total goals/match)
    const homeGoals =
      rng() < 0.28 ? 0 : rng() < 0.62 ? 1 : rng() < 0.88 ? 2 : 3;
    const awayGoals =
      rng() < 0.34 ? 0 : rng() < 0.68 ? 1 : rng() < 0.9 ? 2 : 3;

    const goalTimeline: { minute: number; side: "HOME" | "AWAY" }[] = [];
    for (let g = 0; g < homeGoals; g++) {
      goalTimeline.push({
        minute: Math.max(2, Math.min(89, Math.floor(rng() * 88) + 2)),
        side: "HOME",
      });
    }
    for (let g = 0; g < awayGoals; g++) {
      goalTimeline.push({
        minute: Math.max(2, Math.min(89, Math.floor(rng() * 88) + 2)),
        side: "AWAY",
      });
    }
    goalTimeline.sort((a, b) => a.minute - b.minute);

    let hScore = 0;
    let aScore = 0;
    let firstGoalConcededMinHome = 999;
    let firstGoalConcededMinAway = 999;

    for (const g of goalTimeline) {
      const prevDiff =
        g.side === "HOME" ? hScore - aScore : aScore - hScore;
      let goalContext: GoalContext = "OPENER";
      if (hScore === 0 && aScore === 0) {
        goalContext = "OPENER";
      } else if (prevDiff === -1 || prevDiff === 0) {
        goalContext = prevDiff === -1 ? "EQUALIZER" : "GO_AHEAD";
      } else if (prevDiff >= 1) {
        goalContext = "EXTEND_LEAD";
      }

      if (g.side === "HOME") {
        hScore += 1;
        firstGoalConcededMinAway = Math.min(firstGoalConcededMinAway, g.minute);
      } else {
        aScore += 1;
        firstGoalConcededMinHome = Math.min(firstGoalConcededMinHome, g.minute);
      }

      const sidePlayers = participants.filter((p) => p.teamSide === g.side);
      const scorer = pickWeightedPlayer(
        sidePlayers,
        { FW: 5.5, MF: 3.0, DF: 0.7, GK: 0.01 },
        rng
      );
      teamEvents.push({
        id: `m${m}-ev-${evSeq++}`,
        minute: g.minute,
        teamSide: g.side,
        kind: "GOAL",
        actorPlayerId: scorer.playerId,
        goalContext,
      });

      if (rng() < 0.72) {
        const assistCandidates = sidePlayers.filter(
          (p) => p.playerId !== scorer.playerId
        );
        const assister = pickWeightedPlayer(
          assistCandidates,
          { FW: 3.2, MF: 4.5, DF: 1.4, GK: 0.05 },
          rng
        );
        teamEvents.push({
          id: `m${m}-ev-${evSeq++}`,
          minute: g.minute,
          teamSide: g.side,
          kind: "ASSIST",
          actorPlayerId: assister.playerId,
        });
      }
    }

    // 3) Clean sheet milestones at 45' and 75'
    if (firstGoalConcededMinHome > 45) {
      teamEvents.push({
        id: `m${m}-ev-${evSeq++}`,
        minute: 45,
        teamSide: "HOME",
        kind: "CLEAN_SHEET_45",
      });
    }
    if (firstGoalConcededMinHome > 75) {
      teamEvents.push({
        id: `m${m}-ev-${evSeq++}`,
        minute: 75,
        teamSide: "HOME",
        kind: "CLEAN_SHEET_75",
      });
    }
    if (firstGoalConcededMinAway > 45) {
      teamEvents.push({
        id: `m${m}-ev-${evSeq++}`,
        minute: 45,
        teamSide: "AWAY",
        kind: "CLEAN_SHEET_45",
      });
    }
    if (firstGoalConcededMinAway > 75) {
      teamEvents.push({
        id: `m${m}-ev-${evSeq++}`,
        minute: 75,
        teamSide: "AWAY",
        kind: "CLEAN_SHEET_75",
      });
    }

    // 4) Shots on target, saves, defensive actions, yellow & red cards
    for (const side of ["HOME", "AWAY"] as const) {
      const sidePlayers = participants.filter((p) => p.teamSide === side);

      // ~2.5 key plays / shots on target per team
      const keyPlayCount = 1 + Math.floor(rng() * 4);
      for (let k = 0; k < keyPlayCount; k++) {
        const actor = pickWeightedPlayer(
          sidePlayers,
          { FW: 4.5, MF: 3.5, DF: 0.6, GK: 0 },
          rng
        );
        teamEvents.push({
          id: `m${m}-ev-${evSeq++}`,
          minute: Math.floor(rng() * 88) + 2,
          teamSide: side,
          kind: "KEY_PLAY",
          actorPlayerId: actor.playerId,
        });
      }

      // ~2.5 GK saves + ~2.5 DF clearances/tackles per team
      const gk = sidePlayers.find((p) => p.position === "GK")!;
      const saveCount = 1 + Math.floor(rng() * 4);
      for (let s = 0; s < saveCount; s++) {
        teamEvents.push({
          id: `m${m}-ev-${evSeq++}`,
          minute: Math.floor(rng() * 88) + 2,
          teamSide: side,
          kind: "SAVE",
          actorPlayerId: gk.playerId,
        });
      }

      const defCount = 1 + Math.floor(rng() * 4);
      const defenders = sidePlayers.filter(
        (p) => toPosGroup(p.position as Position) === "DF"
      );
      for (let d = 0; d < defCount; d++) {
        const def = defenders[Math.floor(rng() * defenders.length)];
        teamEvents.push({
          id: `m${m}-ev-${evSeq++}`,
          minute: Math.floor(rng() * 88) + 2,
          teamSide: side,
          kind: "DEFENSIVE_ACTION",
          actorPlayerId: def.playerId,
        });
      }

      // ~1.8 yellow cards per team
      const ycCount = rng() < 0.25 ? 0 : rng() < 0.6 ? 1 : rng() < 0.88 ? 2 : 3;
      for (let y = 0; y < ycCount; y++) {
        const actor = pickWeightedPlayer(
          sidePlayers,
          { FW: 1.2, MF: 2.2, DF: 2.8, GK: 0.2 },
          rng
        );
        teamEvents.push({
          id: `m${m}-ev-${evSeq++}`,
          minute: Math.floor(rng() * 88) + 2,
          teamSide: side,
          kind: "YELLOW_CARD",
          actorPlayerId: actor.playerId,
        });
      }

      // ~6% chance of red card per team per match
      if (rng() < 0.06) {
        const actor = pickWeightedPlayer(
          sidePlayers,
          { FW: 1, MF: 2, DF: 3, GK: 0.2 },
          rng
        );
        teamEvents.push({
          id: `m${m}-ev-${evSeq++}`,
          minute: Math.floor(rng() * 80) + 10,
          teamSide: side,
          kind: "RED_CARD",
          actorPlayerId: actor.playerId,
        });
      }
    }

    // Fan-out to all 22 players and compute price series
    const fanned = fanOutTeamEventsToPlayers(participants, teamEvents);
    for (const p of participants) {
      const series = buildPriceSeries(
        10000,
        fanned[p.playerId] ?? [],
        {
          position: p.position,
          isStarter: p.isStarter,
          seedId: p.playerId,
        },
        90
      );

      totalPlayers += 1;
      if (series.clampedReturn >= 0.3) upperLimitHits += 1;
      if (series.clampedReturn <= -0.3) lowerLimitHits += 1;
      absReturnSum += Math.abs(series.clampedReturn);
      groupReturns[toPosGroup(p.position as Position)].push(series.clampedReturn);
    }
  }

  const avg = (arr: number[]) =>
    arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);

  const posMeans = {
    FW: avg(groupReturns.FW) * 100,
    MF: avg(groupReturns.MF) * 100,
    DF: avg(groupReturns.DF) * 100,
    GK: avg(groupReturns.GK) * 100,
  };
  const maxPosDiff =
    Math.max(posMeans.FW, posMeans.MF, posMeans.DF, posMeans.GK) -
    Math.min(posMeans.FW, posMeans.MF, posMeans.DF, posMeans.GK);

  console.log("=== PitchTrade v2.0 100-Match Balance Simulation ===");
  console.log(`Simulated Matches: ${MATCH_COUNT} | Total Players: ${totalPlayers}`);
  console.log(
    `1) Clamp Hit Rate: Upper(+30%) = ${((upperLimitHits / totalPlayers) * 100).toFixed(2)}% (${upperLimitHits}/${totalPlayers}), Lower(-30%) = ${((lowerLimitHits / totalPlayers) * 100).toFixed(2)}% (${lowerLimitHits}/${totalPlayers}), Combined = ${(((upperLimitHits + lowerLimitHits) / totalPlayers) * 100).toFixed(2)}%`
  );
  console.log(
    `2) Position Expected Return: FW ${posMeans.FW.toFixed(2)}% | MF ${posMeans.MF.toFixed(2)}% | DF ${posMeans.DF.toFixed(2)}% | GK ${posMeans.GK.toFixed(2)}% (Max Spread: ${maxPosDiff.toFixed(2)}%p)`
  );
  console.log(
    `3) Mean Absolute Return Swing: ${((absReturnSum / totalPlayers) * 100).toFixed(2)}%`
  );
}

simulate100Matches();
