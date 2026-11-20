import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPriceSeries,
  calculateCumulativeReturn,
  deriveStatsFromEvents,
  eventDelta,
  expectedReturn,
} from "../src/lib/priceEngine.ts";
import { WEIGHTS } from "../src/lib/weights.ts";
import type { PlayerContext, PlayerEvent } from "../src/lib/priceEngine.ts";

test("goal context priority is mutually exclusive: OPENER, EQUALIZER/GO_AHEAD, EXTEND_LEAD", () => {
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

  assert.equal(opener, WEIGHTS.GOAL.OPENER);
  assert.equal(equalizer, WEIGHTS.GOAL.EQUALIZER_OR_GO_AHEAD);
  assert.equal(goAhead, WEIGHTS.GOAL.EQUALIZER_OR_GO_AHEAD);
  assert.equal(extendLead, WEIGHTS.GOAL.EXTEND_LEAD);
});

test("clamping preserves rawReturn while bounding clampedReturn within [-CAP_LIMIT, +CAP_LIMIT]", () => {
  const ctx: PlayerContext = { position: "ST", playerId: "p-hat", matchId: "m1" };
  const hatTrickEvents: PlayerEvent[] = [
    { id: "e1", playerId: "p-hat", minute: 15, type: "GOAL", goalContext: "OPENER" },
    { id: "e2", playerId: "p-hat", minute: 35, type: "GOAL", goalContext: "GO_AHEAD" },
    { id: "e3", playerId: "p-hat", minute: 60, type: "GOAL", goalContext: "EXTEND_LEAD" },
    { id: "e4", playerId: "p-hat", minute: 75, type: "ASSIST" },
  ];

  const expectedRaw = Number(
    (
      WEIGHTS.GOAL.OPENER +
      WEIGHTS.GOAL.EQUALIZER_OR_GO_AHEAD +
      WEIGHTS.GOAL.EXTEND_LEAD +
      WEIGHTS.ASSIST
    ).toFixed(4)
  );
  const res = calculateCumulativeReturn(hatTrickEvents, ctx);
  assert.equal(res.rawReturn, expectedRaw);
  assert.equal(res.clampedReturn, WEIGHTS.CAP_LIMIT);

  const series = buildPriceSeries(10000, hatTrickEvents, ctx, 90);
  assert.equal(series.rawReturn, expectedRaw);
  assert.equal(series.clampedReturn, WEIGHTS.CAP_LIMIT);
  assert.equal(series.currentPrice, Math.round((10000 * (1 + WEIGHTS.CAP_LIMIT)) / 10) * 10);
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

test("v2.4 expectedReturn=0 produces identical PriceSeries and PRE open price has zero jump", () => {
  const events: PlayerEvent[] = [
    { id: "e1", playerId: "p1", minute: 20, type: "GOAL", goalContext: "OPENER" },
    { id: "e2", playerId: "p1", minute: 65, type: "ASSIST" },
  ];
  const baseSeries = buildPriceSeries(10000, events, { position: "ST", playerId: "p1", matchId: "m1" }, 90);
  const zeroESeries = buildPriceSeries(10000, events, { position: "ST", playerId: "p1", matchId: "m1", expectedReturn: 0 }, 90);
  assert.deepEqual(zeroESeries, baseSeries);

  const eVal = expectedReturn("ST", 1.35, 1.15);
  const deductedSeries = buildPriceSeries(10000, events, { position: "ST", playerId: "p1", matchId: "m1", expectedReturn: eVal }, 90);
  assert.equal(deductedSeries.points[0].minute, 0);
  assert.equal(deductedSeries.points[0].price, 10000);
  assert.equal(deductedSeries.points[0].rawReturn, 0);
});

test("v2.4 full-time deduction equals E at minute 90", () => {
  const events: PlayerEvent[] = [
    { id: "e1", playerId: "p2", minute: 30, type: "GOAL", goalContext: "OPENER" },
  ];
  const eVal = expectedReturn("ST", 1.35, 1.15);
  const withoutE = buildPriceSeries(10000, events, { position: "ST", playerId: "p2", matchId: "m2", expectedReturn: 0 }, 90);
  const withE = buildPriceSeries(10000, events, { position: "ST", playerId: "p2", matchId: "m2", expectedReturn: eVal }, 90);

  const totalDeduction = Number((withoutE.rawReturn - withE.rawReturn).toFixed(4));
  assert.equal(totalDeduction, eVal);
});

test("v2.4 expectedReturn is deterministic and increases with favorable matchup", () => {
  const r1 = expectedReturn("FW", 1.35, 1.15);
  const r2 = expectedReturn("FW", 1.35, 1.15);
  assert.equal(r1, r2);

  const weakVsStrong = expectedReturn("FW", 0.72, 0.75);
  assert.ok(r1 > weakVsStrong);
});
