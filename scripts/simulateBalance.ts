import {
  buildPriceSeries,
  eventDelta,
  expectedReturn,
  fanOutTeamEventsToPlayers,
} from "../src/lib/priceEngine.ts";
import type {
  GoalContext,
  MatchParticipant,
  TeamMatchRawEvent,
} from "../src/lib/priceEngine.ts";
import type { Position } from "../src/types/index.ts";

// ============================================================================
// Pass / Fail Constants
// ============================================================================
const PASS_HIT_RATE_MIN_PCT = 0.5;
const PASS_HIT_RATE_MAX_PCT = 10.0;
const PASS_MAX_POS_SPREAD_PCT = 1.0;
const PASS_ABS_OVERALL_MEAN_PCT = 0.5;
const PASS_MAX_CELL_CI_UPPER_PCT = 1.0;

interface CliOptions {
  matches: number;
  seeds: number;
  baseSeed: number;
  cap: number;
  seedList?: number[];
}

function parseCliOptions(argv: string[]): CliOptions {
  let matches = 1000;
  let seeds = 5;
  let baseSeed = 20261119;
  let cap = 0.15;
  let seedList: number[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg.startsWith("--matches=")) {
      matches = Math.max(1, Math.floor(Number(arg.slice("--matches=".length))));
    } else if (arg === "--matches" && next) {
      matches = Math.max(1, Math.floor(Number(next)));
      i++;
    } else if (arg.startsWith("--seeds=")) {
      seeds = Math.max(1, Math.floor(Number(arg.slice("--seeds=".length))));
    } else if (arg === "--seeds" && next) {
      seeds = Math.max(1, Math.floor(Number(next)));
      i++;
    } else if (arg.startsWith("--seed=")) {
      baseSeed = Math.floor(Number(arg.slice("--seed=".length)));
    } else if (arg === "--seed" && next) {
      baseSeed = Math.floor(Number(next));
      i++;
    } else if (arg.startsWith("--seed-list=")) {
      seedList = arg
        .slice("--seed-list=".length)
        .split(",")
        .map((s) => Math.floor(Number(s.trim())))
        .filter((n) => Number.isFinite(n));
    } else if (arg === "--seed-list" && next) {
      seedList = next
        .split(",")
        .map((s) => Math.floor(Number(s.trim())))
        .filter((n) => Number.isFinite(n));
      i++;
    } else if (arg.startsWith("--cap=")) {
      cap = Math.max(0.05, Number(arg.slice("--cap=".length)));
    } else if (arg === "--cap" && next) {
      cap = Math.max(0.05, Number(next));
      i++;
    }
  }
  return { matches, seeds, baseSeed, cap, seedList };
}

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
  const available = (["FW", "MF", "DF", "GK"] as PosGroup[]).filter(
    (g) => byGroup[g].length > 0 && shares[g] > 0
  );
  if (available.length === 0) {
    return candidates[Math.floor(rng() * candidates.length)];
  }
  const totalShare = available.reduce((s, g) => s + shares[g], 0);
  let roll = rng() * totalShare;
  let chosen = available[available.length - 1];
  for (const g of available) {
    roll -= shares[g];
    if (roll <= 0) {
      chosen = g;
      break;
    }
  }
  const pool = byGroup[chosen];
  return pool[Math.floor(rng() * pool.length)];
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1)))
  );
  return sortedAsc[idx];
}

function meanAndStd(arr: number[]): { mean: number; std: number; ci95: number } {
  const n = arr.length;
  if (n === 0) return { mean: 0, std: 0, ci95: 0 };
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const variance =
    n > 1 ? arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const ci95 = 1.96 * (std / Math.sqrt(n));
  return { mean, std, ci95 };
}

type ContribBucket =
  | "GOAL"
  | "ASSIST"
  | "KEY_ACTION"
  | "TEAM_GOAL"
  | "TEAM_CONCEDED"
  | "CLEAN_SHEET"
  | "CARD";

const CONTRIB_BUCKETS: ContribBucket[] = [
  "GOAL",
  "ASSIST",
  "KEY_ACTION",
  "TEAM_GOAL",
  "TEAM_CONCEDED",
  "CLEAN_SHEET",
  "CARD",
];

const YELLOW_CARD_PROB_BY_POS: Record<PosGroup, number> = {
  GK: 0.02,
  DF: 0.18,
  MF: 0.15,
  FW: 0.1,
};

type TeamTier = "STRONG" | "MID" | "WEAK";

interface TeamStrength {
  tier: TeamTier;
  attack: number;
  defense: number;
}

function sampleTeamStrength(rng: () => number): TeamStrength {
  const u = rng();
  if (u < 0.2) {
    return { tier: "STRONG", attack: 1.35, defense: 0.75 };
  }
  if (u < 0.8) {
    return { tier: "MID", attack: 1.0, defense: 1.0 };
  }
  return { tier: "WEAK", attack: 0.72, defense: 1.15 };
}

type TierShort = "S" | "M" | "W";
type MatchupKey = `${TierShort}-${TierShort}`;
const MATCHUP_KEYS: MatchupKey[] = [
  "S-W",
  "S-M",
  "S-S",
  "M-W",
  "M-M",
  "M-S",
  "W-W",
  "W-M",
  "W-S",
];

function tierShort(tier: TeamTier): TierShort {
  return tier === "STRONG" ? "S" : tier === "MID" ? "M" : "W";
}

function emptyCellMap(): Record<PosGroup, Record<MatchupKey, number[]>> {
  const makeMatchups = (): Record<MatchupKey, number[]> => ({
    "S-W": [],
    "S-M": [],
    "S-S": [],
    "M-W": [],
    "M-M": [],
    "M-S": [],
    "W-W": [],
    "W-M": [],
    "W-S": [],
  });
  return {
    FW: makeMatchups(),
    MF: makeMatchups(),
    DF: makeMatchups(),
    GK: makeMatchups(),
  };
}

interface SeedRunOptions {
  useExpectationDeduction?: boolean;
  rateMultiplier?: number;
}

interface SeedMetrics {
  seed: number;
  participants: number;
  intradayHits: number;
  intradayHitPct: number;
  closeHitPct: number;
  upperHitCount: number;
  earlyUpperHitCount: number;
  overallMeanPct: number;
  bestStrategyMeanPct: number;
  bestStrategyCount: number;
  posMeans: Record<PosGroup, number>;
  posCi95: Record<PosGroup, number>;
  maxSpreadPct: number;
  maxAbsCumReturnsAsc: number[];
  contribMeanByPos: Record<PosGroup, Record<ContribBucket, number>>;
  cellReturns: Record<PosGroup, Record<MatchupKey, number[]>>;
}

function runSingleSeed(
  seed: number,
  matchCount: number,
  capLimit: number,
  simOpts: SeedRunOptions = {}
): SeedMetrics {
  const useDeduction = simOpts.useExpectationDeduction ?? true;
  const rateMult = simOpts.rateMultiplier ?? 1.0;
  const rng = createRng(seed);
  const BASE_PRICE = 10000;

  let totalParticipants = 0;
  let intradayHits = 0;
  let closeHits = 0;
  let upperHitCount = 0;
  let earlyUpperHitCount = 0;
  const allReturns: number[] = [];
  const bestStrategyReturns: number[] = [];
  const maxAbsCumReturns: number[] = [];
  const cellReturns = emptyCellMap();
  const groupReturns: Record<PosGroup, number[]> = {
    FW: [],
    MF: [],
    DF: [],
    GK: [],
  };
  const contribSums: Record<PosGroup, Record<ContribBucket, number>> = {
    FW: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
    MF: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
    DF: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
    GK: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
  };

  for (let m = 0; m < matchCount; m++) {
    const matchId = `s${seed}-m${m}`;
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

      const subCount = 3 + Math.floor(rng() * 3);
      const outfieldStarters = starters.filter((s) => s.position !== "GK");
      for (let b = 0; b < subCount; b++) {
        const subMin = 55 + Math.floor(rng() * 31);
        const replacedIdx = Math.floor(rng() * outfieldStarters.length);
        const replaced = outfieldStarters.splice(replacedIdx, 1)[0];
        if (replaced) subOutMinute.set(replaced.playerId, subMin);
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

    const homeStrength = sampleTeamStrength(rng);
    const awayStrength = sampleTeamStrength(rng);
    const homeLambda =
      Math.min(2.2, Math.max(0.8, 1.4 * homeStrength.attack * awayStrength.defense)) *
      rateMult;
    const awayLambda =
      Math.min(2.2, Math.max(0.8, 1.4 * awayStrength.attack * homeStrength.defense)) *
      rateMult;
    const homeGoals = samplePoisson(homeLambda, rng);
    const awayGoals = samplePoisson(awayLambda, rng);
    const goalTimeline: { minute: number; side: "HOME" | "AWAY" }[] = [];
    for (let g = 0; g < homeGoals; g++) {
      goalTimeline.push({ minute: 2 + Math.floor(rng() * 88), side: "HOME" });
    }
    for (let g = 0; g < awayGoals; g++) {
      goalTimeline.push({ minute: 2 + Math.floor(rng() * 88), side: "AWAY" });
    }
    goalTimeline.sort((a, b) => a.minute - b.minute);

    let hScore = 0;
    let aScore = 0;
    let firstConcededHome = 999;
    let firstConcededAway = 999;

    for (const g of goalTimeline) {
      const prevDiff = g.side === "HOME" ? hScore - aScore : aScore - hScore;
      let goalContext: GoalContext = "OPENER";
      if (hScore === 0 && aScore === 0) goalContext = "OPENER";
      else if (prevDiff === -1 || prevDiff === 0) {
        goalContext = prevDiff === -1 ? "EQUALIZER" : "GO_AHEAD";
      } else if (prevDiff >= 1) goalContext = "EXTEND_LEAD";

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

      if (rng() < 0.7) {
        const assistPool = activeSide.filter((p) => p.playerId !== scorer.playerId);
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

    if (firstConcededHome > 45) {
      teamEvents.push({ id: `${matchId}-ev-${evSeq++}`, minute: 45, teamSide: "HOME", kind: "CLEAN_SHEET_45" });
    }
    if (firstConcededHome > 75) {
      teamEvents.push({ id: `${matchId}-ev-${evSeq++}`, minute: 75, teamSide: "HOME", kind: "CLEAN_SHEET_75" });
    }
    if (firstConcededAway > 45) {
      teamEvents.push({ id: `${matchId}-ev-${evSeq++}`, minute: 45, teamSide: "AWAY", kind: "CLEAN_SHEET_45" });
    }
    if (firstConcededAway > 75) {
      teamEvents.push({ id: `${matchId}-ev-${evSeq++}`, minute: 75, teamSide: "AWAY", kind: "CLEAN_SHEET_75" });
    }

    for (const side of ["HOME", "AWAY"] as const) {
      const activeAtMid = participants.filter((p) => p.teamSide === side && p.isStarter);
      const gk = activeAtMid.find((p) => p.position === "GK");
      if (gk) {
        const saves = samplePoisson(2.0 * rateMult, rng);
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
      const outfield = activeAtMid.filter((p) => p.position !== "GK");
      const outfieldActions = samplePoisson(3.5 * rateMult, rng);
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
      const posGroup = toPosGroup(p.position as Position);
      if (rng() < YELLOW_CARD_PROB_BY_POS[posGroup] * rateMult) {
        teamEvents.push({
          id: `${matchId}-ev-${evSeq++}`,
          minute: minStart + Math.floor(rng() * Math.max(1, minEnd - minStart)),
          teamSide: p.teamSide,
          kind: "YELLOW_CARD",
          actorPlayerId: p.playerId,
        });
      }
      if (rng() < 0.005 * rateMult) {
        teamEvents.push({
          id: `${matchId}-ev-${evSeq++}`,
          minute: minStart + Math.floor(rng() * Math.max(1, minEnd - minStart)),
          teamSide: p.teamSide,
          kind: "RED_CARD",
          actorPlayerId: p.playerId,
        });
      }
    }

    const fanned = fanOutTeamEventsToPlayers(participants, teamEvents);
    for (const p of participants) {
      const evs = fanned[p.playerId] ?? [];
      const ownStrength = p.teamSide === "HOME" ? homeStrength : awayStrength;
      const oppStrength = p.teamSide === "HOME" ? awayStrength : homeStrength;
      const expE = useDeduction
        ? expectedReturn(p.position, ownStrength.attack, oppStrength.defense, {
            teamDefense: ownStrength.defense,
            oppAttack: oppStrength.attack,
          })
        : 0;
      const ctx = {
        position: p.position,
        playerId: p.playerId,
        matchId,
        isStarter: p.isStarter,
        subInMinute: p.subInMinute,
        expectedReturn: expE,
      };
      const series = buildPriceSeries(
        BASE_PRICE,
        evs,
        ctx,
        90,
        capLimit
      );

      totalParticipants += 1;
      const posGroup = toPosGroup(p.position as Position);

      for (const ev of evs) {
        const dPct = eventDelta(ev, ctx) * 100;
        if (dPct === 0) continue;
        if (ev.type === "GOAL") contribSums[posGroup].GOAL += dPct;
        else if (ev.type === "ASSIST") contribSums[posGroup].ASSIST += dPct;
        else if (ev.type === "KEY_ACTION" || ev.type === "SAVE" || ev.type === "DEFENSIVE_ACTION" || ev.type === "KEY_PLAY") {
          contribSums[posGroup].KEY_ACTION += dPct;
        } else if (ev.type === "TEAM_GOAL") contribSums[posGroup].TEAM_GOAL += dPct;
        else if (ev.type === "TEAM_CONCEDED" || ev.type === "CONCEDED") {
          contribSums[posGroup].TEAM_CONCEDED += dPct;
        } else if (ev.type === "CLEAN_SHEET_45" || ev.type === "CLEAN_SHEET_75") {
          contribSums[posGroup].CLEAN_SHEET += dPct;
        } else if (ev.type === "YELLOW_CARD" || ev.type === "RED_CARD") {
          contribSums[posGroup].CARD += dPct;
        }
      }

      let maxAbsRaw = 0;
      let hitIntraday = false;
      let firstUpperHitMin = -1;
      for (const pt of series.points) {
        const rr = Math.abs(pt.rawReturn ?? 0);
        if (rr > maxAbsRaw) maxAbsRaw = rr;
        const cr = pt.clampedReturn ?? 0;
        if (Math.abs(cr) >= capLimit) hitIntraday = true;
        if (firstUpperHitMin === -1 && cr >= capLimit) {
          firstUpperHitMin = pt.minute;
        }
      }
      if (hitIntraday) intradayHits += 1;
      if (Math.abs(series.clampedReturn) >= capLimit) closeHits += 1;

      if (firstUpperHitMin !== -1) {
        upperHitCount += 1;
        const indivCount = evs.filter(
          (e) =>
            e.minute <= firstUpperHitMin &&
            (e.type === "GOAL" ||
              e.type === "ASSIST" ||
              e.type === "KEY_ACTION" ||
              e.type === "YELLOW_CARD" ||
              e.type === "RED_CARD")
        ).length;
        if (indivCount <= 2) {
          earlyUpperHitCount += 1;
        }
      }

      maxAbsCumReturns.push(maxAbsRaw * 100);
      const retPct = series.clampedReturn * 100;
      allReturns.push(retPct);
      groupReturns[posGroup].push(retPct);
      if (p.isStarter) {
        const matchupKey: MatchupKey = `${tierShort(ownStrength.tier)}-${tierShort(
          oppStrength.tier
        )}`;
        cellReturns[posGroup][matchupKey].push(retPct);
      }
      if (
        p.isStarter &&
        posGroup === "FW" &&
        ((p.teamSide === "HOME" &&
          homeStrength.tier === "STRONG" &&
          awayStrength.tier === "WEAK") ||
          (p.teamSide === "AWAY" &&
            awayStrength.tier === "STRONG" &&
            homeStrength.tier === "WEAK"))
      ) {
        bestStrategyReturns.push(retPct);
      }
    }
  }

  maxAbsCumReturns.sort((a, b) => a - b);

  const fwStat = meanAndStd(groupReturns.FW);
  const mfStat = meanAndStd(groupReturns.MF);
  const dfStat = meanAndStd(groupReturns.DF);
  const gkStat = meanAndStd(groupReturns.GK);
  const overallStat = meanAndStd(allReturns);
  const bestStrategyStat = meanAndStd(bestStrategyReturns);

  const posMeans: Record<PosGroup, number> = {
    FW: fwStat.mean,
    MF: mfStat.mean,
    DF: dfStat.mean,
    GK: gkStat.mean,
  };
  const posCi95: Record<PosGroup, number> = {
    FW: fwStat.ci95,
    MF: mfStat.ci95,
    DF: dfStat.ci95,
    GK: gkStat.ci95,
  };

  const contribMeanByPos: Record<PosGroup, Record<ContribBucket, number>> = {
    FW: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
    MF: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
    DF: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
    GK: { GOAL: 0, ASSIST: 0, KEY_ACTION: 0, TEAM_GOAL: 0, TEAM_CONCEDED: 0, CLEAN_SHEET: 0, CARD: 0 },
  };
  for (const pos of ["FW", "MF", "DF", "GK"] as PosGroup[]) {
    const cnt = Math.max(1, groupReturns[pos].length);
    for (const b of CONTRIB_BUCKETS) {
      contribMeanByPos[pos][b] = contribSums[pos][b] / cnt;
    }
  }

  return {
    seed,
    participants: totalParticipants,
    intradayHits,
    intradayHitPct: (intradayHits / totalParticipants) * 100,
    closeHitPct: (closeHits / totalParticipants) * 100,
    upperHitCount,
    earlyUpperHitCount,
    overallMeanPct: overallStat.mean,
    bestStrategyMeanPct: bestStrategyStat.mean,
    bestStrategyCount: bestStrategyReturns.length,
    posMeans,
    posCi95,
    maxSpreadPct:
      Math.max(posMeans.FW, posMeans.MF, posMeans.DF, posMeans.GK) -
      Math.min(posMeans.FW, posMeans.MF, posMeans.DF, posMeans.GK),
    maxAbsCumReturnsAsc: maxAbsCumReturns,
    contribMeanByPos,
    cellReturns,
  };
}

interface BatchEvalSummary {
  intradayMean: number;
  intradayStd: number;
  closeMean: number;
  overallMean: number;
  overallStd: number;
  spreadMean: number;
  spreadStd: number;
  maxCellUpperCi95: number;
  worstCellLabel: string;
  passHitRate: boolean;
  passSpread: boolean;
  passOverall: boolean;
  passCells: boolean;
  allPass: boolean;
  seedRuns: SeedMetrics[];
}

function evaluateBatch(
  seedList: number[],
  matches: number,
  cap: number,
  simOpts: SeedRunOptions
): BatchEvalSummary {
  const seedRuns = seedList.map((s) => runSingleSeed(s, matches, cap, simOpts));
  const intradayStat = meanAndStd(seedRuns.map((r) => r.intradayHitPct));
  const closeStat = meanAndStd(seedRuns.map((r) => r.closeHitPct));
  const overallStat = meanAndStd(seedRuns.map((r) => r.overallMeanPct));
  const spreadStat = meanAndStd(seedRuns.map((r) => r.maxSpreadPct));

  let maxCellUpperCi95 = -Infinity;
  let worstCellLabel = "";
  for (const pos of ["FW", "MF", "DF", "GK"] as PosGroup[]) {
    for (const mk of MATCHUP_KEYS) {
      const merged = seedRuns.flatMap((r) => r.cellReturns[pos][mk]);
      const st = meanAndStd(merged);
      const upper = st.mean + st.ci95;
      if (upper > maxCellUpperCi95) {
        maxCellUpperCi95 = upper;
        worstCellLabel = `${pos}/${mk} (n=${merged.length}, ${st.mean >= 0 ? "+" : ""}${st.mean.toFixed(2)}%±${st.ci95.toFixed(2)}%)`;
      }
    }
  }

  const passHitRate =
    intradayStat.mean >= PASS_HIT_RATE_MIN_PCT &&
    intradayStat.mean <= PASS_HIT_RATE_MAX_PCT;
  const passSpread = spreadStat.mean <= PASS_MAX_POS_SPREAD_PCT;
  const passOverall = Math.abs(overallStat.mean) <= PASS_ABS_OVERALL_MEAN_PCT;
  const passCells = maxCellUpperCi95 <= PASS_MAX_CELL_CI_UPPER_PCT;

  return {
    intradayMean: intradayStat.mean,
    intradayStd: intradayStat.std,
    closeMean: closeStat.mean,
    overallMean: overallStat.mean,
    overallStd: overallStat.std,
    spreadMean: spreadStat.mean,
    spreadStd: spreadStat.std,
    maxCellUpperCi95,
    worstCellLabel,
    passHitRate,
    passSpread,
    passOverall,
    passCells,
    allPass: passHitRate && passSpread && passOverall && passCells,
    seedRuns,
  };
}

function main(): void {
  const opts = parseCliOptions(process.argv.slice(2));
  const seedList =
    opts.seedList && opts.seedList.length > 0
      ? opts.seedList
      : Array.from({ length: opts.seeds }, (_, idx) => opts.baseSeed + idx * 101);

  console.log(
    `=== PitchTrade Balance Verification (matches=${opts.matches}/seed, seeds=${seedList.join(",")}, cap=±${(
      opts.cap * 100
    ).toFixed(0)}%) ===`
  );

  const seedRuns = seedList.map((s) => runSingleSeed(s, opts.matches, opts.cap));

  console.log("\n[1] Per-Seed Breakdown:");
  for (const r of seedRuns) {
    console.log(
      `  Seed ${r.seed}: IntradayHit=${r.intradayHitPct.toFixed(2)}% (${r.intradayHits}/${r.participants}) | CloseHit=${r.closeHitPct.toFixed(2)}% | Overall=${r.overallMeanPct >= 0 ? "+" : ""}${r.overallMeanPct.toFixed(2)}% | Spread=${r.maxSpreadPct.toFixed(2)}%p | BestStrat=${r.bestStrategyMeanPct >= 0 ? "+" : ""}${r.bestStrategyMeanPct.toFixed(2)}% (n=${r.bestStrategyCount})`
    );
  }

  const intradayStat = meanAndStd(seedRuns.map((r) => r.intradayHitPct));
  const closeStat = meanAndStd(seedRuns.map((r) => r.closeHitPct));
  const overallStat = meanAndStd(seedRuns.map((r) => r.overallMeanPct));
  const spreadStat = meanAndStd(seedRuns.map((r) => r.maxSpreadPct));
  const bestStratStat = meanAndStd(seedRuns.map((r) => r.bestStrategyMeanPct));

  const totalParticipantsAll = seedRuns.reduce((s, r) => s + r.participants, 0);
  const totalIntradayHitsAll = seedRuns.reduce((s, r) => s + r.intradayHits, 0);
  const totalBestStratAll = seedRuns.reduce((s, r) => s + r.bestStrategyCount, 0);

  const combinedMaxAbs = seedRuns
    .flatMap((r) => r.maxAbsCumReturnsAsc)
    .sort((a, b) => a - b);

  console.log("\n[2] Aggregate Across Seeds (Mean ± SD):");
  console.log(
    `  Intraday Cap Hit Rate : ${intradayStat.mean.toFixed(2)}% ± ${intradayStat.std.toFixed(2)}% (formula: totalIntradayHits / totalParticipants = ${totalIntradayHitsAll} / ${totalParticipantsAll} = ${((totalIntradayHitsAll / totalParticipantsAll) * 100).toFixed(2)}%)`
  );
  console.log(
    `  Close Cap Hit Rate    : ${closeStat.mean.toFixed(2)}% ± ${closeStat.std.toFixed(2)}%`
  );
  console.log(
    `  Overall Mean Return   : ${overallStat.mean >= 0 ? "+" : ""}${overallStat.mean.toFixed(2)}% ± ${overallStat.std.toFixed(2)}%`
  );
  console.log(
    `  Position Max Spread   : ${spreadStat.mean.toFixed(2)}%p ± ${spreadStat.std.toFixed(2)}%p`
  );
  console.log(
    `  Best Strategy (Strong FW vs Weak) : ${bestStratStat.mean >= 0 ? "+" : ""}${bestStratStat.mean.toFixed(2)}% ± ${bestStratStat.std.toFixed(2)}% (n=${totalBestStratAll})`
  );
  console.log(
    `  Max Intraday |Return| : p50=${percentile(combinedMaxAbs, 50).toFixed(2)}% | p90=${percentile(combinedMaxAbs, 90).toFixed(2)}% | p99=${percentile(combinedMaxAbs, 99).toFixed(2)}%`
  );

  console.log("\n[3] Position Mean Return (95% Confidence Interval, Seed 1):");
  const ref = seedRuns[0];
  for (const pos of ["FW", "MF", "DF", "GK"] as PosGroup[]) {
    console.log(
      `  ${pos}: ${ref.posMeans[pos] >= 0 ? "+" : ""}${ref.posMeans[pos].toFixed(2)}% ± ${ref.posCi95[pos].toFixed(2)}% (95% CI)`
    );
  }

  const totalUpper = seedRuns.reduce((s, r) => s + r.upperHitCount, 0);
  const totalEarlyUpper = seedRuns.reduce((s, r) => s + r.earlyUpperHitCount, 0);
  const earlyUpperPct = totalUpper > 0 ? (totalEarlyUpper / totalUpper) * 100 : 0;
  console.log(
    `\n[3b] Early Upper-Cap Hit (<=2 individual events among +${(opts.cap * 100).toFixed(0)}% hits): ${earlyUpperPct.toFixed(2)}% (numerator=${totalEarlyUpper} / denominator=${totalUpper} upper-cap hitters)`
  );

  console.log("\n[3c] Event Contribution by Position (%p, Seed 1):");
  console.log("  Pos |   GOAL  |  ASSIST | KEY_ACT | TM_GOAL | TM_CONC |  CLN_SH |   CARD");
  for (const pos of ["FW", "MF", "DF", "GK"] as PosGroup[]) {
    const c = ref.contribMeanByPos[pos];
    const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`.padStart(7);
    console.log(
      `  ${pos.padEnd(3)} | ${fmt(c.GOAL)} | ${fmt(c.ASSIST)} | ${fmt(c.KEY_ACTION)} | ${fmt(c.TEAM_GOAL)} | ${fmt(c.TEAM_CONCEDED)} | ${fmt(c.CLEAN_SHEET)} | ${fmt(c.CARD)}`
    );
  }

  console.log("\n[4] Pos x Matchup PRE-Open Return Table (95% CI across all seeds, Starters):");
  const headerCells = MATCHUP_KEYS.map((k) => k.padStart(13)).join(" | ");
  console.log(`  Pos | ${headerCells}`);
  for (const pos of ["FW", "MF", "DF", "GK"] as PosGroup[]) {
    const rowCells = MATCHUP_KEYS.map((mk) => {
      const merged = seedRuns.flatMap((r) => r.cellReturns[pos][mk]);
      const st = meanAndStd(merged);
      const cellStr = `${st.mean >= 0 ? "+" : ""}${st.mean.toFixed(2)}±${st.ci95.toFixed(2)}`;
      return cellStr.padStart(13);
    }).join(" | ");
    console.log(`  ${pos.padEnd(3)} | ${rowCells}`);
  }

  const v24Base = evaluateBatch(seedList, opts.matches, opts.cap, {
    useExpectationDeduction: true,
    rateMultiplier: 1.0,
  });
  const v23Base = evaluateBatch(seedList, opts.matches, opts.cap, {
    useExpectationDeduction: false,
    rateMultiplier: 1.0,
  });

  console.log("\n[5] v2.3 vs v2.4 Comparison Table:");
  console.log("  Version | IntradayHit% | CloseHit% | OverallMean% | MaxSpread%p | MaxCellUpperCI% | Verdict");
  console.log(
    `  v2.3    | ${v23Base.intradayMean.toFixed(2).padStart(11)}% | ${v23Base.closeMean.toFixed(2).padStart(8)}% | ${(v23Base.overallMean >= 0 ? "+" : "") + v23Base.overallMean.toFixed(2).padStart(10)}% | ${v23Base.spreadMean.toFixed(2).padStart(10)}%p | ${(v23Base.maxCellUpperCi95 >= 0 ? "+" : "") + v23Base.maxCellUpperCi95.toFixed(2).padStart(13)}% | ${v23Base.allPass ? "ALL PASS" : "FAIL"}`
  );
  console.log(
    `  v2.4    | ${v24Base.intradayMean.toFixed(2).padStart(11)}% | ${v24Base.closeMean.toFixed(2).padStart(8)}% | ${(v24Base.overallMean >= 0 ? "+" : "") + v24Base.overallMean.toFixed(2).padStart(10)}% | ${v24Base.spreadMean.toFixed(2).padStart(10)}%p | ${(v24Base.maxCellUpperCi95 >= 0 ? "+" : "") + v24Base.maxCellUpperCi95.toFixed(2).padStart(13)}% | ${v24Base.allPass ? "ALL PASS" : "FAIL"}`
  );

  console.log("\n[6] RATES ±20% Sensitivity Evaluation (v2.4):");
  console.log("  Scenario      | IntradayHit% | OverallMean% | MaxSpread%p | MaxCellUpperCI% | Verdict");
  let allScenariosPass = true;
  for (const mult of [0.8, 1.0, 1.2]) {
    const sc = evaluateBatch(seedList, opts.matches, opts.cap, {
      useExpectationDeduction: true,
      rateMultiplier: mult,
    });
    if (!sc.allPass) allScenariosPass = false;
    const label = mult === 0.8 ? "RATES -20%" : mult === 1.0 ? "RATES Base" : "RATES +20%";
    console.log(
      `  ${label.padEnd(13)} | ${sc.intradayMean.toFixed(2).padStart(11)}% | ${(sc.overallMean >= 0 ? "+" : "") + sc.overallMean.toFixed(2).padStart(10)}% | ${sc.spreadMean.toFixed(2).padStart(10)}%p | ${(sc.maxCellUpperCi95 >= 0 ? "+" : "") + sc.maxCellUpperCi95.toFixed(2).padStart(13)}% | ${sc.allPass ? "ALL PASS" : "FAIL"}`
    );
  }

  console.log("\n[7] Verification Verdict (v2.4 Baseline):");
  console.log(
    `  [${v24Base.passHitRate ? "PASS" : "FAIL"}] Intraday ±${(opts.cap * 100).toFixed(0)}% Hit Rate in [${PASS_HIT_RATE_MIN_PCT}%, ${PASS_HIT_RATE_MAX_PCT}%]: ${v24Base.intradayMean.toFixed(2)}%`
  );
  console.log(
    `  [${v24Base.passSpread ? "PASS" : "FAIL"}] Position Max Spread <= ${PASS_MAX_POS_SPREAD_PCT.toFixed(1)}%p: ${v24Base.spreadMean.toFixed(2)}%p`
  );
  console.log(
    `  [${v24Base.passOverall ? "PASS" : "FAIL"}] |Overall Mean Return| <= ${PASS_ABS_OVERALL_MEAN_PCT.toFixed(1)}%: ${Math.abs(v24Base.overallMean).toFixed(2)}%`
  );
  console.log(
    `  [${v24Base.passCells ? "PASS" : "FAIL"}] All Pos x Matchup 95% CI Upper <= ${PASS_MAX_CELL_CI_UPPER_PCT.toFixed(1)}%: max=${v24Base.maxCellUpperCi95.toFixed(2)}% (${v24Base.worstCellLabel})`
  );

  if (!v24Base.allPass || !allScenariosPass) {
    process.exitCode = 1;
  }
}

main();
