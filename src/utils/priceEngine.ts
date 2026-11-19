import {
  CandleData,
  CandleTimeframe,
  ChartEventMarker,
  ChartEventType,
  Match,
  MatchEvent,
  MatchEventType,
  MatchStatus,
  Player,
  PositionLine,
  PricePoint,
  getPositionLine,
} from "@/types";
import { getTierConfig } from "@/utils/tier";
export {
  CIRCUIT_BREAKER_MS,
  RETURN_CLAMP_MIN,
  RETURN_CLAMP_MAX,
  eventDelta,
  calculateCumulativeReturn,
  deriveStatsFromEvents,
  fanOutTeamEventsToPlayers,
  buildPriceSeries,
  isCircuitBreakerActive,
  getCircuitBreakerRemainingSec,
} from "@/lib/priceEngine";
export type {
  GoalContext,
  PlayerEventType,
  PlayerEvent,
  PlayerContext,
  MatchParticipant,
  TeamMatchRawEvent,
  DerivedCumulativeReturn,
  DerivedPlayerStats,
  PriceSeriesResult,
} from "@/lib/priceEngine";

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

/**
 * Event kinds each position line may receive. Goalkeeper-only kinds (`SAVE`,
 * `CONCEDED`) never reach outfield players; `DEFENSIVE_ACTION` is defender-only.
 */
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

/** Position-accurate default descriptions used when an event kind is remapped. */
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
  FW: { KEY_PLAY: "골문 구석을 노린 유효슈팅", BIG_CHANCE_MISS: "골키퍼와 1대1 빅찬스 미스" },
};

/**
 * Map an event kind onto the position whitelist. Disallowed kinds fall back to the
 * line's primary positive or negative kind, matching the sign of the price impact.
 */
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

/**
 * Enforce `POSITION_EVENT_WHITELIST` on one event, replacing the description with a
 * position-accurate one whenever the kind changes.
 */
export function sanitizeEventForPosition(
  ev: MatchEvent,
  position: string | undefined
): MatchEvent {
  const type = sanitizeEventTypeForPosition(ev.type, position, ev.priceImpactPercent);
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

/**
 * Round any price or point value to the nearest 10 integer unit.
 */
export const roundToTen = (val: number): number => Math.round(val / 10) * 10;

/**
 * Clamp price strictly within [basePrice * 0.7, basePrice * 1.3] and round to 10.
 */
export const clampToPriceLimit = (price: number, basePrice: number): number => {
  const floorPrice = roundToTen(basePrice * 0.7);
  const capPrice = roundToTen(basePrice * 1.3);
  const rounded = roundToTen(price);
  return Math.max(floorPrice, Math.min(capPrice, rounded));
};

/**
 * Unified percentage change formula against openPrice:
 * ((currentPrice - openPrice) / openPrice) * 100
 */
export function calculateChangePercentFromOpen(
  currentPrice: number,
  openPrice: number
): number {
  if (!Number.isFinite(openPrice) || openPrice <= 0) return 0;
  return Number((((currentPrice - openPrice) / openPrice) * 100).toFixed(2));
}

/**
 * Unified absolute point difference against openPrice.
 */
export function calculateDiffFromOpen(
  currentPrice: number,
  openPrice: number
): number {
  return roundToTen(currentPrice) - roundToTen(openPrice);
}

/**
 * Format match minute (0..95) into display label ("0'", "45'", "90+2'").
 */
export function formatMinuteLabel(minute: number): string {
  const safeMin = Math.max(0, Math.round(minute));
  if (safeMin > 90) {
    return `90+${safeMin - 90}'`;
  }
  return `${safeMin}'`;
}

/**
 * Deterministic hash-based noise in [0, 1) seeded by string + index.
 */
export function seededNoise(seedStr: string, index: number): number {
  let h = 2166136261;
  const str = `${seedStr}-${index}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Normalize any ChartEventType or raw string into strict MatchEventType,
 * optionally enforcing the player's position whitelist.
 */
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

/**
 * Strip leading emoji and trailing "(+X.X%)" from a legacy ChartEventMarker label
 * to obtain a clean event description.
 */
export function cleanEventDescription(
  rawLabel: string | undefined,
  type: MatchEventType
): string {
  if (!rawLabel) return EVENT_TYPE_META[type].defaultDescription;
  const stripped = rawLabel
    .replace(/\([+-]?\d+(\.\d+)?%\)\s*$/g, "")
    .replace(/^[⚽🅰️🧤🟨🟥🔄🧱⚡🎯🔥✨]+\s*/u, "")
    .trim();
  return stripped || EVENT_TYPE_META[type].defaultDescription;
}

/**
 * Convert a canonical MatchEvent into a ChartEventMarker for chart pin rendering.
 */
export function toChartEventMarker(ev: MatchEvent): ChartEventMarker {
  const meta = EVENT_TYPE_META[ev.type] ?? EVENT_TYPE_META.GOAL;
  const sign = ev.priceImpactPercent >= 0 ? "+" : "";
  return {
    type: ev.type,
    label: `${meta.icon} ${ev.description} (${sign}${ev.priceImpactPercent.toFixed(1)}%)`,
    impactPercent: Number(ev.priceImpactPercent.toFixed(1)),
  };
}

/**
 * Sort and deduplicate MatchEvent[] by minute ascending (keeping latest event per minute).
 * When `position` is supplied, every event is strictly sanitized against POSITION_EVENT_WHITELIST.
 */
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
    };
    byMinute.set(min, position ? sanitizeEventForPosition(normalized, position) : normalized);
  }
  return Array.from(byMinute.values()).sort((a, b) => a.minute - b.minute);
}

/**
 * Extract canonical MatchEvent[] from a player seed or persisted state.
 */
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

  // If no explicit event marker was in priceHistory but the player has a live/FT lastEvent at minute > 0,
  // synthesize a canonical event so the timeline and price engine remain unified.
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

/**
 * Core pure generator: builds the minute-by-minute (0..endMinute) price & volume bars
 * exclusively from (playerId, openPrice, basePrice, events, endMinute).
 */
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
  const endMin = Math.max(0, Math.min(95, Math.max(params.endMinute, maxEventMin)));

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
      // Quiet-interval micro-noise reduced to 1/3 (±0.15% max) so event jumps stand out clearly
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
      basePrice * (0.001 + wickNoiseDown * wickScale) * tierCfg.volatilityMultiplier
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

/**
 * Pure function that derives `PricePoint[]` (0~90m timeline) and unified daily metrics
 * (`openPrice`, `currentPrice`, `highPrice`, `lowPrice`, `volume`) solely from `openPrice` and `events`.
 */
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
      : Math.max(1, Math.min(95, Math.max(params.currentMinute ?? 60, maxEventMin)));

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

  // Select key minutes for PricePoint[] (0', 3-minute ticks, 15-minute anchors, all event minutes, high/low minutes, and endMinute)
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

/**
 * Pure function that derives `CandleData[]` directly from `openPrice` and `events: MatchEvent[]`.
 * Ensures 100% alignment of open, close, high, low, volume, and event pins (e.g. 27' Goal)
 * with `derivePlayerMarketData`.
 */
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
      : Math.max(1, Math.min(95, Math.max(params.currentMinute ?? 60, maxEventMin)));

  if (params.timeframe === "1D") {
    const count = 24;
    const candles: CandleData[] = [];
    const now = new Date();
    let prevClose = clampToPriceLimit(
      basePrice * (0.92 + seededNoise(params.playerId, 701) * 0.08),
      basePrice
    );

    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (count - 1 - i));
      const label = `${d.getMonth() + 1}/${d.getDate()}`;

      if (i === count - 1) {
        // Today's daily candle strictly uses the unified SSOT metrics
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
      const volume = Math.max(
        60,
        Math.round(180 + n2 * 260)
      );

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

  // Match timeline candles: 1M (step=1m), 3M (step=3m), 15M (step=6m)
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

  // First candle at 0' kickoff
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

    // If a MatchEvent occurred in this bucket (e.g. 27' Goal), pin the exact event minute on the candle
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

/**
 * Helper to resolve a player's match status and current minute from the store's matches array.
 */
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

/**
 * Derive deterministic 90' FT review data for a player's previous completed match.
 * Used when a player's upcoming match is in PRE state so users can inspect last match form.
 */
export function resolveLastMatchReview(
  player: Player,
  matches: Match[]
): LastMatchReviewData {
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice ?? 10000
  );

  // Find a completed (FT) match involving this player's team if available
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
