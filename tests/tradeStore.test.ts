import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateTradeOrder } from "../src/lib/orderGate.ts";
import { WEIGHTS } from "../src/lib/weights.ts";

describe("tradeStore order guards (validateTradeOrder)", () => {
  const BASE = 10_000;
  const CAP = Math.round((BASE * (1 + WEIGHTS.CAP_LIMIT)) / 10) * 10; // 11,500 (+15%)
  const FLOOR = Math.round((BASE * (1 - WEIGHTS.CAP_LIMIT)) / 10) * 10; // 8,500 (-15%)

  it("blocks both BUY and SELL when match status is FT", () => {
    const buyRes = validateTradeOrder({
      side: "BUY",
      matchStatus: "FT",
      basePrice: BASE,
      currentPrice: BASE,
      quantity: 1,
      cash: 100_000,
    });
    assert.equal(buyRes.allowed, false);
    assert.match(buyRes.message ?? "", /거래 마감/);

    const sellRes = validateTradeOrder({
      side: "SELL",
      matchStatus: "FT",
      basePrice: BASE,
      currentPrice: BASE,
      quantity: 1,
      holdingQuantity: 5,
    });
    assert.equal(sellRes.allowed, false);
    assert.match(sellRes.message ?? "", /거래 마감/);
  });

  it("blocks BUY at +15% upper limit while allowing SELL", () => {
    const buyRes = validateTradeOrder({
      side: "BUY",
      matchStatus: "LIVE",
      basePrice: BASE,
      currentPrice: CAP,
      quantity: 1,
      cash: 100_000,
    });
    assert.equal(buyRes.allowed, false);
    assert.match(buyRes.message ?? "", /상한가/);

    const sellRes = validateTradeOrder({
      side: "SELL",
      matchStatus: "LIVE",
      basePrice: BASE,
      currentPrice: CAP,
      quantity: 1,
      holdingQuantity: 3,
    });
    assert.equal(sellRes.allowed, true);
  });

  it("blocks SELL at -15% lower limit while allowing BUY", () => {
    const sellRes = validateTradeOrder({
      side: "SELL",
      matchStatus: "LIVE",
      basePrice: BASE,
      currentPrice: FLOOR,
      quantity: 1,
      holdingQuantity: 3,
    });
    assert.equal(sellRes.allowed, false);
    assert.match(sellRes.message ?? "", /하한가/);

    const buyRes = validateTradeOrder({
      side: "BUY",
      matchStatus: "LIVE",
      basePrice: BASE,
      currentPrice: FLOOR,
      quantity: 1,
      cash: 100_000,
    });
    assert.equal(buyRes.allowed, true);
  });

  it("enforces the 30-second circuit breaker lock and unlocks after 30s", () => {
    const eventTime = 1_700_000_000_000;
    const locked = validateTradeOrder({
      side: "BUY",
      matchStatus: "LIVE",
      basePrice: BASE,
      currentPrice: BASE,
      quantity: 1,
      cash: 100_000,
      lastMajorEventAt: eventTime,
      nowMs: eventTime + 10_000,
    });
    assert.equal(locked.allowed, false);
    assert.match(locked.message ?? "", /서킷 브레이커/);

    const unlocked = validateTradeOrder({
      side: "BUY",
      matchStatus: "LIVE",
      basePrice: BASE,
      currentPrice: BASE,
      quantity: 1,
      cash: 100_000,
      lastMajorEventAt: eventTime,
      nowMs: eventTime + 30_000,
    });
    assert.equal(unlocked.allowed, true);
  });
});
