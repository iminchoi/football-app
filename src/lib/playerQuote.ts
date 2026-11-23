import type {
  Holding,
  MatchStatus,
  PersistedPlayerPrice,
  Player,
  PointTransaction,
} from "../types/index.ts";
import { doesPlayerNameMatch } from "./playerDisplayName.ts";
import {
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
  roundToTen,
} from "./priceEngine.ts";
import { getTierConfig } from "../utils/tier.ts";

export type PlayerQuoteSource = Pick<
  Player,
  | "basePrice"
  | "initialPrice"
  | "openPrice"
  | "currentPrice"
  | "closePrice"
  | "highPrice"
  | "lowPrice"
  | "volume"
  | "priceHistory"
>;

export interface PlayerQuote {
  basePrice: number;
  openPrice: number;
  currentPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  diff: number;
  changePct: number;
  isPreMatch: boolean;
}

/**
 * Single quote resolver shared by the order panels, charts, and order execution.
 * Before kickoff (`UPCOMING` / PRE) every price field is pinned to the base price
 * so the displayed quote, the chart baseline, and the executed order price agree.
 * LIVE quotes the stored current price; FT quotes the stored close price.
 */
export function resolvePlayerQuote(
  player: PlayerQuoteSource,
  status: MatchStatus
): PlayerQuote {
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );

  if (status === "UPCOMING") {
    return {
      basePrice,
      openPrice: basePrice,
      currentPrice: basePrice,
      highPrice: basePrice,
      lowPrice: basePrice,
      volume: 0,
      diff: 0,
      changePct: 0,
      isPreMatch: true,
    };
  }

  const openPrice = roundToTen(
    player.openPrice ?? player.priceHistory[0]?.price ?? basePrice
  );
  const currentPrice = roundToTen(
    status === "FT"
      ? player.closePrice ?? player.currentPrice
      : player.currentPrice
  );

  return {
    basePrice,
    openPrice,
    currentPrice,
    highPrice: roundToTen(player.highPrice ?? Math.max(openPrice, currentPrice)),
    lowPrice: roundToTen(player.lowPrice ?? Math.min(openPrice, currentPrice)),
    volume: player.volume ?? 0,
    diff: calculateDiffFromOpen(currentPrice, openPrice),
    changePct: calculateChangePercentFromOpen(currentPrice, openPrice),
    isPreMatch: false,
  };
}

/**
 * Single holding-to-Player resolver shared by PortfolioTabView, RightQuickRail,
 * and TopAssetHeader so dynamic / API-Football holdings never vanish after reload.
 */
export function resolveHoldingPlayer(
  holding: Holding,
  players: readonly Player[],
  transactions: readonly PointTransaction[],
  playerPrices: Readonly<Record<string, PersistedPlayerPrice>>
): Player {
  const matchedById = players.find((p) => p.id === holding.playerId);
  if (matchedById) return matchedById;

  const latestTx = transactions.find((t) => t.playerId === holding.playerId);
  const fallbackName = latestTx?.playerName ?? "";
  const fallbackTeamShort = latestTx?.teamShort ?? "CLB";

  if (fallbackName) {
    const matchedByName = players.find(
      (p) =>
        p.name.trim() === fallbackName.trim() ||
        doesPlayerNameMatch(p, fallbackName)
    );
    if (matchedByName) return matchedByName;
  }

  const savedPrice = playerPrices[holding.playerId];
  const fallbackBase = roundToTen(
    savedPrice?.openPrice ?? holding.avgBuyPrice ?? 10000
  );
  const fallbackCurrent = roundToTen(
    savedPrice?.currentPrice ?? holding.avgBuyPrice ?? fallbackBase
  );
  const tierCfg = getTierConfig(fallbackBase);

  return {
    id: holding.playerId,
    name: fallbackName || "선수",
    englishName: fallbackName || "Player",
    nationalTeam: "",
    matchId: holding.matchContext?.matchId ?? "unknown",
    teamId: fallbackTeamShort.toLowerCase(),
    teamName: fallbackTeamShort,
    teamShort: fallbackTeamShort,
    teamColor: "#0F172A",
    position: "CM",
    backNumber: 10,
    tier: tierCfg.tier,
    totalShares: tierCfg.totalShares,
    marketSupply: tierCfg.marketSupply,
    basePrice: fallbackBase,
    openPrice: fallbackBase,
    initialPrice: fallbackBase,
    currentPrice: fallbackCurrent,
    previousPrice: roundToTen(savedPrice?.previousPrice ?? fallbackCurrent),
    priceHistory: savedPrice?.priceHistory ?? [
      {
        minute: 0,
        timeLabel: "0'",
        price: fallbackBase,
        changePercentFromOpen: 0,
      },
    ],
    lastEvent: {
      text: "보유 종목 시세 연동",
      sentiment: "neutral",
      minute: 0,
    },
    stats: {
      rating: 7.0,
      goals: 0,
      assists: 0,
      shotsOnTarget: 0,
      keyPasses: 0,
    },
  };
}
