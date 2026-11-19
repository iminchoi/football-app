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

function parseSeedFromArgs(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--seed=")) {
      const n = Number(arg.slice("--seed=".length));
      if (Number.isFinite(n)) return Math.floor(n);
    } else if (arg === "--seed" && i + 1 < argv.length) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n)) return Math.floor(n);
    }
  }
  return 20261119;
}

/**
 * Deterministic PRNG (Mulberry32) supporting reproducible `--seed` runs.
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

/**
 * Knuth Poisson sampler for realistic goal counts per team.
 */
function samplePoisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L);
  return k - 1;
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

const BENCH_ROLES: Position[] = ["GK", "CB", "CM", "LW", "ST"];

type PosGroup = "FW" | "MF" | "DF" | "GK";

function toPosGroup(pos: Position): PosGroup {
  if (pos === "GK") return "GK";
  if (pos === "LB" || pos === "CB" || pos === "RB") return "DF";
  if (pos === "LW" || pos === "ST" || pos === "RW") return "FW";
  return "MF";
}

function pickByPositionShare(
  candidates: MatchParticipant[],
  shares: Record<PosGroup, number>,
  rng: () => number
): MatchParticipant {
  const byGroup: Record<PosGroup, MatchParticipant[]> = {
    FW: [],
    MF: [],
    DF: [],
    GK: [],
  };
  for (const c of candidates) {
    byGroup[toPosGroup(c.position as Position)].push(c);
  }

  const availableGroups = (["FW", "MF", "DF", "GK"] as PosGroup[]).filter(
    (g) => byGroup[g].length > 0 && shares[g] > 0
  );
  if (availableGroups.length === 0) {
    return candidates[Math.floor(rng() * candidates.length)];
  }

  const totalShare = availableGroups.reduce((s, g) => s + shares[g], 0);
  let roll = rng() * totalShare;
  let chosenGroup: PosGroup = availableGroups[availableGroups.length - 1];
  for (const g of availableGroups) {
    roll -= shares[g];
    if (roll <= 0) {
      chosenGroup = g;
      break;
    }
  }
  const pool = byGroup[chosenGroup];
  return pool[Math.floor(rng() * pool.length)];
}

function simulate100Matches(seed: number): void {
  const rng = createRng(seed);
  const MATCH_COUNT = 100;
  const BASE_PRICE = 10000;

  let totalParticipants = 0;
  let intradayUpperHits = 0;
  let intradayLowerHits = 0;
  let closeUpperHits = 0;
  let closeLowerHits = 0;
  let totalBasePoints = 0;
  let totalEndPoints = 0;

  let postEvent10mSum = 0;
  let postEvent10mCount = 0;

  const groupReturns: Record<PosGroup, number[]> = {
    FW: [],
    MF: [],
    DF: [],
    GK: [],
  };

  for (let m = 0; m < MATCH_COUNT; m++) {
    const matchId = `sim-match-${m}`;
    const participants: MatchParticipant[] = [];
    const subOutMinute = new Map<string, number>();

    for (const side of ["HOME", "AWAY"] as const) {
      const prefix = side === "HOME" ? "h" : "a";
      const starters: MatchParticipant[] = [];
      for (let i = 0; i < 11; i++) {
        const p: MatchParticipant = {
          playerId: `${matchId}-${prefix}-s${i}`,
          teamSide: side,
          position: FORMATION_433[i],
          isStarter: true,
        };
        starters.push(p);
        participants.push(p);
      }

      // 3~5 substitutions per team between 55' and 85'
      const subCount = 3 + Math.floor(rng() * 3);
      const outfieldStarters = starters.filter((s) => s.position !== "GK");
      for (let b = 0; b < subCount; b++) {
        const subMin = 55 + Math.floor(rng() * 31); // [55..85]
        const replacedIdx = Math.floor(rng() * outfieldStarters.length);
        const replaced = outfieldStarters.splice(replacedIdx, 1)[0];
        if (replaced) {
          subOutMinute.set(replaced.playerId, subMin);
        }
        participants.push({
          playerId: `${matchId}-${prefix}-b${b}`,
          teamSide: side,
          position: BENCH_ROLES[(b + 1) % BENCH_ROLES.length],
          isStarter: false,
          subInMinute: subMin,
        });
      }
    }

    const teamEvents: TeamMatchRawEvent[] = [];
    let evSeq = 0;

    // 1) Substitutions & Lineup Confirmation (0.0% bonus per v2.1)
    for (const p of participants) {
      if (p.isStarter) {
        teamEvents.push({
          id: `${matchId}-ev-${evSeq++}`,
          minute: 0,
          teamSide: p.teamSide,
          kind: "LINEUP_CONFIRMED",
          actorPlayerId: p.playerId,
        });
      } else if (p.subInMinute !== undefined) {
        teamEvents.push({
          id: `${matchId}-ev-${evSeq++}`,
          minute: p.subInMinute,
          teamSide: p.teamSide,
          kind: "SUB_IN",
          actorPlayerId: p.playerId,
        });
      }
    }

    const isActiveAt = (p: MatchParticipant, min: number): boolean => {
      if (p.isStarter) {
        const outMin = subOutMinute.get(p.playerId);
        return outMin === undefined || min <= outMin;
      }
      return p.subInMinute !== undefined && min >= p.subInMinute;
    };

    // 2) Goals per team: Poisson(1.4)
    const homeGoals = samplePoisson(1.4, rng);
    const awayGoals = samplePoisson(1.4, rng);
    const goalTimeline: { minute: number; side: "HOME" | "AWAY" }[] = [];
    for (let g = 0; g < homeGoals; g++) {
      goalTimeline.push({
        minute: 2 + Math.floor(rng() * 88),
        side: "HOME",
      });
    }
    for (let g = 0; g < awayGoals; g++) {
      goalTimeline.push({
        minute: 2 + Math.floor(rng() * 88),
        side: "AWAY",
      });
    }
    goalTimeline.sort((a, b) => a.minute - b.minute);

    let hScore = 0;
    let aScore = 0;
    let firstConcededHome = 999;
    let firstConcededAway = 999;

    for (const g of goalTimeline) {
      const prevDiff = g.side === "HOME" ? hScore - aScore : aScore - hScore;
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
        firstConcededAway = Math.min(firstConcededAway, g.minute);
      } else {
        aScore += 1;
        firstConcededHome = Math.min(firstConcededHome, g.minute);
      }

      const activeSide = participants.filter(
        (p) => p.teamSide === g.side && isActiveAt(p, g.minute)
      );
      if (activeSide.length === 0) continue;

      const scorer = pickByPositionShare(
        activeSide,
        { FW: 0.6, MF: 0.3, DF: 0.09, GK: 0.01 },
        rng
      );
      teamEvents.push({
        id: `${matchId}-ev-${evSeq++}`,
        minute: g.minute,
        teamSide: g.side,
        kind: "GOAL",
        actorPlayerId: scorer.playerId,
        goalContext,
      });

      // 70% assist probability
      if (rng() < 0.7) {
        const assistPool = activeSide.filter(
          (p) => p.playerId !== scorer.playerId
        );
        if (assistPool.length > 0) {
          const assister = pickByPositionShare(
            assistPool,
            { FW: 0.32, MF: 0.48, DF: 0.19, GK: 0.01 },
            rng
          );
          teamEvents.push({
            id: `${matchId}-ev-${evSeq++}`,
            minute: g.minute,
            teamSide: g.side,
            kind: "ASSIST",
            actorPlayerId: assister.playerId,
          });
        }
      }
    }

    // 3) Clean sheet checkpoints at 45' and 75'
    if (firstConcededHome > 45) {
      teamEvents.push({
        id: `${matchId}-ev-${evSeq++}`,
        minute: 45,
        teamSide: "HOME",
        kind: "CLEAN_SHEET_45",
      });
    }
    if (firstConcededHome > 75) {
      teamEvents.push({
        id: `${matchId}-ev-${evSeq++}`,
        minute: 75,
        teamSide: "HOME",
        kind: "CLEAN_SHEET_75",
      });
    }
    if (firstConcededAway > 45) {
      teamEvents.push({
        id: `${matchId}-ev-${evSeq++}`,
        minute: 45,
        teamSide: "AWAY",
        kind: "CLEAN_SHEET_45",
      });
    }
    if (firstConcededAway > 75) {
      teamEvents.push({
        id: `${matchId}-ev-${evSeq++}`,
        minute: 75,
        teamSide: "AWAY",
        kind: "CLEAN_SHEET_75",
      });
    }

    // 4) Key actions + Yellow (15%/player) + Red (0.5%/player)
    for (const side of ["HOME", "AWAY"] as const) {
      const activeAtMid = participants.filter(
        (p) => p.teamSide === side && p.isStarter
      );
      const gk = activeAtMid.find((p) => p.position === "GK");
      if (gk) {
        const saves = 1 + Math.floor(rng() * 3);
        for (let s = 0; s < saves; s++) {
          teamEvents.push({
            id: `${matchId}-ev-${evSeq++}`,
            minute: 5 + Math.floor(rng() * 83),
            teamSide: side,
            kind: "KEY_ACTION",
            actorPlayerId: gk.playerId,
          });
        }
      }

      const outfieldActions = 2 + Math.floor(rng() * 4);
      const outfield = activeAtMid.filter((p) => p.position !== "GK");
      for (let k = 0; k < outfieldActions; k++) {
        const actor = pickByPositionShare(
          outfield,
          { FW: 0.4, MF: 0.35, DF: 0.25, GK: 0 },
          rng
        );
        teamEvents.push({
          id: `${matchId}-ev-${evSeq++}`,
          minute: 5 + Math.floor(rng() * 83),
          teamSide: side,
          kind: "KEY_ACTION",
          actorPlayerId: actor.playerId,
        });
      }
    }

    for (const p of participants) {
      const minStart = p.isStarter ? 3 : p.subInMinute ?? 60;
      const minEnd = subOutMinute.get(p.playerId) ?? 89;
      if (minEnd <= minStart) continue;

      if (rng() < 0.15) {
        const min =
          minStart + Math.floor(rng() * Math.max(1, minEnd - minStart));
        teamEvents.push({
          id: `${matchId}-ev-${evSeq++}`,
          minute: min,
          teamSide: p.teamSide,
          kind: "YELLOW_CARD",
          actorPlayerId: p.playerId,
        });
      }
      if (rng() < 0.005) {
        const min =
          minStart + Math.floor(rng() * Math.max(1, minEnd - minStart));
        teamEvents.push({
          id: `${matchId}-ev-${evSeq++}`,
          minute: min,
          teamSide: p.teamSide,
          kind: "RED_CARD",
          actorPlayerId: p.playerId,
        });
      }
    }

    const fanned = fanOutTeamEventsToPlayers(participants, teamEvents);
    for (const p of participants) {
      const evs = fanned[p.playerId] ?? [];
      const series = buildPriceSeries(
        BASE_PRICE,
        evs,
        {
          position: p.position,
          playerId: p.playerId,
          matchId,
          isStarter: p.isStarter,
          subInMinute: p.subInMinute,
        },
        90
      );

      totalParticipants += 1;
      totalBasePoints += BASE_PRICE;
      totalEndPoints += series.currentPrice;

      let hitUp = false;
      let hitDown = false;
      for (const pt of series.points) {
        const cr = pt.clampedReturn ?? 0;
        if (cr >= 0.3) hitUp = true;
        if (cr <= -0.3) hitDown = true;
      }
      if (hitUp) intradayUpperHits += 1;
      if (hitDown) intradayLowerHits += 1;
      if (series.clampedReturn >= 0.3) closeUpperHits += 1;
      if (series.clampedReturn <= -0.3) closeLowerHits += 1;

      groupReturns[toPosGroup(p.position as Position)].push(series.clampedReturn);

      // Post-event 10-minute drift check for major individual events
      for (const ev of evs) {
        if (
          ev.type !== "GOAL" &&
          ev.type !== "ASSIST" &&
          ev.type !== "YELLOW_CARD" &&
          ev.type !== "RED_CARD"
        ) {
          continue;
        }
        const atEvent = series.points.find((pt) => pt.minute >= ev.minute);
        const after10 = series.points.find(
          (pt) => pt.minute >= Math.min(90, ev.minute + 10)
        );
        if (atEvent && after10) {
          postEvent10mSum +=
            (after10.clampedReturn ?? 0) - (atEvent.clampedReturn ?? 0);
          postEvent10mCount += 1;
        }
      }
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
  const netPointChangePct =
    ((totalEndPoints - totalBasePoints) / Math.max(1, totalBasePoints)) * 100;
  const avgPost10mPct =
    postEvent10mCount > 0 ? (postEvent10mSum / postEvent10mCount) * 100 : 0;

  console.log(`=== PitchTrade v2.1 100-Match Balance Simulation (seed=${seed}) ===`);
  console.log(`Simulated Matches: ${MATCH_COUNT} | Total Active Participants: ${totalParticipants}`);
  console.log(
    `1) Intraday ±30% Hit Rate: Upper=${((intradayUpperHits / totalParticipants) * 100).toFixed(2)}% | Lower=${((intradayLowerHits / totalParticipants) * 100).toFixed(2)}% | Combined=${(((intradayUpperHits + intradayLowerHits) / totalParticipants) * 100).toFixed(2)}%`
  );
  console.log(
    `   Close ±30% Hit Rate:    Upper=${((closeUpperHits / totalParticipants) * 100).toFixed(2)}% | Lower=${((closeLowerHits / totalParticipants) * 100).toFixed(2)}% | Combined=${(((closeUpperHits + closeLowerHits) / totalParticipants) * 100).toFixed(2)}%`
  );
  console.log(
    `2) Position Mean Return:   FW ${posMeans.FW.toFixed(2)}% | MF ${posMeans.MF.toFixed(2)}% | DF ${posMeans.DF.toFixed(2)}% | GK ${posMeans.GK.toFixed(2)}% (Max Spread: ${maxPosDiff.toFixed(2)}%p)`
  );
  console.log(
    `3) Post-Event 10m Avg Additional Return: ${avgPost10mPct >= 0 ? "+" : ""}${avgPost10mPct.toFixed(3)}% (n=${postEvent10mCount})`
  );
  console.log(
    `4) 100-Match Aggregate Point Supply Change: ${netPointChangePct >= 0 ? "+" : ""}${netPointChangePct.toFixed(2)}% (${totalBasePoints.toLocaleString()}P -> ${totalEndPoints.toLocaleString()}P)`
  );
}

simulate100Matches(parseSeedFromArgs(process.argv.slice(2)));
