import type {
  CandleData,
  CandleTimeframe,
  ChartEventMarker,
  ChartEventType,
  Match,
  MatchEvent,
  MatchEventType,
  MatchStatus,
  Player,
  Position,
  PositionLine,
  PricePoint,
} from "../types";
import { getPositionLine } from "../types/index.ts";
import { getTierConfig } from "../utils/tier.ts";
import { RATES, WEIGHTS } from "./weights.ts";

export const RETURN_CLAMP_MIN = -WEIGHTS.CAP_LIMIT;
export const RETURN_CLAMP_MAX = WEIGHTS.CAP_LIMIT;

export type GoalContext =
  | "EQUALIZER"
  | "GO_AHEAD"
  | "OPENER"
  | "EXTEND_LEAD";

export type PlayerEventType =
  | "GOAL"
  | "ASSIST"
  | "KEY_ACTION"
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
  | "SUB_OUT"
  | "PENALTY";

export type EventSource = "REAL" | "SIMULATED";

export interface PlayerEvent {
  id: string;
  playerId: string;
  minute: number;
  type: PlayerEventType;
  source: EventSource;
  description?: string;
  goalContext?: GoalContext;
  detectedAt?: number; // Epoch ms when API/feed detected event (used by orderGate)
  triggeredAt?: number; // Legacy alias for detectedAt
  estimated?: boolean;
  metadata?: { estimated?: boolean };
}

export interface PlayerContext {
  position: Position | PositionLine | string;
  playerId?: string;
  matchId?: string;
  isStarter?: boolean;
  subInMinute?: number;
  subOutMinute?: number;
  isBenchUnused?: boolean;
  seedId?: string;
  expectedReturn?: number;
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
    | "KEY_ACTION"
    | "KEY_PLAY"
    | "SAVE"
    | "DEFENSIVE_ACTION"
    | "YELLOW_CARD"
    | "RED_CARD"
    | "BIG_CHANCE_MISS"
    | "PENALTY"
    | "CLEAN_SHEET_45"
    | "CLEAN_SHEET_75"
    | "TEAM_GOAL"
    | "TEAM_CONCEDED"
    | "LINEUP_CONFIRMED"
    | "LINEUP_EXCLUDED"
    | "SUB_IN"
    | "SUB_OUT";
  actorPlayerId?: string;
  goalContext?: GoalContext;
  description?: string;
  triggeredAt?: number;
  source?: EventSource;
  estimated?: boolean;
  metadata?: { estimated?: boolean };
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

function deterministicNoise(
  playerId: string,
  matchId: string,
  minute: number
): number {
  let h = 2166136261;
  const s = `${playerId}:${matchId}:${minute}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Pure deterministic delta table (v2.1) for a single PlayerEvent given PlayerContext.
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
      // Mutually exclusive priority: Equalizer/Go-ahead > Opener > Extend Lead (2+ goal margin)
      const ctxBonus =
        event.goalContext === "EQUALIZER" || event.goalContext === "GO_AHEAD"
          ? WEIGHTS.GOAL.EQUALIZER_OR_GO_AHEAD
          : event.goalContext === "EXTEND_LEAD"
          ? WEIGHTS.GOAL.EXTEND_LEAD
          : WEIGHTS.GOAL.OPENER;
      const defenderBonus =
        line === "DF" || line === "GK" ? WEIGHTS.GOAL.DEFENDER_OR_GK_BONUS : 0;
      return ctxBonus + defenderBonus;
    }
    case "ASSIST":
      return WEIGHTS.ASSIST;
    case "KEY_ACTION":
    case "SAVE":
    case "DEFENSIVE_ACTION":
    case "KEY_PLAY":
      return line === "GK" ? WEIGHTS.KEY_ACTION.GK : WEIGHTS.KEY_ACTION.OUTFIELD;
    case "YELLOW_CARD":
      return WEIGHTS.YELLOW_CARD;
    case "RED_CARD":
      return WEIGHTS.RED_CARD;
    case "TEAM_GOAL":
      return WEIGHTS.TEAM_GOAL;
    case "TEAM_CONCEDED":
    case "CONCEDED":
      return line === "GK" || line === "DF"
        ? WEIGHTS.TEAM_CONCEDED.GK_OR_DF
        : WEIGHTS.TEAM_CONCEDED.MF_OR_FW;
    case "CLEAN_SHEET_45":
      return line === "GK" || line === "DF" ? WEIGHTS.CLEAN_SHEET_45 : 0;
    case "CLEAN_SHEET_75":
      return line === "GK" || line === "DF" ? WEIGHTS.CLEAN_SHEET_75 : 0;
    case "LINEUP_CONFIRMED":
      return WEIGHTS.LINEUP_CONFIRMED;
    case "LINEUP_EXCLUDED":
      return WEIGHTS.LINEUP_EXCLUDED;
    case "BIG_CHANCE_MISS":
      return WEIGHTS.BIG_CHANCE_MISS;
    case "PENALTY":
    case "SUB_IN":
    case "SUB_OUT":
    default:
      return 0;
  }
}

export type RatesTable = typeof RATES;

export interface ExpectedReturnOptions {
  teamDefense?: number;
  oppAttack?: number;
  rates?: RatesTable;
}

/**
 * Pure pre-match expected return E = WEIGHTS × RATES for a position and matchup strength.
 * Returns a decimal ratio (e.g. 0.032 for +3.20%).
 */
export function expectedReturn(
  pos: Position | PositionLine | string,
  teamAttack = 1,
  oppDefense = 1,
  options: ExpectedReturnOptions = {}
): number {
  const line = getPositionLine(pos);
  const rates = options.rates ?? RATES;
  const isDefOrGk = line === "DF" || line === "GK";

  const avgGoalWeight =
    (WEIGHTS.GOAL.OPENER +
      WEIGHTS.GOAL.EQUALIZER_OR_GO_AHEAD +
      WEIGHTS.GOAL.EXTEND_LEAD) /
      3 +
    (isDefOrGk ? WEIGHTS.GOAL.DEFENDER_OR_GK_BONUS : 0);
  const keyActionWeight =
    line === "GK" ? WEIGHTS.KEY_ACTION.GK : WEIGHTS.KEY_ACTION.OUTFIELD;
  const concededWeight = isDefOrGk
    ? WEIGHTS.TEAM_CONCEDED.GK_OR_DF
    : WEIGHTS.TEAM_CONCEDED.MF_OR_FW;

  const safeTeamAttack = Math.max(0.25, teamAttack);
  const safeOppDefense = Math.max(0.25, oppDefense);
  const attackScale = safeTeamAttack * safeOppDefense;
  const concedeScale =
    options.teamDefense !== undefined && options.oppAttack !== undefined
      ? Math.max(0.25, options.teamDefense * options.oppAttack)
      : 1 / safeTeamAttack;
  const cleanSheetScale = Math.exp(1 - concedeScale);

  const total =
    attackScale *
      (avgGoalWeight * rates.GOAL[line] +
        WEIGHTS.ASSIST * rates.ASSIST[line] +
        WEIGHTS.TEAM_GOAL * rates.TEAM_GOAL[line]) +
    keyActionWeight * rates.KEY_ACTION[line] +
    concedeScale * concededWeight * rates.TEAM_CONCEDED[line] +
    cleanSheetScale *
      (WEIGHTS.CLEAN_SHEET_45 * rates.CLEAN_SHEET_45[line] +
        WEIGHTS.CLEAN_SHEET_75 * rates.CLEAN_SHEET_75[line]) +
    WEIGHTS.YELLOW_CARD * rates.YELLOW_CARD[line] +
    WEIGHTS.RED_CARD * rates.RED_CARD[line];

  return Number(total.toFixed(4));
}

/**
 * Sum all event deltas minus optional expectation deduction before clamping once at [-cap, +cap].
 * Exposes both `rawReturn` (for UI inspection) and `clampedReturn` (effective price cap/floor).
 */
export function calculateCumulativeReturn(
  events: PlayerEvent[],
  ctx: PlayerContext,
  capLimit: number = RETURN_CLAMP_MAX,
  deduction = 0
): DerivedCumulativeReturn {
  if (ctx.isBenchUnused) {
    return { rawReturn: 0, clampedReturn: 0 };
  }

  let raw = 0;
  for (const ev of events) {
    raw += eventDelta(ev, ctx);
  }
  const safeCap = Math.max(0.01, Math.abs(capLimit));
  const rawReturn = Number((raw - deduction).toFixed(4));
  const clampedReturn = Number(
    Math.max(-safeCap, Math.min(safeCap, rawReturn)).toFixed(4)
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
    const rawSource: EventSource = raw.source ?? "REAL";
    const extraMeta = {
      ...(raw.estimated !== undefined ? { estimated: raw.estimated } : {}),
      ...(raw.metadata !== undefined ? { metadata: raw.metadata } : {}),
    };
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
          source: rawSource,
          description: raw.description,
          ...extraMeta,
        });
        continue;
      }

      if (raw.kind === "SUB_IN" || raw.kind === "SUB_OUT") {
        if (raw.actorPlayerId === p.playerId) {
          result[p.playerId].push({
            id: `${raw.id}-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: raw.kind,
            source: rawSource,
            description:
              raw.description ??
              (raw.kind === "SUB_IN" ? "교체 투입" : "교체 아웃"),
            ...extraMeta,
          });
        }
        continue;
      }

      if (!onPitchAtMinute) continue;

      if (raw.kind === "TEAM_GOAL") {
        if (raw.teamSide === p.teamSide) {
          result[p.playerId].push({
            id: `${raw.id}-tgoal-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "TEAM_GOAL",
            source: rawSource,
            description: raw.description ?? "팀 득점 보너스",
            ...extraMeta,
          });
        }
        continue;
      }

      if (raw.kind === "TEAM_CONCEDED") {
        if (raw.teamSide === p.teamSide) {
          result[p.playerId].push({
            id: `${raw.id}-tconc-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "TEAM_CONCEDED",
            source: rawSource,
            description: raw.description ?? "팀 실점 반영",
            ...extraMeta,
          });
        }
        continue;
      }

      if (raw.kind === "GOAL") {
        if (raw.actorPlayerId === p.playerId) {
          result[p.playerId].push({
            id: `${raw.id}-scorer-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "GOAL",
            source: rawSource,
            goalContext: raw.goalContext ?? "OPENER",
            description: raw.description ?? "득점 성공",
            triggeredAt: raw.triggeredAt,
            ...extraMeta,
          });
        } else if (raw.teamSide === p.teamSide) {
          result[p.playerId].push({
            id: `${raw.id}-tgoal-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "TEAM_GOAL",
            source: "REAL",
            description: "팀 득점 보너스",
            ...extraMeta,
          });
        } else {
          result[p.playerId].push({
            id: `${raw.id}-tconc-${p.playerId}`,
            playerId: p.playerId,
            minute: raw.minute,
            type: "TEAM_CONCEDED",
            source: "REAL",
            description: "팀 실점 반영",
            ...extraMeta,
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
            source: rawSource,
            description:
              raw.kind === "CLEAN_SHEET_45"
                ? "전반 무실점 클린시트 보상"
                : "75분 무실점 클린시트 보상",
            ...extraMeta,
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
          source: rawSource,
          description: raw.description,
          triggeredAt: raw.triggeredAt,
          ...extraMeta,
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
  endMinute = 90,
  capLimit: number = RETURN_CLAMP_MAX
): PriceSeriesResult {
  const safeCap = Math.max(0.01, Math.abs(capLimit));
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
  const noisePlayerId =
    ctx.playerId ?? ctx.seedId ?? sortedEvents[0]?.playerId ?? "player";
  const noiseMatchId = ctx.matchId ?? "default";

  let cumulativeRaw = 0;
  const expectedE = ctx.expectedReturn ?? 0;
  const startMin =
    ctx.isStarter === false && ctx.subInMinute !== undefined
      ? Math.max(0, Math.round(ctx.subInMinute))
      : 0;
  const redCardEv = sortedEvents.find((e) => e.type === "RED_CARD");
  const endPitchMin = Math.min(
    ctx.subOutMinute !== undefined
      ? Math.max(0, Math.round(ctx.subOutMinute))
      : Infinity,
    redCardEv ? Math.max(0, Math.round(redCardEv.minute)) : Infinity
  );
  let onPitchMinutes = 0;
  const points: PricePoint[] = [];

  for (let m = 0; m <= targetEnd; m++) {
    const minEvents = eventsByMin.get(m) ?? [];
    let stepDelta = 0;
    for (const ev of minEvents) {
      stepDelta += eventDelta(ev, ctx);
    }
    cumulativeRaw += stepDelta;

    if (m > startMin && m <= endPitchMin) {
      onPitchMinutes += 1;
    }
    const deductionAtMinute = expectedE * (Math.min(90, onPitchMinutes) / 90);

    // Quiet-interval micro-noise strictly within ±0.15%, seeded deterministically by (playerId, matchId, minute)
    const quietNoise =
      m === 0 || minEvents.length > 0
        ? 0
        : (deterministicNoise(noisePlayerId, noiseMatchId, m) - 0.5) * 0.003; // [-0.0015, +0.0015]

    const rawAtMinute = Number(
      (cumulativeRaw - deductionAtMinute + quietNoise).toFixed(4)
    );
    const clampedAtMinute = Number(
      Math.max(-safeCap, Math.min(safeCap, rawAtMinute)).toFixed(4)
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
                source: primaryEv.source ?? "REAL",
              },
            }
          : {}),
      });
    }
  }

  const finalDeduction = expectedE * (Math.min(90, onPitchMinutes) / 90);
  const finalReturn = calculateCumulativeReturn(
    sortedEvents,
    ctx,
    safeCap,
    finalDeduction
  );
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

// ============================================================================
// Unified UI / Store Helpers (merged from legacy priceEngine module)
// Pure & time-independent.
// ============================================================================

export const EVENT_TYPE_META: Record<
  MatchEventType,
  {
    icon: string;
    shortTitle: string;
    defaultDescription: string;
    fill: string;
    stroke: string;
    ring: string;
    chipBg: string;
    chipText: string;
    chipBorder: string;
    badgeStyle: string;
  }
> = {
  GOAL: {
    icon: "⚽",
    shortTitle: "득점",
    defaultDescription: "결정적 슈팅 득점 성공",
    fill: "#00A878",
    stroke: "#fbbf24",
    ring: "rgba(0, 168, 120, 0.28)",
    chipBg: "bg-[#00A878]/10",
    chipText: "text-[#00A878]",
    chipBorder: "border-[#00A878]/30",
    badgeStyle: "bg-[#00A878]/10 text-[#00A878] border border-[#00A878]/25",
  },
  ASSIST: {
    icon: "🅰️",
    shortTitle: "도움",
    defaultDescription: "결정적 찬스 메이킹 도움 기록",
    fill: "#0284c7",
    stroke: "#bae6fd",
    ring: "rgba(2, 132, 199, 0.25)",
    chipBg: "bg-sky-50",
    chipText: "text-sky-700",
    chipBorder: "border-sky-300",
    badgeStyle: "bg-sky-50 text-sky-700 border border-sky-200",
  },
  SAVE: {
    icon: "🧤",
    shortTitle: "선방",
    defaultDescription: "결정적 실점 위기 차단 및 슈퍼세이브",
    fill: "#7c3aed",
    stroke: "#ddd6fe",
    ring: "rgba(124, 58, 237, 0.25)",
    chipBg: "bg-violet-50",
    chipText: "text-violet-700",
    chipBorder: "border-violet-300",
    badgeStyle: "bg-violet-50 text-violet-700 border border-violet-200",
  },
  YELLOW_CARD: {
    icon: "🟨",
    shortTitle: "경고",
    defaultDescription: "반칙으로 인한 옐로카드 경고",
    fill: "#d97706",
    stroke: "#fde68a",
    ring: "rgba(245, 158, 11, 0.25)",
    chipBg: "bg-amber-50",
    chipText: "text-amber-800",
    chipBorder: "border-amber-300",
    badgeStyle: "bg-amber-50 text-amber-800 border border-amber-200",
  },
  RED_CARD: {
    icon: "🟥",
    shortTitle: "퇴장",
    defaultDescription: "위험한 반칙으로 인한 퇴장 선언",
    fill: "#F07868",
    stroke: "#fecdd3",
    ring: "rgba(240, 120, 104, 0.28)",
    chipBg: "bg-[#F07868]/10",
    chipText: "text-[#F07868]",
    chipBorder: "border-[#F07868]/30",
    badgeStyle: "bg-[#F07868]/10 text-[#F07868] border border-[#F07868]/25",
  },
  CONCEDED: {
    icon: "🥅",
    shortTitle: "실점",
    defaultDescription: "상대 슈팅 실점 허용",
    fill: "#F07868",
    stroke: "#fecdd3",
    ring: "rgba(240, 120, 104, 0.28)",
    chipBg: "bg-[#F07868]/10",
    chipText: "text-[#F07868]",
    chipBorder: "border-[#F07868]/30",
    badgeStyle: "bg-[#F07868]/10 text-[#F07868] border border-[#F07868]/25",
  },
  DEFENSIVE_ACTION: {
    icon: "🛡️",
    shortTitle: "수비",
    defaultDescription: "결정적 태클로 실점 위기 차단",
    fill: "#0f766e",
    stroke: "#99f6e4",
    ring: "rgba(15, 118, 110, 0.25)",
    chipBg: "bg-teal-50",
    chipText: "text-teal-700",
    chipBorder: "border-teal-300",
    badgeStyle: "bg-teal-50 text-teal-700 border border-teal-200",
  },
  KEY_PLAY: {
    icon: "🎯",
    shortTitle: "기회 창출",
    defaultDescription: "골문을 위협한 유효슈팅",
    fill: "#0284c7",
    stroke: "#bae6fd",
    ring: "rgba(2, 132, 199, 0.25)",
    chipBg: "bg-sky-50",
    chipText: "text-sky-700",
    chipBorder: "border-sky-300",
    badgeStyle: "bg-sky-50 text-sky-700 border border-sky-200",
  },
  BIG_CHANCE_MISS: {
    icon: "😣",
    shortTitle: "찬스 미스",
    defaultDescription: "결정적 빅찬스 슈팅 무산",
    fill: "#d97706",
    stroke: "#fde68a",
    ring: "rgba(245, 158, 11, 0.25)",
    chipBg: "bg-amber-50",
    chipText: "text-amber-800",
    chipBorder: "border-amber-300",
    badgeStyle: "bg-amber-50 text-amber-800 border border-amber-200",
  },
};

export const POSITION_EVENT_WHITELIST: Record<PositionLine, MatchEventType[]> = {
  GK: ["SAVE", "CONCEDED"],
  DF: ["DEFENSIVE_ACTION", "GOAL", "ASSIST", "YELLOW_CARD", "RED_CARD"],
  MF: ["GOAL", "ASSIST", "KEY_PLAY", "YELLOW_CARD", "RED_CARD"],
  FW: ["GOAL", "ASSIST", "KEY_PLAY", "BIG_CHANCE_MISS", "YELLOW_CARD", "RED_CARD"],
};

const NEGATIVE_EVENT_TYPES: ReadonlySet<MatchEventType> = new Set([
  "YELLOW_CARD",
  "RED_CARD",
  "CONCEDED",
  "BIG_CHANCE_MISS",
]);

export function isNegativeEventType(type: MatchEventType): boolean {
  return NEGATIVE_EVENT_TYPES.has(type);
}

const POSITION_EVENT_DESCRIPTIONS: Record<
  PositionLine,
  Partial<Record<MatchEventType, string>>
> = {
  GK: { SAVE: "1대1 결정적 슈팅 선방", CONCEDED: "상대 슈팅 실점 허용" },
  DF: {
    DEFENSIVE_ACTION: "박스 안 결정적 태클로 슈팅 차단",
    GOAL: "세트피스 헤더 득점",
  },
  MF: { KEY_PLAY: "수비 라인을 허무는 결정적 킬패스" },
  FW: {
    KEY_PLAY: "골문 구석을 노린 유효슈팅",
    BIG_CHANCE_MISS: "골키퍼와 1대1 빅찬스 미스",
  },
};

export function sanitizeEventTypeForPosition(
  type: MatchEventType,
  position: string | undefined,
  impactPercent = 0
): MatchEventType {
  const line = getPositionLine(position);
  if (POSITION_EVENT_WHITELIST[line].includes(type)) return type;
  const negative = impactPercent < 0 || isNegativeEventType(type);
  if (line === "GK") return negative ? "CONCEDED" : "SAVE";
  if (line === "DF") return negative ? "YELLOW_CARD" : "DEFENSIVE_ACTION";
  if (line === "FW") return negative ? "BIG_CHANCE_MISS" : "KEY_PLAY";
  return negative ? "YELLOW_CARD" : "KEY_PLAY";
}

export function sanitizeEventForPosition(
  ev: MatchEvent,
  position: string | undefined
): MatchEvent {
  const type = sanitizeEventTypeForPosition(
    ev.type,
    position,
    ev.priceImpactPercent
  );
  if (type === ev.type) return ev;
  const line = getPositionLine(position);
  return {
    ...ev,
    id: ev.id.replace(ev.type, type),
    type,
    description:
      POSITION_EVENT_DESCRIPTIONS[line][type] ??
      EVENT_TYPE_META[type].defaultDescription,
  };
}

export const roundToTen = (val: number): number => Math.round(val / 10) * 10;

export const clampToPriceLimit = (price: number, basePrice: number): number => {
  const floorPrice = roundToTen(basePrice * (1 - WEIGHTS.CAP_LIMIT));
  const capPrice = roundToTen(basePrice * (1 + WEIGHTS.CAP_LIMIT));
  const rounded = roundToTen(price);
  return Math.max(floorPrice, Math.min(capPrice, rounded));
};

export function calculateChangePercentFromOpen(
  currentPrice: number,
  openPrice: number
): number {
  if (!Number.isFinite(openPrice) || openPrice <= 0) return 0;
  return Number((((currentPrice - openPrice) / openPrice) * 100).toFixed(2));
}

export function calculateDiffFromOpen(
  currentPrice: number,
  openPrice: number
): number {
  return roundToTen(currentPrice) - roundToTen(openPrice);
}

export function formatMinuteLabel(minute: number): string {
  const safeMin = Math.max(0, Math.round(minute));
  if (safeMin > 90) {
    return `90+${safeMin - 90}'`;
  }
  return `${safeMin}'`;
}

export function seededNoise(seedStr: string, index: number): number {
  let h = 2166136261;
  const str = `${seedStr}-${index}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export function normalizeMatchEventType(
  rawType?: ChartEventType | string,
  impactPercent = 0,
  position?: string
): MatchEventType {
  let resolved: MatchEventType;
  if (
    rawType === "GOAL" ||
    rawType === "ASSIST" ||
    rawType === "YELLOW_CARD" ||
    rawType === "RED_CARD" ||
    rawType === "SAVE" ||
    rawType === "CONCEDED" ||
    rawType === "DEFENSIVE_ACTION" ||
    rawType === "KEY_PLAY" ||
    rawType === "BIG_CHANCE_MISS"
  ) {
    resolved = rawType;
  } else {
    resolved = impactPercent < 0 ? "YELLOW_CARD" : "ASSIST";
  }
  return position
    ? sanitizeEventTypeForPosition(resolved, position, impactPercent)
    : resolved;
}

export function cleanEventDescription(
  rawLabel: string | undefined,
  type: MatchEventType
): string {
  if (!rawLabel) return EVENT_TYPE_META[type].defaultDescription;
  const stripped = rawLabel
    .replace(/\([+-]?\d+(\.\d+)?%\)\s*$/g, "")
    .replace(/^[⚽🅰️🧤🟨🟥🔄🧱⚡🎯🔥✨🥅🛡️😣]+\s*/u, "")
    .trim();
  return stripped || EVENT_TYPE_META[type].defaultDescription;
}

export function toChartEventMarker(ev: MatchEvent): ChartEventMarker {
  const meta = EVENT_TYPE_META[ev.type] ?? EVENT_TYPE_META.GOAL;
  const sign = ev.priceImpactPercent >= 0 ? "+" : "";
  return {
    type: ev.type,
    label: `${meta.icon} ${ev.description} (${sign}${ev.priceImpactPercent.toFixed(1)}%)`,
    impactPercent: Number(ev.priceImpactPercent.toFixed(1)),
    source: ev.source ?? "REAL",
  };
}

export function normalizeMatchEvents(
  events: MatchEvent[],
  playerId: string,
  position?: string
): MatchEvent[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  const byMinute = new Map<number, MatchEvent>();
  for (const ev of events) {
    if (!ev || typeof ev.minute !== "number" || ev.minute <= 0) continue;
    const min = Math.max(1, Math.min(95, Math.round(ev.minute)));
    const type = normalizeMatchEventType(ev.type, ev.priceImpactPercent, position);
    const impact = Number((ev.priceImpactPercent ?? 0).toFixed(1));
    const desc = cleanEventDescription(ev.description, type);
    const normalized: MatchEvent = {
      id: ev.id || `ev-${playerId}-${min}-${type}`,
      playerId,
      minute: min,
      type,
      description: desc,
      priceImpactPercent: impact,
      source: ev.source ?? "REAL",
      ...(ev.estimated !== undefined ? { estimated: ev.estimated } : {}),
      ...(ev.metadata !== undefined ? { metadata: ev.metadata } : {}),
    };
    byMinute.set(
      min,
      position ? sanitizeEventForPosition(normalized, position) : normalized
    );
  }
  return Array.from(byMinute.values()).sort((a, b) => a.minute - b.minute);
}

export function extractInitialMatchEvents(
  player: Pick<
    Player,
    | "id"
    | "position"
    | "openPrice"
    | "basePrice"
    | "initialPrice"
    | "currentPrice"
    | "events"
    | "priceHistory"
    | "lastEvent"
  >,
  matchStatus?: MatchStatus
): MatchEvent[] {
  if (matchStatus === "UPCOMING") {
    return [];
  }
  if (Array.isArray(player.events) && player.events.length > 0) {
    return normalizeMatchEvents(player.events, player.id, player.position);
  }

  const extracted: MatchEvent[] = [];
  const openPrice = roundToTen(
    player.openPrice ?? player.basePrice ?? player.initialPrice ?? 10000
  );

  for (const pt of player.priceHistory ?? []) {
    if (pt.event && typeof pt.minute === "number" && pt.minute > 0) {
      const min = Math.max(1, Math.min(95, Math.round(pt.minute)));
      const type = normalizeMatchEventType(
        pt.event.type,
        pt.event.impactPercent,
        player.position
      );
      extracted.push({
        id: `ev-${player.id}-${min}-${type}`,
        playerId: player.id,
        minute: min,
        type,
        description: cleanEventDescription(pt.event.label, type),
        priceImpactPercent: Number((pt.event.impactPercent ?? 0).toFixed(1)),
      });
    }
  }

  if (
    extracted.length === 0 &&
    player.lastEvent &&
    player.lastEvent.minute > 0 &&
    player.currentPrice !== openPrice
  ) {
    const min = Math.max(1, Math.min(95, Math.round(player.lastEvent.minute)));
    const rawImpact = calculateChangePercentFromOpen(
      player.currentPrice,
      openPrice
    );
    const line = getPositionLine(player.position);
    const fallbackPositive: MatchEventType =
      line === "GK" ? "SAVE" : line === "DF" ? "DEFENSIVE_ACTION" : "ASSIST";
    const type = sanitizeEventTypeForPosition(
      rawImpact < 0 ? "YELLOW_CARD" : fallbackPositive,
      player.position,
      rawImpact
    );
    extracted.push({
      id: `ev-${player.id}-${min}-${type}`,
      playerId: player.id,
      minute: min,
      type,
      description: cleanEventDescription(player.lastEvent.text, type),
      priceImpactPercent: Number(rawImpact.toFixed(1)),
    });
  }

  return normalizeMatchEvents(extracted, player.id, player.position);
}

interface MinuteBar {
  minute: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  matchEvent?: MatchEvent;
}

function buildMinuteBarsFromEvents(params: {
  playerId: string;
  openPrice: number;
  basePrice: number;
  events: MatchEvent[];
  endMinute: number;
}): MinuteBar[] {
  const { playerId, events } = params;
  const basePrice = roundToTen(params.basePrice || params.openPrice || 10000);
  const openPrice = clampToPriceLimit(params.openPrice || basePrice, basePrice);
  const normalizedEvents = normalizeMatchEvents(events, playerId);
  const maxEventMin =
    normalizedEvents.length > 0
      ? normalizedEvents[normalizedEvents.length - 1].minute
      : 0;
  const endMin = Math.max(
    0,
    Math.min(95, Math.max(params.endMinute, maxEventMin))
  );

  const eventByMin = new Map<number, MatchEvent>();
  for (const ev of normalizedEvents) {
    eventByMin.set(ev.minute, ev);
  }

  const tierCfg = getTierConfig(basePrice);
  const bars: MinuteBar[] = [
    {
      minute: 0,
      open: openPrice,
      high: openPrice,
      low: openPrice,
      close: openPrice,
      volume: 60,
    },
  ];

  let prevClose = openPrice;

  for (let m = 1; m <= endMin; m++) {
    const ev = eventByMin.get(m);
    const noise = seededNoise(`${playerId}-min-tick`, m);
    const volNoise = seededNoise(`${playerId}-min-vol`, m);

    let close = prevClose;
    if (ev) {
      const impactRatio = ev.priceImpactPercent / 100;
      close = clampToPriceLimit(prevClose * (1 + impactRatio), basePrice);
      if (ev.priceImpactPercent > 0 && close <= prevClose) {
        close = clampToPriceLimit(prevClose + 20, basePrice);
      } else if (ev.priceImpactPercent < 0 && close >= prevClose) {
        close = clampToPriceLimit(prevClose - 20, basePrice);
      }
    } else if (m % 2 === 0) {
      const microRate = (noise - 0.5) * 0.0025;
      close = clampToPriceLimit(prevClose * (1 + microRate), basePrice);
    }

    const wickNoiseUp = seededNoise(`${playerId}-min-wick-up`, m);
    const wickNoiseDown = seededNoise(`${playerId}-min-wick-down`, m);
    const wickScale = ev ? 0.008 : 0.0035;
    const wickUp = roundToTen(
      basePrice * (0.001 + wickNoiseUp * wickScale) * tierCfg.volatilityMultiplier
    );
    const wickDown = roundToTen(
      basePrice *
        (0.001 + wickNoiseDown * wickScale) *
        tierCfg.volatilityMultiplier
    );

    const high = clampToPriceLimit(
      Math.max(prevClose, close) + wickUp,
      basePrice
    );
    const low = clampToPriceLimit(
      Math.min(prevClose, close) - wickDown,
      basePrice
    );
    const swingRatio = Math.abs(close - prevClose) / Math.max(1, basePrice);
    const baseMinuteVol = ev ? 420 : 28;
    const volume = Math.max(
      12,
      Math.round(baseMinuteVol + swingRatio * 2400 + volNoise * 35)
    );

    bars.push({
      minute: m,
      open: prevClose,
      high,
      low,
      close,
      volume,
      ...(ev ? { matchEvent: ev } : {}),
    });

    prevClose = close;
  }

  return bars;
}

export interface DerivedPlayerMarketData {
  openPrice: number;
  currentPrice: number;
  previousPrice: number;
  closePrice?: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  events: MatchEvent[];
  priceHistory: PricePoint[];
}

export function derivePlayerMarketData(params: {
  playerId: string;
  openPrice: number;
  basePrice?: number;
  events: MatchEvent[];
  currentMinute?: number;
  matchStatus?: MatchStatus;
}): DerivedPlayerMarketData {
  const basePrice = roundToTen(params.basePrice ?? params.openPrice ?? 10000);
  const openPrice = clampToPriceLimit(params.openPrice ?? basePrice, basePrice);
  const status: MatchStatus = params.matchStatus ?? "LIVE";
  const events =
    status === "UPCOMING"
      ? []
      : normalizeMatchEvents(params.events, params.playerId);
  const maxEventMin =
    events.length > 0 ? events[events.length - 1].minute : 0;

  const endMinute =
    status === "UPCOMING"
      ? 0
      : status === "FT"
      ? Math.max(90, maxEventMin)
      : Math.max(
          1,
          Math.min(95, Math.max(params.currentMinute ?? 60, maxEventMin))
        );

  const bars = buildMinuteBarsFromEvents({
    playerId: params.playerId,
    openPrice,
    basePrice,
    events,
    endMinute,
  });

  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : lastBar;
  const currentPrice = lastBar.close;
  const previousPrice = prevBar.close;

  let highPrice = openPrice;
  let lowPrice = openPrice;
  let highMin = 0;
  let lowMin = 0;
  let totalVolume = 0;

  for (const b of bars) {
    if (b.high > highPrice) {
      highPrice = b.high;
      highMin = b.minute;
    }
    if (b.low < lowPrice) {
      lowPrice = b.low;
      lowMin = b.minute;
    }
    totalVolume += b.volume;
  }

  const selectedMinutes = new Set<number>([0, endMinute, highMin, lowMin]);
  for (let m = 0; m <= endMinute; m += 3) {
    selectedMinutes.add(m);
  }
  for (let m = 0; m <= endMinute; m += 15) {
    selectedMinutes.add(m);
  }
  for (const ev of events) {
    selectedMinutes.add(ev.minute);
  }

  const sortedMinutes = Array.from(selectedMinutes)
    .filter((m) => m >= 0 && m <= endMinute)
    .sort((a, b) => a - b);

  const priceHistory: PricePoint[] = sortedMinutes.map((m) => {
    const bar = bars[m] ?? bars[bars.length - 1];
    return {
      minute: m,
      timeLabel: formatMinuteLabel(m),
      price: bar.close,
      changePercentFromOpen: calculateChangePercentFromOpen(
        bar.close,
        openPrice
      ),
      ...(bar.matchEvent ? { event: toChartEventMarker(bar.matchEvent) } : {}),
    };
  });

  return {
    openPrice,
    currentPrice,
    previousPrice,
    ...(status === "FT" ? { closePrice: currentPrice } : {}),
    highPrice,
    lowPrice,
    volume: totalVolume,
    events,
    priceHistory,
  };
}

export function deriveCandlesFromEvents(params: {
  playerId: string;
  openPrice: number;
  basePrice?: number;
  events: MatchEvent[];
  timeframe: CandleTimeframe;
  matchStatus?: MatchStatus;
  currentMinute?: number;
}): CandleData[] {
  const basePrice = roundToTen(params.basePrice ?? params.openPrice ?? 10000);
  const openPrice = clampToPriceLimit(params.openPrice ?? basePrice, basePrice);
  const status: MatchStatus = params.matchStatus ?? "LIVE";
  const events =
    status === "UPCOMING"
      ? []
      : normalizeMatchEvents(params.events, params.playerId);

  if (status === "UPCOMING") {
    return [
      {
        index: 0,
        minute: 0,
        label: "0'",
        open: openPrice,
        high: openPrice,
        low: openPrice,
        close: openPrice,
        volume: 0,
      },
    ];
  }

  const derived = derivePlayerMarketData({
    playerId: params.playerId,
    openPrice,
    basePrice,
    events,
    currentMinute: params.currentMinute,
    matchStatus: status,
  });

  const finalClose = derived.currentPrice;
  const maxEventMin =
    events.length > 0 ? events[events.length - 1].minute : 0;
  const endMin =
    status === "FT"
      ? Math.max(90, maxEventMin)
      : Math.max(
          1,
          Math.min(95, Math.max(params.currentMinute ?? 60, maxEventMin))
        );

  if (params.timeframe === "1D") {
    const count = 24;
    const candles: CandleData[] = [];
    let prevClose = clampToPriceLimit(
      basePrice * (0.92 + seededNoise(params.playerId, 701) * 0.08),
      basePrice
    );

    for (let i = 0; i < count; i++) {
      const daysAgo = count - 1 - i;
      const label = daysAgo === 0 ? "오늘" : `D-${daysAgo}`;

      if (i === count - 1) {
        const latestEvent =
          events.length > 0 ? events[events.length - 1] : undefined;
        candles.push({
          index: i,
          minute: endMin,
          label,
          open: openPrice,
          high: derived.highPrice,
          low: derived.lowPrice,
          close: finalClose,
          volume: derived.volume,
          ...(latestEvent
            ? {
                event: toChartEventMarker(latestEvent),
                matchEvent: latestEvent,
              }
            : {}),
        });
        break;
      }

      const n1 = seededNoise(`${params.playerId}-1d-o`, i);
      const n2 = seededNoise(`${params.playerId}-1d-h`, i);
      const n3 = seededNoise(`${params.playerId}-1d-l`, i);

      const open = prevClose;
      const close =
        i === count - 2
          ? openPrice
          : clampToPriceLimit(
              open +
                ((openPrice - open) / Math.max(1, count - 1 - i)) * 0.6 +
                (n1 - 0.48) * basePrice * 0.035,
              basePrice
            );

      const bodyMax = Math.max(open, close);
      const bodyMin = Math.min(open, close);
      const wickUp = roundToTen((0.004 + n2 * 0.018) * basePrice);
      const wickDown = roundToTen((0.004 + n3 * 0.018) * basePrice);
      const high = clampToPriceLimit(bodyMax + wickUp, basePrice);
      const low = clampToPriceLimit(bodyMin - wickDown, basePrice);
      const volume = Math.max(60, Math.round(180 + n2 * 260));

      candles.push({
        index: i,
        label,
        open,
        high,
        low,
        close,
        volume,
      });
      prevClose = close;
    }
    return candles;
  }

  const bars = buildMinuteBarsFromEvents({
    playerId: params.playerId,
    openPrice,
    basePrice,
    events,
    endMinute: endMin,
  });

  if (endMin === 0) {
    return [
      {
        index: 0,
        minute: 0,
        label: "0'",
        open: openPrice,
        high: openPrice,
        low: openPrice,
        close: openPrice,
        volume: bars[0].volume,
      },
    ];
  }

  const step = params.timeframe === "1M" ? 1 : params.timeframe === "3M" ? 3 : 6;
  const candles: CandleData[] = [];
  let idx = 0;

  candles.push({
    index: idx++,
    minute: 0,
    label: "0'",
    open: openPrice,
    high: openPrice,
    low: openPrice,
    close: openPrice,
    volume: bars[0].volume,
  });

  for (let mStart = 1; mStart <= endMin; mStart += step) {
    const mEnd = Math.min(endMin, mStart + step - 1);
    const slice = bars.slice(mStart, mEnd + 1);
    if (slice.length === 0) break;

    const open = slice[0].open;
    const close = slice[slice.length - 1].close;
    let high = Math.max(open, close);
    let low = Math.min(open, close);
    let volume = 0;
    let bucketMatchEvent: MatchEvent | undefined;

    for (const b of slice) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += b.volume;
      if (b.matchEvent) {
        bucketMatchEvent = b.matchEvent;
      }
    }

    const displayMin = bucketMatchEvent ? bucketMatchEvent.minute : mEnd;
    const label =
      displayMin === 45
        ? "45'(HT)"
        : displayMin === 90
        ? "90'(FT)"
        : formatMinuteLabel(displayMin);

    candles.push({
      index: idx++,
      minute: displayMin,
      label,
      open,
      high,
      low,
      close,
      volume,
      ...(bucketMatchEvent
        ? {
            event: toChartEventMarker(bucketMatchEvent),
            matchEvent: bucketMatchEvent,
          }
        : {}),
    });
  }

  return candles;
}

export function resolvePlayerMatchContext(
  player: Pick<Player, "id" | "matchId" | "lastEvent" | "priceHistory" | "events">,
  matches: Match[]
): { status: MatchStatus; minute: number; match?: Match } {
  const direct = matches.find((m) => m.id === player.matchId);
  const status: MatchStatus = !direct
    ? "LIVE"
    : direct.status === "LIVE" || direct.rawStatus === "IN_PLAY"
    ? "LIVE"
    : direct.status === "FT" || direct.rawStatus === "FINISHED"
    ? "FT"
    : "UPCOMING";

  const maxEvMin =
    player.events && player.events.length > 0
      ? Math.max(...player.events.map((e) => e.minute))
      : player.priceHistory && player.priceHistory.length > 0
      ? Math.max(...player.priceHistory.map((p) => p.minute ?? 0))
      : 0;

  const minute =
    status === "FT"
      ? Math.max(90, maxEvMin)
      : status === "UPCOMING"
      ? 0
      : Math.max(1, direct?.minute ?? player.lastEvent?.minute ?? maxEvMin ?? 60);

  return { status, minute, match: direct };
}

export interface LastMatchReviewData {
  matchLabel: string;
  openPrice: number;
  basePrice: number;
  events: MatchEvent[];
  marketData: DerivedPlayerMarketData;
}

const FALLBACK_OPPONENTS = [
  "아스날",
  "리버풀",
  "맨시티",
  "첼시",
  "토트넘",
  "레알 마드리드",
  "바르셀로나",
  "바이에른",
];

export function resolveLastMatchReview(
  player: Player,
  matches: Match[]
): LastMatchReviewData {
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice ?? 10000
  );

  const ftMatch = matches.find(
    (m) =>
      (m.status === "FT" || m.rawStatus === "FINISHED") &&
      (m.homeTeam.id === player.teamId ||
        m.awayTeam.id === player.teamId ||
        m.homeTeam.shortName === player.teamShort ||
        m.awayTeam.shortName === player.teamShort)
  );

  let matchLabel: string;
  if (ftMatch) {
    const isHome =
      ftMatch.homeTeam.id === player.teamId ||
      ftMatch.homeTeam.shortName === player.teamShort;
    const opp = isHome ? ftMatch.awayTeam.name : ftMatch.homeTeam.name;
    const score = isHome
      ? `${ftMatch.homeTeam.score ?? 2}:${ftMatch.awayTeam.score ?? 1}`
      : `${ftMatch.awayTeam.score ?? 2}:${ftMatch.homeTeam.score ?? 1}`;
    matchLabel = `직전 경기 종료 · vs ${opp} ${score}`;
  } else {
    const oppIdx = Math.floor(
      seededNoise(`${player.id}-last-opp`, 1) * FALLBACK_OPPONENTS.length
    );
    const opp = FALLBACK_OPPONENTS[oppIdx] ?? "아스날";
    const s1 = 1 + Math.floor(seededNoise(`${player.id}-last-s1`, 2) * 3);
    const s2 = Math.floor(seededNoise(`${player.id}-last-s2`, 3) * 2);
    matchLabel = `직전 경기 종료 · vs ${opp} ${s1}:${s2}`;
  }

  const nOpen = seededNoise(`${player.id}-last-open`, 5);
  const openPrice = clampToPriceLimit(
    basePrice * (0.94 + nOpen * 0.06),
    basePrice
  );

  const line = getPositionLine(player.position);

  const min1 = 18 + Math.floor(seededNoise(`${player.id}-lm1`, 11) * 18);
  const min2 = 46 + Math.floor(seededNoise(`${player.id}-lm2`, 12) * 16);
  const min3 = 68 + Math.floor(seededNoise(`${player.id}-lm3`, 13) * 16);

  const rawEvents: MatchEvent[] =
    line === "GK"
      ? [
          {
            id: `ft-${player.id}-${min1}-SAVE`,
            playerId: player.id,
            minute: min1,
            type: "SAVE",
            description: "1대1 결정적 실점 위기 슈퍼세이브",
            priceImpactPercent: Number(
              (3.8 + seededNoise(`${player.id}-li1`, 21) * 2.5).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min2}-CONCEDED`,
            playerId: player.id,
            minute: min2,
            type: "CONCEDED",
            description: "박스 안 근거리 슈팅 실점 허용",
            priceImpactPercent: Number(
              (-(2.2 + seededNoise(`${player.id}-li2`, 22) * 1.5)).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min3}-SAVE`,
            playerId: player.id,
            minute: min3,
            type: "SAVE",
            description: "후반 막판 결정적 공중볼 처리 및 선방",
            priceImpactPercent: Number(
              (4.2 + seededNoise(`${player.id}-li3`, 23) * 2.8).toFixed(1)
            ),
          },
        ]
      : line === "DF"
      ? [
          {
            id: `ft-${player.id}-${min1}-DEFENSIVE_ACTION`,
            playerId: player.id,
            minute: min1,
            type: "DEFENSIVE_ACTION",
            description: "상대 에이스 1대1 돌파 저지 및 태클",
            priceImpactPercent: Number(
              (3.6 + seededNoise(`${player.id}-li1`, 21) * 2.4).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min2}-YC`,
            playerId: player.id,
            minute: min2,
            type: "YELLOW_CARD",
            description: "역습 저지 반칙으로 옐로카드",
            priceImpactPercent: Number(
              (-(2.2 + seededNoise(`${player.id}-li2`, 22) * 1.5)).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min3}-DEFENSIVE_ACTION`,
            playerId: player.id,
            minute: min3,
            type: "DEFENSIVE_ACTION",
            description: "후반 막판 골라인 앞 결정적 클리어",
            priceImpactPercent: Number(
              (4.0 + seededNoise(`${player.id}-li3`, 23) * 2.6).toFixed(1)
            ),
          },
        ]
      : line === "FW"
      ? [
          {
            id: `ft-${player.id}-${min1}-GOAL`,
            playerId: player.id,
            minute: min1,
            type: "GOAL",
            description: "박스 안 침착한 오른발 슈팅 득점",
            priceImpactPercent: Number(
              (7.2 + seededNoise(`${player.id}-li1`, 31) * 3.8).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min2}-BIG_CHANCE_MISS`,
            playerId: player.id,
            minute: min2,
            type: "BIG_CHANCE_MISS",
            description: "골키퍼와 1대1 빅찬스 슈팅 무산",
            priceImpactPercent: Number(
              (-(2.1 + seededNoise(`${player.id}-li2`, 32) * 1.4)).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min3}-ASSIST`,
            playerId: player.id,
            minute: min3,
            type: "ASSIST",
            description: "측면 돌파 후 정확한 컷백 어시스트",
            priceImpactPercent: Number(
              (4.6 + seededNoise(`${player.id}-li3`, 33) * 2.6).toFixed(1)
            ),
          },
        ]
      : [
          {
            id: `ft-${player.id}-${min1}-GOAL`,
            playerId: player.id,
            minute: min1,
            type: "GOAL",
            description: "아크 정면 날카로운 중거리 슈팅 득점",
            priceImpactPercent: Number(
              (6.8 + seededNoise(`${player.id}-li1`, 31) * 3.5).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min2}-YC`,
            playerId: player.id,
            minute: min2,
            type: "YELLOW_CARD",
            description: "중원 경합 중 거친 태클 경고",
            priceImpactPercent: Number(
              (-(2.4 + seededNoise(`${player.id}-li2`, 32) * 1.4)).toFixed(1)
            ),
          },
          {
            id: `ft-${player.id}-${min3}-KEY_PLAY`,
            playerId: player.id,
            minute: min3,
            type: "KEY_PLAY",
            description: "수비 라인을 허무는 결정적 킬패스",
            priceImpactPercent: Number(
              (4.1 + seededNoise(`${player.id}-li3`, 33) * 2.4).toFixed(1)
            ),
          },
        ];

  const events = normalizeMatchEvents(
    rawEvents,
    `${player.id}-last-ft`,
    player.position
  );
  const marketData = derivePlayerMarketData({
    playerId: `${player.id}-last-ft`,
    openPrice,
    basePrice,
    events,
    currentMinute: 90,
    matchStatus: "FT",
  });

  return {
    matchLabel,
    openPrice,
    basePrice,
    events,
    marketData,
  };
}
