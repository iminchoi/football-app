import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  API_LATENCY_BUFFER_SEC,
  getCircuitBreakerRemainingSec,
  isCircuitBreakerActive,
} from "../src/lib/orderGate.ts";

describe("orderGate circuit breaker", () => {
  it("uses a 30-second API latency buffer by default", () => {
    assert.equal(API_LATENCY_BUFFER_SEC, 30);
  });

  it("blocks orders within 30 seconds of a major event and unlocks after 30 seconds", () => {
    const detectedAt = 1_700_000_000_000;

    assert.equal(isCircuitBreakerActive(detectedAt, detectedAt + 5_000), true);
    assert.equal(
      getCircuitBreakerRemainingSec(detectedAt, detectedAt + 5_000),
      25
    );

    assert.equal(isCircuitBreakerActive(detectedAt, detectedAt + 29_500), true);
    assert.equal(
      getCircuitBreakerRemainingSec(detectedAt, detectedAt + 29_500),
      1
    );

    assert.equal(isCircuitBreakerActive(detectedAt, detectedAt + 30_000), false);
    assert.equal(
      getCircuitBreakerRemainingSec(detectedAt, detectedAt + 30_000),
      0
    );
  });

  it("ignores non-major events when evaluating event arrays", () => {
    const detectedAt = 1_700_000_000_000;
    const events = [
      { type: "KEY_PLAY" as const, triggeredAt: detectedAt },
      { type: "YELLOW_CARD" as const, triggeredAt: detectedAt },
    ];
    assert.equal(isCircuitBreakerActive(events, detectedAt + 1_000), false);

    const goalEvents = [
      ...events,
      { type: "GOAL" as const, triggeredAt: detectedAt },
    ];
    assert.equal(isCircuitBreakerActive(goalEvents, detectedAt + 1_000), true);
  });
});
