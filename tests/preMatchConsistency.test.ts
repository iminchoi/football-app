import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlayerQuote } from "../src/lib/playerQuote.ts";
import {
  resolveMatchClock,
  resolveMatchForPlayerView,
  syncActiveMatchContext,
} from "../src/lib/matchSync.ts";
import { validateTradeOrder } from "../src/lib/orderGate.ts";
import {
  deriveCandlesFromEvents,
  derivePlayerMarketData,
  extractInitialMatchEvents,
} from "../src/lib/priceEngine.ts";
import {
  buildActiveMatchContext,
  type Holding,
  type Match,
  type Player,
} from "../src/types/index.ts";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "m-pre",
    utcDate: "2026-11-22T20:00:00Z",
    leagueId: "pl-2021",
    leagueName: "프리미어리그",
    leagueCountry: "잉글랜드",
    status: "UPCOMING",
    rawStatus: "TIMED",
    kickoffTime: "20:00",
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20" },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107" },
    ...overrides,
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p-saka",
    name: "부카요 사카",
    englishName: "Bukayo Saka",
    nationalTeam: "잉글랜드",
    matchId: "m-pre",
    teamId: "ars",
    teamName: "Arsenal",
    teamShort: "ARS",
    teamColor: "#EF0107",
    position: "RW",
    backNumber: 7,
    tier: "S",
    totalShares: 500,
    marketSupply: 200,
    basePrice: 20000,
    initialPrice: 20000,
    openPrice: 20000,
    currentPrice: 20000,
    previousPrice: 20000,
    priceHistory: [
      { minute: 0, timeLabel: "0'", price: 20000, changePercentFromOpen: 0 },
    ],
    lastEvent: { text: "", sentiment: "neutral", minute: 0 },
    stats: { rating: 7, goals: 0, assists: 0, shotsOnTarget: 0, keyPasses: 0 },
    ...overrides,
  };
}

const liveOtherFixture = makeMatch({
  id: "m-ars-che-live",
  utcDate: "2026-11-21T15:00:00Z",
  status: "LIVE",
  rawStatus: "IN_PLAY",
  minute: 63,
  homeTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 1 },
  awayTeam: { id: "che", name: "Chelsea", shortName: "CHE", color: "#034694", score: 0 },
});

test("PRE quote pins open/current/high/low to the base price with zero change", () => {
  const stale = makePlayer({
    openPrice: 21000,
    currentPrice: 22400,
    highPrice: 22800,
    lowPrice: 19800,
    volume: 900,
  });
  const quote = resolvePlayerQuote(stale, "UPCOMING");
  assert.equal(quote.isPreMatch, true);
  assert.equal(quote.openPrice, 20000);
  assert.equal(quote.currentPrice, 20000);
  assert.equal(quote.highPrice, 20000);
  assert.equal(quote.lowPrice, 20000);
  assert.equal(quote.volume, 0);
  assert.equal(quote.diff, 0);
  assert.equal(quote.changePct, 0);
});

test("LIVE quote uses the stored current price and FT quote prefers the close price", () => {
  const player = makePlayer({
    openPrice: 20000,
    currentPrice: 21000,
    closePrice: 20500,
  });
  const live = resolvePlayerQuote(player, "LIVE");
  assert.equal(live.currentPrice, 21000);
  assert.equal(live.diff, 1000);
  assert.equal(live.changePct, 5);

  const ft = resolvePlayerQuote(player, "FT");
  assert.equal(ft.currentPrice, 20500);
  assert.equal(ft.changePct, 2.5);
});

test("PRE orders are accepted for both BUY and SELL at the pinned base quote", () => {
  const player = makePlayer({ openPrice: 21000, currentPrice: 22400 });
  const quote = resolvePlayerQuote(player, "UPCOMING");
  const buy = validateTradeOrder({
    side: "BUY",
    matchStatus: "UPCOMING",
    basePrice: quote.basePrice,
    currentPrice: quote.currentPrice,
    quantity: 2,
    cash: 100_000,
  });
  assert.equal(buy.allowed, true);
  assert.equal(buy.executedPrice, 20000);

  const sell = validateTradeOrder({
    side: "SELL",
    matchStatus: "UPCOMING",
    basePrice: quote.basePrice,
    currentPrice: quote.currentPrice,
    quantity: 1,
    holdingQuantity: 2,
  });
  assert.equal(sell.allowed, true);
  assert.equal(sell.executedPrice, 20000);
});

test("a live context of another fixture of the same team never replaces the player's own PRE fixture", () => {
  const preFixture = makeMatch();
  const storeMatches = [preFixture, liveOtherFixture];
  const player = makePlayer({ matchId: "m-pre" });

  // Stale context left over from browsing the live Arsenal match
  const staleLiveCtx = buildActiveMatchContext(liveOtherFixture);
  const withStaleCtx = resolveMatchForPlayerView({
    player,
    storeMatches,
    activeMatchContext: staleLiveCtx,
  });
  assert.equal(withStaleCtx?.id, "m-pre");
  assert.equal(resolveMatchClock(withStaleCtx).phase, "PRE");

  // Reselecting from the portfolio (no context) lands on the same fixture
  const fromPortfolio = resolveMatchForPlayerView({ player, storeMatches });
  assert.equal(fromPortfolio?.id, "m-pre");

  // Reselecting from the PRE pitch (its own context) lands on the same fixture
  const fromPitch = resolveMatchForPlayerView({
    player,
    storeMatches,
    activeMatchContext: buildActiveMatchContext(preFixture),
  });
  assert.equal(fromPitch?.id, "m-pre");
});

test("a live player is not hijacked by a PRE context of the team's next fixture", () => {
  const preFixture = makeMatch();
  const storeMatches = [preFixture, liveOtherFixture];
  const livePlayer = makePlayer({ matchId: "m-ars-che-live" });

  const resolved = resolveMatchForPlayerView({
    player: livePlayer,
    storeMatches,
    activeMatchContext: buildActiveMatchContext(preFixture),
  });
  assert.equal(resolved?.id, "m-ars-che-live");
  assert.equal(resolveMatchClock(resolved).phase, "2H");
  assert.equal(
    resolvePlayerQuote(
      makePlayer({ matchId: "m-ars-che-live", currentPrice: 21400 }),
      resolveMatchClock(resolved).status
    ).currentPrice,
    21400
  );
});

test("a context of the same fixture under a different id is still honored", () => {
  const localFixture = makeMatch({ id: "m-new-ars" });
  const apiFixture = makeMatch({
    id: "fd-777",
    status: "LIVE",
    rawStatus: "PAUSED",
    minute: 45,
  });
  const player = makePlayer({ matchId: "m-new-ars" });
  const resolved = resolveMatchForPlayerView({
    player,
    storeMatches: [localFixture, apiFixture],
    activeMatchContext: buildActiveMatchContext(apiFixture),
  });
  assert.equal(resolved?.id, "fd-777");
  assert.equal(resolveMatchClock(resolved).phase, "HT");
});

test("a player without a stored fixture keeps the clicked context", () => {
  const player = makePlayer({ matchId: "pitch-only" });
  const preFixture = makeMatch();
  const resolved = resolveMatchForPlayerView({
    player,
    storeMatches: [preFixture, liveOtherFixture],
    activeMatchContext: buildActiveMatchContext(preFixture),
  });
  assert.equal(resolved?.id, "m-pre");
});

test("PRE context stays PRE across market ticks of unrelated live fixtures", () => {
  const preFixture = makeMatch();
  const ctx = buildActiveMatchContext(preFixture);
  const tickedLive = { ...liveOtherFixture, minute: 64 };
  const synced = syncActiveMatchContext(ctx, [preFixture, tickedLive]);
  assert.equal(synced?.matchId, "m-pre");
  assert.equal(synced?.status, "PRE");
  assert.equal(synced?.minute, 0);
});

test("PRE market data and candles strip stale events and hold a flat 0' baseline at base price", () => {
  const player = makePlayer({
    basePrice: 20000,
    openPrice: 21000,
    currentPrice: 22400,
    events: [
      {
        id: "ev-stale-goal",
        playerId: "p-saka",
        minute: 27,
        type: "GOAL",
        description: "득점",
        priceImpactPercent: 8.5,
      },
    ],
  });

  const quote = resolvePlayerQuote(player, "UPCOMING");
  const initialEvents = extractInitialMatchEvents(player, "UPCOMING");
  assert.equal(initialEvents.length, 0);

  const marketData = derivePlayerMarketData({
    playerId: player.id,
    openPrice: quote.openPrice,
    basePrice: quote.basePrice,
    events: initialEvents,
    currentMinute: 0,
    matchStatus: "UPCOMING",
  });
  assert.equal(marketData.openPrice, 20000);
  assert.equal(marketData.currentPrice, 20000);
  assert.equal(marketData.highPrice, 20000);
  assert.equal(marketData.lowPrice, 20000);
  assert.equal(marketData.volume, 0);
  assert.equal(marketData.events.length, 0);
  assert.equal(marketData.priceHistory.length, 1);
  assert.equal(marketData.priceHistory[0]?.minute, 0);
  assert.equal(marketData.priceHistory[0]?.price, 20000);

  const candles = deriveCandlesFromEvents({
    playerId: player.id,
    openPrice: quote.openPrice,
    basePrice: quote.basePrice,
    events: initialEvents,
    timeframe: "3M",
    matchStatus: "UPCOMING",
    currentMinute: 0,
  });
  assert.equal(candles.length, 1);
  assert.equal(candles[0]?.open, 20000);
  assert.equal(candles[0]?.close, 20000);
  assert.equal(candles[0]?.volume, 0);
});

test("holding matchContext preserves PRE quote and clock when reselecting a date-shifted or cross-fixture player from portfolio", () => {
  // Store holds today's LIVE fixture for m-new-ars, but user bought on a future PRE snapshot of m-new-ars
  const liveTodayMatch = makeMatch({
    id: "m-new-ars",
    dateKey: "TODAY",
    utcDate: undefined,
    status: "LIVE",
    rawStatus: "IN_PLAY",
    minute: 72,
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20", score: 1 },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
  });
  const futurePreSnapshot = makeMatch({
    id: "m-new-ars",
    dateKey: "WEEKEND",
    utcDate: undefined,
    status: "UPCOMING",
    rawStatus: "SCHEDULED",
    kickoffTime: "21:30",
    homeTeam: { id: "new", name: "Newcastle", shortName: "NEW", color: "#241F20" },
    awayTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107" },
  });
  const player = makePlayer({
    matchId: "m-new-ars",
    basePrice: 20000,
    openPrice: 20000,
    currentPrice: 21800,
  });

  const savedHolding: Holding = {
    playerId: player.id,
    quantity: 3,
    avgBuyPrice: 20000,
    matchContext: buildActiveMatchContext(futurePreSnapshot),
  };

  // Reselecting from portfolio with holding.matchContext resolves back to PRE
  const resolvedMatch = resolveMatchForPlayerView({
    player,
    storeMatches: [liveTodayMatch],
    activeMatchContext: savedHolding.matchContext ?? null,
  });
  const clock = resolveMatchClock(resolvedMatch, savedHolding.matchContext);
  const quote = resolvePlayerQuote(player, clock.status);

  assert.equal(clock.status, "UPCOMING");
  assert.equal(clock.phase, "PRE");
  assert.equal(quote.currentPrice, 20000);
  assert.equal(quote.changePct, 0);
});
