import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SIMULATED_EVENTS_PER_PLAYER,
  SIMULATED_NET_IMPACT_MAX_PCT,
  evaluateSimulatedTickEvent,
  mergeSimulatedTickEvents,
  sanitizeSimulatedTickEvents,
} from "../src/lib/marketTick.ts";
import {
  POSITION_EVENT_WHITELIST,
  derivePlayerMarketData,
  roundToTen,
} from "../src/lib/priceEngine.ts";
import { validateTradeOrder } from "../src/lib/orderGate.ts";
import { WEIGHTS } from "../src/lib/weights.ts";
import {
  getPositionLine,
  type MatchEvent,
  type Position,
} from "../src/types/index.ts";

function makeDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("Market Tick Balance & Upper-Limit Crowding Prevention (marketTick)", () => {
  it("prevents mass +15% cap crowding across 100 LIVE players over 200 ticks with two-sided swings and zero synthetic cards", () => {
    const rng = makeDeterministicRng(20261123);
    const positions: Position[] = [
      "ST",
      "LW",
      "RW",
      "CAM",
      "CM",
      "DM",
      "CB",
      "LB",
      "RB",
      "GK",
    ];

    const cohort = Array.from({ length: 100 }, (_, i) => {
      const pos = positions[i % positions.length];
      const basePrice = 10_000 + (i % 8) * 1_000;
      return {
        id: `p-sim-${i}`,
        position: pos,
        basePrice,
        currentPrice: basePrice,
        events: [] as MatchEvent[],
      };
    });

    let minute = 46;
    for (let tick = 0; tick < 200; tick += 1) {
      const didMinuteWrap = minute >= 90;
      minute = didMinuteWrap ? 46 : minute + 1;

      for (const p of cohort) {
        const evalRes = evaluateSimulatedTickEvent({
          playerId: p.id,
          position: p.position,
          basePrice: p.basePrice,
          currentPrice: p.currentPrice,
          currentMinute: minute,
          existingEvents: p.events,
          tierVolatilityMultiplier: 1.25,
          allowRandomEvents: true,
          rng,
        });

        if (evalRes.event) {
          assert.equal(evalRes.event.source, "SIMULATED");
          assert.notEqual(evalRes.event.type, "YELLOW_CARD");
          assert.notEqual(evalRes.event.type, "RED_CARD");
          const line = getPositionLine(p.position);
          assert.ok(
            POSITION_EVENT_WHITELIST[line].includes(evalRes.event.type),
            `${evalRes.event.type} must stay within ${line} whitelist`
          );
        }

        p.events = mergeSimulatedTickEvents({
          existingEvents: p.events,
          newSimulatedEvent: evalRes.event,
          playerId: p.id,
          position: p.position,
          currentMinute: minute,
          didMinuteWrap,
        });

        const simCount = p.events.filter((e) => e.source === "SIMULATED").length;
        assert.ok(simCount <= MAX_SIMULATED_EVENTS_PER_PLAYER);

        const derived = derivePlayerMarketData({
          playerId: p.id,
          openPrice: p.basePrice,
          basePrice: p.basePrice,
          events: p.events,
          currentMinute: minute,
          matchStatus: "LIVE",
        });
        p.currentPrice = derived.currentPrice;
      }
    }

    let atCap = 0;
    let atFloor = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let buyAllowedCount = 0;

    for (const p of cohort) {
      const capPrice = roundToTen(p.basePrice * (1 + WEIGHTS.CAP_LIMIT));
      const floorPrice = roundToTen(p.basePrice * (1 - WEIGHTS.CAP_LIMIT));
      if (p.currentPrice >= capPrice) atCap += 1;
      if (p.currentPrice <= floorPrice) atFloor += 1;
      if (p.currentPrice > p.basePrice) positiveCount += 1;
      if (p.currentPrice < p.basePrice) negativeCount += 1;

      const gate = validateTradeOrder({
        side: "BUY",
        matchStatus: "LIVE",
        basePrice: p.basePrice,
        currentPrice: p.currentPrice,
        quantity: 1,
        cash: 100_000,
      });
      if (gate.allowed) buyAllowedCount += 1;
    }

    // Zero or negligible synthetic cap crowding: majority of top-ranked players stay buyable
    assert.equal(atCap, 0, `Expected 0 synthetic-only players stuck at +15%, got ${atCap}`);
    assert.equal(atFloor, 0, `Expected 0 synthetic-only players stuck at -15%, got ${atFloor}`);
    assert.equal(buyAllowedCount, 100);
    // Healthy two-sided dispersion
    assert.ok(positiveCount > 10, `Expected meaningful gainers, got ${positiveCount}`);
    assert.ok(negativeCount > 10, `Expected meaningful decliners, got ${negativeCount}`);
  });

  it("recovers previously cap-locked persisted SIMULATED events on hydration while preserving REAL events", () => {
    const basePrice = 12_000;
    const runawayPersistedEvents: MatchEvent[] = [
      { id: "ev-real-1", playerId: "p-test", minute: 22, type: "GOAL", description: "선제골", priceImpactPercent: 5.5, source: "REAL" },
      { id: "ev-sim-1", playerId: "p-test", minute: 48, type: "GOAL", description: "득점", priceImpactPercent: 7.5, source: "SIMULATED" },
      { id: "ev-sim-2", playerId: "p-test", minute: 53, type: "ASSIST", description: "도움", priceImpactPercent: 6.2, source: "SIMULATED" },
      { id: "ev-sim-3", playerId: "p-test", minute: 61, type: "KEY_PLAY", description: "유효슈팅", priceImpactPercent: 4.1, source: "SIMULATED" },
      { id: "ev-sim-4", playerId: "p-test", minute: 68, type: "GOAL", description: "추가골", priceImpactPercent: 7.0, source: "SIMULATED" },
    ];

    // Before sanitization: hits +15% cap and blocks BUY
    const before = derivePlayerMarketData({
      playerId: "p-test",
      openPrice: basePrice,
      basePrice,
      events: runawayPersistedEvents,
      currentMinute: 70,
      matchStatus: "LIVE",
    });
    assert.equal(before.currentPrice, roundToTen(basePrice * (1 + WEIGHTS.CAP_LIMIT)));

    // After hydration sanitization: REAL goal stays verbatim, SIMULATED drift is bounded
    const sanitized = sanitizeSimulatedTickEvents(
      runawayPersistedEvents,
      "p-test",
      "ST"
    );
    const realKept = sanitized.filter((e) => e.source === "REAL");
    const simKept = sanitized.filter((e) => e.source === "SIMULATED");
    assert.equal(realKept.length, 1);
    assert.equal(realKept[0].id, "ev-real-1");
    assert.ok(simKept.length <= MAX_SIMULATED_EVENTS_PER_PLAYER);

    const simNetPct = simKept.reduce((acc, e) => acc + e.priceImpactPercent, 0);
    assert.ok(simNetPct <= SIMULATED_NET_IMPACT_MAX_PCT + 0.01);

    // On minute wrap-around (90 -> 46), REAL events survive while prior-loop SIMULATED ticks clear
    const afterWrap = mergeSimulatedTickEvents({
      existingEvents: sanitized,
      newSimulatedEvent: null,
      playerId: "p-test",
      position: "ST",
      currentMinute: 46,
      didMinuteWrap: true,
    });
    assert.equal(afterWrap.length, 1);
    assert.equal(afterWrap[0].source, "REAL");
    assert.equal(afterWrap[0].id, "ev-real-1");
  });

  it("damps positive synthetic pushes near +11.5% while preserving genuine REAL +15% cap behavior", () => {
    const basePrice = 10_000;
    // Near +12%: force trigger roll (0.01) + positive direction roll (0.01) -> blocked by damping
    let call = 0;
    const forcePositiveRng = () => {
      call += 1;
      return 0.01;
    };
    const evalNearCap = evaluateSimulatedTickEvent({
      playerId: "p-high",
      position: "RW",
      basePrice,
      currentPrice: 11_200, // +12.0%
      currentMinute: 75,
      existingEvents: [],
      allowRandomEvents: true,
      rng: forcePositiveRng,
    });
    assert.equal(evalNearCap.event, null);
    assert.ok(call >= 2);

    // Genuine REAL multi-goal events still reach +15% and trigger validateTradeOrder BUY guard (WEIGHTS unchanged)
    assert.equal(WEIGHTS.CAP_LIMIT, 0.15);
    const realHatTrick: MatchEvent[] = [
      { id: "r1", playerId: "p-real", minute: 15, type: "GOAL", description: "선제골", priceImpactPercent: 8.5, source: "REAL" },
      { id: "r2", playerId: "p-real", minute: 42, type: "GOAL", description: "추가골", priceImpactPercent: 8.5, source: "REAL" },
    ];
    const kept = sanitizeSimulatedTickEvents(realHatTrick, "p-real", "ST");
    assert.equal(kept.length, 2);
    const derived = derivePlayerMarketData({
      playerId: "p-real",
      openPrice: basePrice,
      basePrice,
      events: kept,
      currentMinute: 50,
      matchStatus: "LIVE",
    });
    assert.equal(derived.currentPrice, roundToTen(basePrice * (1 + WEIGHTS.CAP_LIMIT)));
    const gate = validateTradeOrder({
      side: "BUY",
      matchStatus: "LIVE",
      basePrice,
      currentPrice: derived.currentPrice,
      quantity: 1,
      cash: 100_000,
    });
    assert.equal(gate.allowed, false);
    assert.match(gate.message ?? "", /상한가/);
  });
});
