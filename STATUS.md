# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), strict event-only substitution/card badges (`lineupStatus.ts`), unified Korean-first player display name resolution (`playerDisplayName.ts`), manager strip (`교체명단`), match sync (`matchSync.ts`), and `v2.5` pricing engine (`weights.ts`, `priceEngine.ts`, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts`.

## Recent Changes
- `src/lib/lineupStatus.ts`, `src/store/useTradeStore.ts`, `src/components/matches/FormationPitchModal.tsx`, `src/components/matches/MatchAccordionCard.tsx`: Enforced strict event-only gating for substitution (`←` / `→`), re-substitution, yellow card, and red card badges; blocked stale/fallback/cross-match/simulated/estimated/ScoreOnly/upcoming badge leakage; prevented random market ticks and click handlers from fabricating card or substitution events; fixed yellow/red card double-counting during match sync.
- `src/lib/playerDisplayName.ts` and UI consumers (`FormationPitchModal.tsx`, `MatchAccordionCard.tsx`, `MarketChartTabView.tsx`, `MatchTimelineChart.tsx`, `FullScreenCandleChartModal.tsx`, `TopAssetHeader.tsx`, `PlayerDetailModal.tsx`, `RightTradeDockPanel.tsx`, `TradeBottomSheet.tsx`, `RightQuickRail.tsx`, `PortfolioTabView.tsx`, `PlayerAvatar.tsx`, `AdminPanel.tsx`, `useTradeStore.ts`): Unified mixed Korean/English player names under canonical Korean full/pitch labels with diacritic-folding cross-script identity matching (`Ødegaard`, `Dedić`, `Guimarães`, `Schär`, `Hincapié`) and East Asian family-name-first pitch labels without breaking ID or event matching.
- `tests/lineupStatus.test.ts`, `tests/playerDisplayName.test.ts`: Added unit tests covering strict event-only badge gating, cross-script event matching, unified Korean/English name resolution across pitch/bench/chart, and surname collision protection.

## Known Issues & Next Steps
- Run an interactive browser UI check on `/` across live/HT/FT/past/future dates and Newcastle vs Arsenal lineup/chart panels if visual verification is requested.
