import type { Holding, Player, PlayerTier, StoredUserAccount } from "../types";

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
 * Remaining market supply: `marketSupply` minus shares held across all accounts.
 * The active account is read from live `holdings` and skipped in `accounts`,
 * whose persisted snapshot may be stale, so its shares are never counted twice.
 */
export function getAvailableShares(
  player: Pick<Player, "id" | "marketSupply">,
  holdings: Record<string, Holding>,
  accounts: Record<string, StoredUserAccount> = {},
  activeAccountKey?: string
): number {
  let held = holdings[player.id]?.quantity ?? 0;
  for (const [key, account] of Object.entries(accounts)) {
    if (key === activeAccountKey) continue;
    held += account.holdings?.[player.id]?.quantity ?? 0;
  }
  return Math.max(0, player.marketSupply - held);
}

