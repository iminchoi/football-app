import type { Position, PositionLine, PricePoint } from "../types";

export const CIRCUIT_BREAKER_MS = 30_000;
export const RETURN_CLAMP_MIN = -0.3;
export const RETURN_CLAMP_MAX = 0.3;

export type GoalContext =
  | "EQUALIZER"
  | "GO_AHEAD"
  | "OPENER"
  | "EXTEND_LEAD";

export type PlayerEventType =
  | "GOAL"
  | "ASSIST"
  | "KEY_PLAY"
  | "SAVE"
  | "DEFENSIVE_ACTION"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "CONCEDED"
  | "BIG_CHANCE_MISS"
  | "TEAM_GOAL"
  | "TEAM_CONCEDED"
  | "CLEAN_SHEET_45"
  | "CLEAN_SHEET_75"
  | "LINEUP_CONFIRMED"
  | "LINEUP_EXCLUDED"
  | "SUB_IN"
  | "PENALTY";

export interface PlayerEvent {
  id: string;
  playerId: string;
  minute: number;
  type: PlayerEventType;
  description?: string;
  goalContext?: GoalContext;
  triggeredAt?: number; // Epoch ms for 30s circuit breaker
}

export interface PlayerContext {
  position: Position | PositionLine | string;
  isStarter?: boolean;
  subInMinute?: number;
  isBenchUnused?: boolean;
  seedId?: string;
}

export interface MatchParticipant {
  playerId: string;
  teamSide: "HOME" | "AWAY";
  position: Position | PositionLine | string;
  isStarter: boolean;
  subInMinute?: number;
  isBenchUnused?: boolean;
}

export interface TeamMatchRawEvent {
  id: string;
  minute: number;
  teamSide: "HOME" | "AWAY";
  kind:
    | "GOAL"
    | "ASSIST"
    | "KEY_PLAY"
    | "SAVE"
    | "DEFENSIVE_ACTION"
    | "YELLOW_CARD"
    | "RED_CARD"
    | "BIG_CHANCE_MISS"
    | "PENALTY"
    | "CLEAN_SHEET_45"
    | "CLEAN_SHEET_75"
    | "LINEUP_CONFIRMED"
    | "LINEUP_EXCLUDED"
    | "SUB_IN";
  actorPlayerId?: string;
  goalContext?: GoalContext;
  description?: string;
  triggeredAt?: number;
}

export interface DerivedCumulativeReturn {
  rawReturn: number;
  clampedReturn: number;
}

export interface DerivedPlayerStats {
  goals: number;
  assists: number;
  shotsOnTarget: number;
  keyPasses: number;
  saves: number;
  defensiveActions: number;
  yellowCards: number;
  redCards: number;
}

export interface PriceSeriesResult {
  basePrice: number;
  currentPrice: number;
  rawReturn: number;
  clampedReturn: number;
  points: PricePoint[];
  stats: DerivedPlayerStats;
}

const round10 = (val: number): number => Math.round(val / 10) * 10;

function resolveLine(pos?: string): PositionLine {
  if (!pos) return "MF";
  const u = pos.trim().toUpperCase();
  if (u === "GK" || u.includes("KEEP")) return "GK";
  if (
    u === "LB" ||
    u === "CB" ||
    u === "RB" ||
    u === "WB" ||
    u === "LWB" ||
    u === "RWB" ||
    u === "DF" ||
    u.includes("DEF") ||
    u.includes("BACK")
  ) {
    return "DF";
  }
  if (
    u === "LW" ||
    u === "ST" ||
    u === "RW" ||
    u === "FW" ||
    u === "CF" ||
    u.includes("FORW") ||
    u.includes("STRIK") ||
    u.includes("WING")
  ) {
    return "FW";
  }
  return "MF";
}

function deterministicNoise(seed: string, minute: number): number {
  let h = 2166136261;
  const s = `${seed}:${minute}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Pure deterministic delta table for a single PlayerEvent given PlayerContext.
 * Zero randomness: identical inputs always yield the exact same return delta.
 */
export function eventDelta(event: PlayerEvent, ctx: PlayerContext): number {
  if (ctx.isBenchUnused) {
    return 0;
  }

  // Events occurring before a substitute entered the pitch do not affect their price
  if (
    ctx.subInMinute !== undefined &&
    event.type !== "LINEUP_CONFIRMED" &&
    event.type !== "LINEUP_EXCLUDED" &&
    event.minute < ctx.subInMinute
  ) {
    return 0;
  }

  const line = resolveLine(ctx.position);

  switch (event.type) {
    case "GOAL": {
      const ctxBonus =
        event.goalContext === "EQUALIZER" || event.goalContext === "GO_AHEAD"
          ? 0.09
          : event.goalContext === "EXTEND_LEAD"
          ? 0.05
          : 0.07; // OPENER / default
      const defenderBonus = line === "DF" || line === "GK" ? 0.02 : 0;
      return ctxBonus + defenderBonus;
    }
    case "ASSIST":
      return 0.045;
    case "SAVE":
    case "DEFENSIVE_ACTION":
    case "KEY_PLAY":
      return 0.015;
    case "YELLOW_CARD":
      return -0.02;
    case "RED_CARD":
      return -0.12;
    case "TEAM_GOAL":
      return 0.008;
    case "TEAM_CONCEDED":
    case "CONCEDED":
      return line === "GK" || line === "DF" ? -0.015 : -0.005;
    case "CLEAN_SHEET_45":
      return line === "GK" || line === "DF" ? 0.012 : 0;
    case "CLEAN_SHEET_75":
      return line === "GK" || line === "DF" ? 0.015 : 0;
    case "LINEUP_CONFIRMED":
      return 0.01;
    case "LINEUP_EXCLUDED":
      return -0.02;
    case "BIG_CHANCE_MISS":
      return -0.015;
    case "PENALTY":
    case "SUB_IN":
    default:
      return 0;
  }
}

/**
 * Sum all event deltas before clamping once at [-0.30, +0.30].
 * Exposes both `rawReturn` (for UI inspection) and `clampedReturn` (effective price cap/floor).
 */
export function calculateCumulativeReturn(
  events: PlayerEvent[],
  ctx: PlayerContext
): DerivedCumulativeReturn {
  if (ctx.isBenchUnused) {
    return { rawReturn: 0, clampedReturn: 0 };
  }

  let raw = 0;
  for (const ev of events) {
    raw += eventDelta(ev, ctx);
  }
  const rawReturn = Number(raw.toFixed(4));
  const clampedReturn = Number(
    Math.max(RETURN_CLAMP_MIN, Math.min(RETURN_CLAMP_MAX, rawReturn)).toFixed(4)
  );
  return { rawReturn, clampedReturn };
}

/**
 * Derive cumulative player statistics exclusively from the canonical PlayerEvent[] SSOT.
 */
export function deriveStatsFromEvents(
  events: PlayerEvent[]
): DerivedPlayerStats {
  let goals = 0;
  let assists = 0;
  let shotsOnTarget = 0;
  let keyPasses = 0;
  let saves = 0;
  let defensiveActions = 0;
  let yellowCards = 0;
  let redCards = 0;

  for (const ev of events) {
    if (ev.type === "GOAL") {
      goals += 1;
      shotsOnTarget += 1;
    } else if (ev.type === "ASSIST") {
      assists += 1;
      keyPasses += 1;
    } else if (ev.type === "KEY_PLAY") {
      shotsOnTarget += 1;
    } else if (ev.type === "SAVE") {
      saves += 1;
    } else if (ev.type === "DEFENSIVE_ACTION") {
      defensiveActions += 1;
    } else if (ev.type === "YELLOW_CARD") {
      yellowCards += 1;
    } else if (ev.type === "RED_CARD") {
      redCards += 1;
    }
  }

  return {
    goals,
    assists,
    shotsOnTarget,
    keyPasses,
    saves,
    defensiveActions,
    yellowCards,
    redCards,
  };
}

/**
 * Fan-out team-level match events into per-player canonical PlayerEvent[] arrays.
 * Ensures team goals, team conceded goals, 45'/75' clean sheets, and lineup confirmations
 * propagate deterministically to every eligible active participant.
 */
export function fanOutTeamEventsToPlayers(
  participants: MatchParticipant[],
  teamEvents: TeamMatchRawEvent[]
): Record<string, PlayerEvent[]> {
  const result: Record<string, PlayerEvent[]> = {};
  for (const p of participants) {
    result[p.playerId] = [];
  }

  const sortedTeamEvents = [...teamEvents].sort((a, b) => a.minute - b.minute);

  for (const raw of sortedTeamEvents) {
    for (const p of participants) {
      if (p.isBenchUnused) continue;

      const onPitchAtMinute =
        p.isStarter ||
        (p.subInMinute !== undefined && raw.minute >= p.subInMinute);

      if (raw.kind === "LINEUP_CONFIRMED" || raw.kind === "LINEUP_EXCLUDED") {
        if (raw.actorPlayerId && raw.actorPlayerId !== p.playerId) continue;
        if (!raw.actorPlayerId && raw.teamSide !== p.teamSide) continue;
        result[p.playerId].push({
          id: `${raw.id}-${p.playerId}`,
          playerId: p.playerId,
          minute: raw.minute,
          type: raw.kind,
          description: raw.description,
        });
        continue;
      }

      if (raw.kind === "SUB_IN") {
        if (raw.actorPlayerId === p.playerId) {
          result[p.playerId].push({
            id: `${raw.id}-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "SUB_IN",
            description: raw.description ?? "교체 투입",
          });
        }
        continue;
      }

      if (!onPitchAtMinute) continue;

      if (raw.kind === "GOAL") {
        if (raw.actorPlayerId === p.playerId) {
          result[p.playerId].push({
            id: `${raw.id}-scorer-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "GOAL",
            goalContext: raw.goalContext ?? "OPENER",
            description: raw.description ?? "득점 성공",
            triggeredAt: raw.triggeredAt,
          });
        } else if (raw.teamSide === p.teamSide) {
          result[p.playerId].push({
            id: `${raw.id}-tgoal-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "TEAM_GOAL",
            description: "팀 득점 보너스",
          });
        } else {
          result[p.playerId].push({
            id: `${raw.id}-tconc-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "TEAM_CONCEDED",
            description: "팀 실점 반영",
          });
        }
        continue;
      }

      if (raw.kind === "CLEAN_SHEET_45" || raw.kind === "CLEAN_SHEET_75") {
        const line = resolveLine(p.position);
        if (raw.teamSide === p.teamSide && (line === "GK" || line === "DF")) {
          result[p.playerId].push({
            id: `${raw.id}-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: raw.kind,
            description:
              raw.kind === "CLEAN_SHEET_45"
                ? "전반 무실점 클린시트 보상"
                : "75분 무실점 클린시트 보상",
          });
        }
        continue;
      }

      // Individual player events (ASSIST, KEY_PLAY, SAVE, DEFENSIVE_ACTION, YELLOW_CARD, RED_CARD, BIG_CHANCE_MISS, PENALTY)
      if (raw.actorPlayerId === p.playerId) {
        result[p.playerId].push({
          id: `${raw.id}-${p.playerId}`,
          playerId: p.playerId,
          minute: raw.minute,
          type: raw.kind,
          description: raw.description,
          triggeredAt: raw.triggeredAt,
        });
      }
    }
  }

  return result;
}

/**
 * Build minute-by-minute PricePoint[] series from basePrice and PlayerEvent[] SSOT.
 * Quiet intervals have micro-noise bounded strictly within ±0.15% so event step-jumps stand out cleanly.
 */
export function buildPriceSeries(
  basePrice: number,
  events: PlayerEvent[],
  ctx: PlayerContext,
  endMinute = 90
): PriceSeriesResult {
  const safeBase = Math.max(100, round10(basePrice));
  const stats = deriveStatsFromEvents(events);

  if (ctx.isBenchUnused) {
    return {
      basePrice: safeBase,
      currentPrice: safeBase,
      rawReturn: 0,
      clampedReturn: 0,
      points: [{ minute: 0, timeLabel: "0'", price: safeBase, changePercentFromOpen: 0, rawReturn: 0, clampedReturn: 0 }],
      stats,
    };
  }

  const sortedEvents = [...events].sort((a, b) => a.minute - b.minute);
  const eventsByMin = new Map<number, PlayerEvent[]>();
  for (const ev of sortedEvents) {
    const min = Math.max(0, Math.min(95, Math.round(ev.minute)));
    const list = eventsByMin.get(min) ?? [];
    list.push(ev);
    eventsByMin.set(min, list);
  }

  const maxEvMin =
    sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].minute : 0;
  const targetEnd = Math.max(0, Math.min(95, Math.max(endMinute, maxEvMin)));
  const seed = ctx.seedId ?? sortedEvents[0]?.playerId ?? "player";

  let cumulativeRaw = 0;
  const points: PricePoint[] = [];

  for (let m = 0; m <= targetEnd; m++) {
    const minEvents = eventsByMin.get(m) ?? [];
    let stepDelta = 0;
    for (const ev of minEvents) {
      stepDelta += eventDelta(ev, ctx);
    }
    cumulativeRaw += stepDelta;

    // Quiet-interval micro-noise strictly within ±0.15% (1/3 of prior level)
    const quietNoise =
      m === 0 || minEvents.length > 0
        ? 0
        : (deterministicNoise(seed, m) - 0.5) * 0.003; // [-0.0015, +0.0015]

    const rawAtMinute = Number((cumulativeRaw + quietNoise).toFixed(4));
    const clampedAtMinute = Number(
      Math.max(RETURN_CLAMP_MIN, Math.min(RETURN_CLAMP_MAX, rawAtMinute)).toFixed(4)
    );
    const price = round10(safeBase * (1 + clampedAtMinute));

    // Only emit sample points at 0, 15, 30, 45, 60, 75, 90, event minutes, or targetEnd
    if (
      m === 0 ||
      m === targetEnd ||
      m % 5 === 0 ||
      minEvents.length > 0
    ) {
      const primaryEv = minEvents.find((e) => Math.abs(eventDelta(e, ctx)) > 0);
      const primaryPct = primaryEv
        ? Number((eventDelta(primaryEv, ctx) * 100).toFixed(1))
        : 0;
      const chartType =
        primaryEv &&
        (primaryEv.type === "GOAL" ||
          primaryEv.type === "ASSIST" ||
          primaryEv.type === "YELLOW_CARD" ||
          primaryEv.type === "RED_CARD" ||
          primaryEv.type === "SAVE" ||
          primaryEv.type === "DEFENSIVE_ACTION" ||
          primaryEv.type === "KEY_PLAY" ||
          primaryEv.type === "CONCEDED" ||
          primaryEv.type === "BIG_CHANCE_MISS")
          ? primaryEv.type
          : undefined;

      points.push({
        minute: m,
        timeLabel: m > 90 ? `90+${m - 90}'` : `${m}'`,
        price,
        changePercentFromOpen: Number((clampedAtMinute * 100).toFixed(2)),
        rawReturn: rawAtMinute,
        clampedReturn: clampedAtMinute,
        ...(chartType && primaryEv
          ? {
              event: {
                type: chartType,
                label: `${primaryEv.description ?? chartType} (${
                  primaryPct >= 0 ? "+" : ""
                }${primaryPct.toFixed(1)}%)`,
                impactPercent: primaryPct,
              },
            }
          : {}),
      });
    }
  }

  const finalReturn = calculateCumulativeReturn(sortedEvents, ctx);
  const currentPrice = round10(safeBase * (1 + finalReturn.clampedReturn));

  return {
    basePrice: safeBase,
    currentPrice,
    rawReturn: finalReturn.rawReturn,
    clampedReturn: finalReturn.clampedReturn,
    points,
    stats,
  };
}

/**
 * Check whether a 30-second circuit breaker is active after a major event
 * (GOAL, RED_CARD, or PENALTY).
 */
export function getCircuitBreakerRemainingSec(
  lastMajorEventAt?: number,
  nowMs = Date.now()
): number {
  if (!lastMajorEventAt || !Number.isFinite(lastMajorEventAt)) return 0;
  const elapsed = nowMs - lastMajorEventAt;
  if (elapsed < 0 || elapsed >= CIRCUIT_BREAKER_MS) return 0;
  return Math.ceil((CIRCUIT_BREAKER_MS - elapsed) / 1000);
}

export function isCircuitBreakerActive(
  lastMajorEventAt?: number,
  nowMs = Date.now()
): boolean {
  return getCircuitBreakerRemainingSec(lastMajorEventAt, nowMs) > 0;
}
