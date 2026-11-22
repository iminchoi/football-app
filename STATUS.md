# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), event-only substitution/card badges (`lineupStatus.ts`), Korean-first player names (`playerDisplayName.ts`), match sync (`matchSync.ts`), and `v2.5` pricing engine (`weights.ts`, `priceEngine.ts` constants, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- PRE (`UPCOMING`) fixtures accept BUY/SELL at the base price; quotes, pitch/bench nodes, chart baseline, portfolio valuation, and executed price share one resolver (`playerQuote.ts`) and preserve `Holding.matchContext` across reselection.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts` (58/58 passing).

## Recent Changes
- `src/lib/playerQuote.ts`: Added `resolvePlayerQuote(player, status)` pinning PRE (`UPCOMING`) open/current/high/low to `basePrice` with zero change, LIVE to `currentPrice`, and FT to `closePrice`.
- `src/lib/matchSync.ts`: Updated `resolveMatchForPlayerView` so `activeMatchContext` only overrides a player's direct `matchId` when it refers to the same fixture (or when no direct fixture exists in `storeMatches`).
- `src/types/index.ts` & `src/store/useTradeStore.ts`: Added `Holding.matchContext`; persisted context on `buyPlayer` and restored it in `selectPlayer`/`sellPlayer`; resolved `selectPlayer` after `ensurePlayerInStore` and recovered clicked fixture context on cross-match IDs; pinned PRE quotes to `basePrice` in `tickMarket`, `applyPersistedPrices`, and `ensurePlayerInStore`.
- `TradeBottomSheet.tsx`, `RightTradeDockPanel.tsx`, `MatchTimelineChart.tsx`, `FullScreenCandleChartModal.tsx`, `PortfolioTabView.tsx`, `RightQuickRail.tsx`, `TopAssetHeader.tsx`, `FormationPitchModal.tsx`, `MatchAccordionCard.tsx`, `MarketChartTabView.tsx`: Unified quote/open/close/change rendering with `resolvePlayerQuote`, reset timeline chart view to `MATCH_TIMELINE` on player change, and aligned PRE pitch/bench node quotes with `basePrice` (`0.00%`).
- `tests/preMatchConsistency.test.ts`: Added unit tests covering PRE quote pinning, PRE BUY/SELL execution, cross-fixture context isolation, PRE candle/timeline baseline, and `Holding.matchContext` portfolio reselection.

## Known Issues & Next Steps
- Run an interactive browser UI verification of the PRE click → buy → portfolio/quick-rail/pitch reselection flow if visual confirmation is requested.
