import { Holding, Player, PlayerTier } from "@/types";

export interface TierConfig {
  tier: PlayerTier;
  totalShares: number;
  marketSupply: number;
  volatilityMultiplier: number;
}

export function getTierConfig(basePrice: number): TierConfig {
  if (basePrice >= 18000) {
    return {
      tier: "S",
      totalShares: 500,
      marketSupply: 80,
      volatilityMultiplier: 1.2,
    };
  }
  if (basePrice >= 12000) {
    return {
      tier: "A",
      totalShares: 1000,
      marketSupply: 300,
      volatilityMultiplier: 1.4,
    };
  }
  if (basePrice >= 5000) {
    return {
      tier: "B",
      totalShares: 2500,
      marketSupply: 1000,
      volatilityMultiplier: 1.7,
    };
  }
  return {
    tier: "C",
    totalShares: 5000,
    marketSupply: 3500,
    volatilityMultiplier: 2.2,
  };
}

/**
 * 단일 사용자 환경에서 선수의 시장 잔여 수량을 정적 marketSupply와 현재 보유 수량(holdings)으로부터 동적 계산합니다.
 */
export function getAvailableShares(
  player: Pick<Player, "id" | "marketSupply">,
  holdings: Record<string, Holding>
): number {
  return Math.max(
    0,
    player.marketSupply - (holdings[player.id]?.quantity ?? 0)
  );
}

