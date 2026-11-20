import type { MatchEvent, MatchStatus, TradeType } from "../types";
import type { PlayerEvent } from "./priceEngine.ts";
import { WEIGHTS } from "./weights.ts";

export const API_LATENCY_BUFFER_SEC = 30;

type GateEventLike = Pick<PlayerEvent, "type" | "triggeredAt"> & {
  detectedAt?: number;
};

type MatchGateEventLike = Pick<MatchEvent, "type" | "triggeredAt"> & {
  detectedAt?: number;
};

const CIRCUIT_BREAKER_TYPES = new Set<string>([
  "GOAL",
  "RED_CARD",
  "PENALTY",
]);

/**
 * Compute remaining circuit breaker lock seconds from either a canonical event array
 * (using `detectedAt ?? triggeredAt`) or a direct epoch-ms timestamp.
 */
export function getCircuitBreakerRemainingSec(
  eventsOrTimestamp:
    | ReadonlyArray<GateEventLike | MatchGateEventLike>
    | number
    | undefined,
  nowMs = Date.now(),
  latencyBufferSec = API_LATENCY_BUFFER_SEC
): number {
  const bufferMs = Math.max(0, latencyBufferSec) * 1000;
  if (bufferMs === 0 || eventsOrTimestamp === undefined) return 0;

  let latestDetectedAt = 0;

  if (typeof eventsOrTimestamp === "number") {
    if (!Number.isFinite(eventsOrTimestamp)) return 0;
    latestDetectedAt = eventsOrTimestamp;
  } else {
    for (const ev of eventsOrTimestamp) {
      if (!CIRCUIT_BREAKER_TYPES.has(ev.type)) continue;
      const ts = ev.detectedAt ?? ev.triggeredAt ?? 0;
      if (Number.isFinite(ts) && ts > latestDetectedAt) {
        latestDetectedAt = ts;
      }
    }
  }

  if (latestDetectedAt <= 0) return 0;
  const elapsed = nowMs - latestDetectedAt;
  if (elapsed < 0 || elapsed >= bufferMs) return 0;
  return Math.ceil((bufferMs - elapsed) / 1000);
}

/**
 * Time-dependent order gate: blocks orders for `latencyBufferSec` (default 30s)
 * after a major match event (GOAL, RED_CARD, PENALTY) is detected.
 */
export function isCircuitBreakerActive(
  eventsOrTimestamp:
    | ReadonlyArray<GateEventLike | MatchGateEventLike>
    | number
    | undefined,
  nowMs = Date.now(),
  latencyBufferSec = API_LATENCY_BUFFER_SEC
): boolean {
  return (
    getCircuitBreakerRemainingSec(eventsOrTimestamp, nowMs, latencyBufferSec) >
    0
  );
}

export interface TradeOrderGateInput {
  side: TradeType;
  matchStatus: MatchStatus;
  basePrice: number;
  currentPrice: number;
  quantity: number;
  cash?: number;
  holdingQuantity?: number;
  lastMajorEventAt?: number;
  nowMs?: number;
}

export interface TradeOrderGateResult {
  allowed: boolean;
  message?: string;
  executedPrice: number;
}

function roundTen(value: number): number {
  return Math.round(value / 10) * 10;
}

/**
 * Pure order validation shared by store actions (`buyPlayer` / `sellPlayer`):
 * enforces FT lock, 30s circuit breaker, ±15% cap/floor guard, and balance/holdings.
 */
export function validateTradeOrder(
  input: TradeOrderGateInput
): TradeOrderGateResult {
  const safeBase = roundTen(input.basePrice);
  const executedPrice = roundTen(input.currentPrice);

  if (input.matchStatus === "FT") {
    return {
      allowed: false,
      message: "경기 종료 · 거래 마감된 종목은 주문할 수 없습니다.",
      executedPrice,
    };
  }

  const cbSec = getCircuitBreakerRemainingSec(
    input.lastMajorEventAt,
    input.nowMs ?? Date.now()
  );
  if (cbSec > 0) {
    return {
      allowed: false,
      message: `서킷 브레이커 작동 중입니다. (${cbSec}초 후 주문 가능)`,
      executedPrice,
    };
  }

  if (input.side === "BUY") {
    const capPrice = roundTen(safeBase * (1 + WEIGHTS.CAP_LIMIT));
    if (executedPrice >= capPrice) {
      return {
        allowed: false,
        message: "상한가(+15%) 도달 · 매수 제한 (매도만 가능)",
        executedPrice,
      };
    }
    const totalCost = roundTen(executedPrice * input.quantity);
    if (input.cash !== undefined && totalCost > input.cash) {
      return {
        allowed: false,
        message: `보유 포인트가 부족합니다. (필요: ${totalCost.toLocaleString()} P)`,
        executedPrice,
      };
    }
    return { allowed: true, executedPrice };
  }

  const floorPrice = roundTen(safeBase * (1 - WEIGHTS.CAP_LIMIT));
  if (executedPrice <= floorPrice) {
    return {
      allowed: false,
      message: "하한가(-15%) 도달 · 매도 제한 (매수만 가능)",
      executedPrice,
    };
  }
  const held = input.holdingQuantity ?? 0;
  if (held < input.quantity) {
    return {
      allowed: false,
      message: `보유 수량이 부족합니다. (현재 보유: ${held}주)`,
      executedPrice,
    };
  }
  return { allowed: true, executedPrice };
}
