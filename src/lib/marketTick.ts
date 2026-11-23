import {
  getPositionLine,
  type MatchEvent,
  type MatchEventType,
  type Position,
  type PositionLine,
} from "../types/index.ts";
import { normalizeMatchEvents } from "./priceEngine.ts";

/**
 * Sliding window limit for synthetic (`source: "SIMULATED"`) tick events per player.
 * Prevents unbounded event compounding across minute wrap-arounds and long sessions
 * without modifying v2.5 economic engine constants (`WEIGHTS`, `RATES`).
 */
export const MAX_SIMULATED_EVENTS_PER_PLAYER = 3;

/**
 * Soft equilibrium band for cumulative `SIMULATED` tick drift (`±8.5%`).
 * Real match events (`source: "REAL"`) remain completely unbounded up to `±WEIGHTS.CAP_LIMIT`.
 */
export const SIMULATED_NET_IMPACT_MAX_PCT = 8.5;
export const SIMULATED_NET_IMPACT_MIN_PCT = -8.5;

/**
 * Per-player probability of emitting a synthetic chart event on a single `tickMarket` cycle
 * (~5-10s cadence). Keeps market activity lively without slamming dozens of players to +15%.
 */
export const SIMULATED_TICK_TRIGGER_PROB = 0.055;

/**
 * Share of positive triggered synthetic ticks that may become a rare simulated GOAL/ASSIST,
 * gated to players below +7.5% return who do not already hold a simulated GOAL/ASSIST.
 */
export const SIMULATED_GOAL_ASSIST_SHARE = 0.12;

export interface SimulatedTickEvaluation {
  event: MatchEvent | null;
  statEffect: "goal" | "assist" | "shot" | "keyPass" | null;
  displayText: string | null;
}

interface SimulatedTemplate {
  type: MatchEventType;
  text: string;
  title: string;
  statEffect?: "goal" | "assist" | "shot" | "keyPass";
}

const POSITIVE_PLAY_TEMPLATES: Record<PositionLine, readonly SimulatedTemplate[]> = {
  FW: [
    {
      type: "KEY_PLAY",
      text: "🎯 골문 구석을 노린 날카로운 유효슈팅!",
      title: "유효슈팅",
      statEffect: "shot",
    },
    {
      type: "KEY_PLAY",
      text: "⚡ 수비수 제치는 측면 돌파 및 찬스 메이킹",
      title: "측면 돌파",
      statEffect: "keyPass",
    },
  ],
  MF: [
    {
      type: "KEY_PLAY",
      text: "🎯 수비 라인을 허무는 결정적 킬패스!",
      title: "결정적 킬패스",
      statEffect: "keyPass",
    },
    {
      type: "KEY_PLAY",
      text: "🚀 아크 정면 날카로운 중거리 유효슈팅",
      title: "중거리 유효슈팅",
      statEffect: "shot",
    },
  ],
  DF: [
    {
      type: "DEFENSIVE_ACTION",
      text: "🛡️ 상대 공격수 1대1 돌파 완벽 저지!",
      title: "1대1 돌파 저지",
    },
    {
      type: "DEFENSIVE_ACTION",
      text: "🧱 박스 안 결정적 태클로 슈팅 차단!",
      title: "결정적 태클",
    },
  ],
  GK: [
    {
      type: "SAVE",
      text: "🧤 동물적인 반사신경 슈퍼 세이브!",
      title: "슈퍼 세이브",
    },
    {
      type: "SAVE",
      text: "🧤 크로스 상황에서 결정적 공중볼 처리!",
      title: "공중볼 처리",
    },
  ],
};

/**
 * Two-sided negative templates strictly within each position line's `POSITION_EVENT_WHITELIST`
 * so synthetic ticks never fabricate `YELLOW_CARD` or `RED_CARD` badges.
 */
const NEGATIVE_PLAY_TEMPLATES: Record<PositionLine, readonly SimulatedTemplate[]> = {
  FW: [
    {
      type: "BIG_CHANCE_MISS",
      text: "😣 결정적 슈팅 기회 마무리 아쉬움",
      title: "빅찬스 미스",
    },
  ],
  MF: [
    {
      type: "KEY_PLAY",
      text: "🔄 중원 압박에 의한 패스 미스 및 소유권 상실",
      title: "중원 패스 미스",
    },
  ],
  DF: [
    {
      type: "DEFENSIVE_ACTION",
      text: "🔄 수비 커버 지연으로 위험 지역 돌파 허용",
      title: "수비 커버 지연",
    },
  ],
  GK: [
    {
      type: "CONCEDED",
      text: "🥅 상대 유효슈팅에 아쉬운 실점 위기 허용",
      title: "실점 허용",
    },
  ],
};

const GOAL_ASSIST_TEMPLATES: Record<PositionLine, readonly SimulatedTemplate[]> = {
  FW: [
    {
      type: "GOAL",
      text: "⚽ 침착한 마무리로 득점 성공!",
      title: "득점",
      statEffect: "goal",
    },
    {
      type: "ASSIST",
      text: "🅰️ 동료에게 연결한 결정적 컷백 도움",
      title: "도움",
      statEffect: "assist",
    },
  ],
  MF: [
    {
      type: "ASSIST",
      text: "🅰️ 정확한 스루패스로 어시스트 기록!",
      title: "도움",
      statEffect: "assist",
    },
    {
      type: "GOAL",
      text: "⚽ 아크 정면 날카로운 중거리 득점!",
      title: "득점",
      statEffect: "goal",
    },
  ],
  DF: [
    {
      type: "GOAL",
      text: "⚽ 세트피스 코너킥 헤더 득점!",
      title: "헤더 득점",
      statEffect: "goal",
    },
  ],
  GK: [],
};

function getPositiveDirectionProbability(currentReturn: number): number {
  if (currentReturn >= 0.11) return 0.05;
  if (currentReturn >= 0.08) return 0.18;
  if (currentReturn >= 0.04) return 0.35;
  if (currentReturn <= -0.11) return 0.95;
  if (currentReturn <= -0.08) return 0.82;
  if (currentReturn <= -0.04) return 0.65;
  return 0.5;
}

function getPositiveDampingFactor(currentReturn: number): number {
  if (currentReturn >= 0.115) return 0;
  if (currentReturn >= 0.09) return 0.35;
  if (currentReturn >= 0.06) return 0.6;
  return 1;
}

function getNegativeDampingFactor(currentReturn: number): number {
  if (currentReturn <= -0.115) return 0;
  if (currentReturn <= -0.09) return 0.35;
  if (currentReturn <= -0.06) return 0.6;
  return 1;
}

function pickRandom<T>(items: readonly T[], rng: () => number): T {
  const idx = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[idx];
}

/**
 * Evaluate a single live `tickMarket` roll for a player with symmetric two-sided swings
 * and mean-reversion pressure so synthetic ticks never herd large groups into the +15% buy cap.
 */
export function evaluateSimulatedTickEvent(params: {
  playerId: string;
  position: Position;
  basePrice: number;
  currentPrice: number;
  currentMinute: number;
  existingEvents: readonly MatchEvent[];
  tierVolatilityMultiplier?: number;
  allowRandomEvents: boolean;
  rng?: () => number;
}): SimulatedTickEvaluation {
  if (!params.allowRandomEvents) {
    return { event: null, statEffect: null, displayText: null };
  }

  const rng = params.rng ?? Math.random;
  if (rng() >= SIMULATED_TICK_TRIGGER_PROB) {
    return { event: null, statEffect: null, displayText: null };
  }

  const safeBase = Math.max(1, params.basePrice);
  const currentReturn = (params.currentPrice - safeBase) / safeBase;
  const line = getPositionLine(params.position);
  const volScale = Math.min(
    1.2,
    Math.max(0.85, params.tierVolatilityMultiplier ?? 1)
  );

  const positiveProb = getPositiveDirectionProbability(currentReturn);
  const isPositive = rng() < positiveProb;

  if (isPositive) {
    const damping = getPositiveDampingFactor(currentReturn);
    if (damping <= 0) {
      return { event: null, statEffect: null, displayText: null };
    }

    const simulatedGoalOrAssistCount = params.existingEvents.filter(
      (ev) =>
        ev.source === "SIMULATED" && (ev.type === "GOAL" || ev.type === "ASSIST")
    ).length;

    const goalAssistPool = GOAL_ASSIST_TEMPLATES[line];
    const allowMajorPlay =
      goalAssistPool.length > 0 &&
      currentReturn < 0.075 &&
      simulatedGoalOrAssistCount === 0 &&
      rng() < SIMULATED_GOAL_ASSIST_SHARE;

    const chosen = allowMajorPlay
      ? pickRandom(goalAssistPool, rng)
      : pickRandom(POSITIVE_PLAY_TEMPLATES[line], rng);

    const basePct = allowMajorPlay
      ? 2.2 + rng() * 1.8 // +2.2% ~ +4.0%
      : 0.7 + rng() * 1.2; // +0.7% ~ +1.9%
    const impactPct = Number(
      Math.max(0.3, Math.min(4.2, basePct * volScale * damping)).toFixed(1)
    );

    const newEv: MatchEvent = {
      id: `ev-${params.playerId}-${params.currentMinute}-${chosen.type}`,
      playerId: params.playerId,
      minute: params.currentMinute,
      type: chosen.type,
      description: chosen.title,
      priceImpactPercent: impactPct,
      source: "SIMULATED",
    };

    return {
      event: newEv,
      statEffect: chosen.statEffect ?? null,
      displayText: chosen.text,
    };
  }

  const damping = getNegativeDampingFactor(currentReturn);
  if (damping <= 0) {
    return { event: null, statEffect: null, displayText: null };
  }

  const chosen = pickRandom(NEGATIVE_PLAY_TEMPLATES[line], rng);
  const basePct = 0.8 + rng() * 1.3; // -0.8% ~ -2.1%
  const impactPct = Number(
    (-Math.max(0.3, Math.min(2.6, basePct * volScale * damping))).toFixed(1)
  );

  const newEv: MatchEvent = {
    id: `ev-${params.playerId}-${params.currentMinute}-${chosen.type}`,
    playerId: params.playerId,
    minute: params.currentMinute,
    type: chosen.type,
    description: chosen.title,
    priceImpactPercent: impactPct,
    source: "SIMULATED",
  };

  return {
    event: newEv,
    statEffect: null,
    displayText: chosen.text,
  };
}

/**
 * Bound `source: "SIMULATED"` tick events to a clean sliding window and soft net-impact band
 * while preserving every `source: "REAL"` event untouched.
 * Also used during store hydration to clear stale runaway simulated cap lock-ins.
 */
export function sanitizeSimulatedTickEvents(
  events: readonly MatchEvent[],
  playerId: string,
  position?: string
): MatchEvent[] {
  const realEvents: MatchEvent[] = [];
  const simulatedEvents: MatchEvent[] = [];

  for (const ev of events) {
    if (!ev) continue;
    if (ev.source === "SIMULATED") {
      simulatedEvents.push(ev);
    } else {
      realEvents.push(ev);
    }
  }

  if (simulatedEvents.length === 0) {
    return normalizeMatchEvents(realEvents, playerId, position);
  }

  const recentSimulated = [...simulatedEvents]
    .sort((a, b) => a.minute - b.minute)
    .slice(-MAX_SIMULATED_EVENTS_PER_PLAYER);

  // Keep cumulative simulated drift within [-8.5%, +8.5%] so synthetic ticks alone
  // cannot permanently pin players at +15%/-15%.
  let cumulativeSimPct = 0;
  const boundedSimulated: MatchEvent[] = [];

  for (const ev of recentSimulated) {
    const rawImpact = Number((ev.priceImpactPercent ?? 0).toFixed(1));
    let adjustedImpact = rawImpact;

    if (cumulativeSimPct + adjustedImpact > SIMULATED_NET_IMPACT_MAX_PCT) {
      adjustedImpact = Number(
        Math.max(0, SIMULATED_NET_IMPACT_MAX_PCT - cumulativeSimPct).toFixed(1)
      );
    } else if (
      cumulativeSimPct + adjustedImpact <
      SIMULATED_NET_IMPACT_MIN_PCT
    ) {
      adjustedImpact = Number(
        Math.min(0, SIMULATED_NET_IMPACT_MIN_PCT - cumulativeSimPct).toFixed(1)
      );
    }

    if (Math.abs(adjustedImpact) < 0.1) continue;
    cumulativeSimPct = Number((cumulativeSimPct + adjustedImpact).toFixed(1));
    boundedSimulated.push({
      ...ev,
      priceImpactPercent: adjustedImpact,
      source: "SIMULATED",
    });
  }

  return normalizeMatchEvents(
    [...realEvents, ...boundedSimulated],
    playerId,
    position
  );
}

/**
 * Merge an optional new synthetic tick event onto a player's event timeline.
 * Clears prior-loop `SIMULATED` events when a demo match wraps 90' -> 46',
 * while always preserving `REAL` events verbatim.
 */
export function mergeSimulatedTickEvents(params: {
  existingEvents: readonly MatchEvent[];
  newSimulatedEvent: MatchEvent | null;
  playerId: string;
  position?: string;
  currentMinute: number;
  didMinuteWrap: boolean;
}): MatchEvent[] {
  let baseEvents = params.existingEvents.filter((ev) => {
    if (ev.source !== "SIMULATED") return true;
    if (params.didMinuteWrap) return false;
    return ev.minute !== params.currentMinute;
  });

  if (params.newSimulatedEvent) {
    baseEvents = [...baseEvents, params.newSimulatedEvent];
  }

  return sanitizeSimulatedTickEvents(baseEvents, params.playerId, params.position);
}
