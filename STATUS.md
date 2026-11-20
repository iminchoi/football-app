## Current State
- PitchTrade v2.3 economy weights (`src/lib/weights.ts`) verified via out-of-sample simulation (seeds `777..781`, 1,000 matches/seed) with realistic team attack/defense strength spread (`0.8..2.2` Poisson λ).
- `npx tsc --noEmit --incremental false` passes with 0 errors; `node --test tests/priceEngine.test.ts tests/orderGate.test.ts tests/tradeStore.test.ts` passes (12/12).
- `src/data/dummyData.ts` derives `INITIAL_PLAYERS` (`currentPrice`, `priceHistory`, `highPrice`, `lowPrice`, `volume`, `events`, `stats`) deterministically from `priceEngine.ts` SSOT.

## Recent Changes
- `scripts/simulateBalance.ts`: Added `--seed-list`, explicit hit-rate denominator logging, team strength spread, and `bestStrategyMeanPct` (`Strong FW vs Weak <= 1.0%`) verdict.
- `src/components/matches/FormationPitchModal.tsx`: Replaced hardcoded `1.01`/`0.98` pre-match displays with `WEIGHTS.LINEUP_CONFIRMED` and `WEIGHTS.LINEUP_EXCLUDED`.
- `src/components/RightTradeDockPanel.tsx`, `src/components/TradeBottomSheet.tsx`, `src/store/useTradeStore.ts`: Unified FT copy to `"경기 종료 · 거래 마감"`.
- `src/data/dummyData.ts`: Added `finalizeDummyPlayer` deriving all `INITIAL_PLAYERS` fields from `derivePlayerMarketData` and `deriveStatsFromEvents`.
- `src/lib/orderGate.ts`, `tests/orderGate.test.ts`, `tests/tradeStore.test.ts`: Extracted `validateTradeOrder` and added unit tests for FT lock, ±15% cap/floor guards, and 30s circuit breaker.

## Known Issues & Next Steps
- Under out-of-sample seeds `777..781` with team strength spread (`0.8..2.2`), `Overall Mean Return` (`+0.51%` vs `<=0.5%`) and `Best Strategy Mean Return` (`+3.49%` vs `<=1.0%`) fail strict thresholds while keeping `weights.ts` unchanged.
- Next: Decide whether to introduce pre-match pricing/handicap adjustment for strong-vs-weak matchups or tune `weights.ts` to absorb team-strength skew.
