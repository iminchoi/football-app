import type { MatchEvent } from "../types";
import type { PlayerEvent } from "./priceEngine";

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
