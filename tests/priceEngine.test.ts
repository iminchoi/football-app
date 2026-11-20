import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPriceSeries,
  calculateCumulativeReturn,
  deriveStatsFromEvents,
  eventDelta,
} from "../src/lib/priceEngine.ts";
import type { PlayerContext, PlayerEvent } from "../src/lib/priceEngine.ts";

test("goal context priority is mutually exclusive: OPENER +9.5%, EQUALIZER/GO_AHEAD +12%, EXTEND_LEAD +7%", () => {
  const fwCtx: PlayerContext = { position: "ST", isStarter: true };

  const opener = eventDelta(
    { id: "g1", playerId: "p1", minute: 12, type: "GOAL", goalContext: "OPENER" },
    fwCtx
  );
  const equalizer = eventDelta(
    { id: "g2", playerId: "p1", minute: 40, type: "GOAL", goalContext: "EQUALIZER" },
    fwCtx
  );
  const goAhead = eventDelta(
    { id: "g3", playerId: "p1", minute: 65, type: "GOAL", goalContext: "GO_AHEAD" },
    fwCtx
  );
  const extendLead = eventDelta(
    { id: "g4", playerId: "p1", minute: 80, type: "GOAL", goalContext: "EXTEND_LEAD" },
    fwCtx
  );

  assert.equal(opener, 0.095);
  assert.equal(equalizer, 0.12);
  assert.equal(goAhead, 0.12);
  assert.equal(extendLead, 0.07);
});

test("clamping preserves rawReturn while bounding clampedReturn within [-0.30, +0.30]", () => {
  const ctx: PlayerContext = { position: "ST", playerId: "p-hat", matchId: "m1" };
  const hatTrickEvents: PlayerEvent[] = [
    { id: "e1", playerId: "p-hat", minute: 15, type: "GOAL", goalContext: "OPENER" },
    { id: "e2", playerId: "p-hat", minute: 35, type: "GOAL", goalContext: "GO_AHEAD" },
    { id: "e3", playerId: "p-hat", minute: 60, type: "GOAL", goalContext: "EXTEND_LEAD" },
    { id: "e4", playerId: "p-hat", minute: 75, type: "ASSIST" },
  ];

  // Expected raw: 0.095 + 0.12 + 0.07 + 0.055 = 0.34 (+34%)
  const res = calculateCumulativeReturn(hatTrickEvents, ctx);
  assert.equal(res.rawReturn, 0.34);
  assert.equal(res.clampedReturn, 0.3);

  const series = buildPriceSeries(10000, hatTrickEvents, ctx, 90);
  assert.equal(series.rawReturn, 0.34);
  assert.equal(series.clampedReturn, 0.3);
  assert.equal(series.currentPrice, 13000);
});

test("unused bench player stays strictly at 0.00% regardless of team events", () => {
  const benchCtx: PlayerContext = {
    position: "CM",
    isStarter: false,
    isBenchUnused: true,
    playerId: "p-bench",
    matchId: "m1",
  };
  const events: PlayerEvent[] = [
    { id: "e1", playerId: "p-bench", minute: 20, type: "TEAM_GOAL" },
    { id: "e2", playerId: "p-bench", minute: 50, type: "GOAL", goalContext: "OPENER" },
  ];

  const series = buildPriceSeries(10000, events, benchCtx, 90);
  assert.equal(series.rawReturn, 0);
  assert.equal(series.clampedReturn, 0);
  assert.equal(series.currentPrice, 10000);
});

test("determinism: identical inputs always produce identical PricePoint[] series", () => {
  const ctx: PlayerContext = {
    position: "CB",
    playerId: "p-kim",
    matchId: "m-det",
    isStarter: true,
  };
  const events: PlayerEvent[] = [
    { id: "e1", playerId: "p-kim", minute: 27, type: "KEY_ACTION", description: "결정적 태클" },
    { id: "e2", playerId: "p-kim", minute: 45, type: "CLEAN_SHEET_45" },
    { id: "e3", playerId: "p-kim", minute: 70, type: "YELLOW_CARD" },
  ];

  const run1 = buildPriceSeries(12000, events, ctx, 90);
  const run2 = buildPriceSeries(12000, events, ctx, 90);
  assert.deepEqual(run1, run2);
});

test("SSOT alignment: aggregated stats match timeline events and chart markers 1:1", () => {
  const ctx: PlayerContext = {
    position: "LW",
    playerId: "p-son",
    matchId: "m-ssot",
    isStarter: true,
  };
  const events: PlayerEvent[] = [
    { id: "e1", playerId: "p-son", minute: 18, type: "GOAL", goalContext: "OPENER", description: "선제골" },
    { id: "e2", playerId: "p-son", minute: 42, type: "YELLOW_CARD", description: "경고" },
    { id: "e3", playerId: "p-son", minute: 67, type: "ASSIST", description: "도움" },
  ];

  const stats = deriveStatsFromEvents(events);
  const series = buildPriceSeries(15000, events, ctx, 90);
  const chartMarkers = series.points.filter((pt) => Boolean(pt.event));

  assert.equal(stats.goals, 1);
  assert.equal(stats.assists, 1);
  assert.equal(stats.yellowCards, 1);
  assert.equal(stats.redCards, 0);
  assert.equal(chartMarkers.length, events.length);
  assert.deepEqual(
    chartMarkers.map((m) => m.minute),
    events.map((e) => e.minute)
  );
});
