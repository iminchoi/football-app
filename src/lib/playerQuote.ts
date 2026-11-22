import type { MatchStatus, Player } from "../types/index.ts";
import {
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
  roundToTen,
} from "./priceEngine.ts";

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
