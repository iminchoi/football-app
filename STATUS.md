# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), substitution/card badges (`lineupStatus.ts`), manager strip (`교체명단`), and `v2.5` pricing engine (`WEIGHTS`, `priceEngine.ts`, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- Unified today match deduplication/merging and single-source match clock (`PRE` / `1H` / `HT` / `2H` / `FT`) and score (`homeScore : awayScore`) synchronization are implemented in `src/lib/matchSync.ts` and connected across API, store, schedule cards, lineup/pitch modal, market summary, charts, and header.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts` (33/33 passing).

## Recent Changes
- `src/lib/matchSync.ts`, `src/lib/lineupStatus.ts`: Added canonical team/date fixture deduplication (`deduplicateMatches`, `enrichMatchFromFixture`, `mergePinnedFixturesForToday`, `resolveFetchedMatchesForDate`) so pinned today fixtures merge into matching live API games without duplicating cards while keeping live `SCORE_ONLY` data isolated from static fixture events; added single-source `resolveMatchClock`, `resolveMatchScore`, `resolveSyncedMatch`, `resolveSyncedMatchFromContext`, and `resolveMatchForPlayerView`.
- `src/app/api/matches/route.ts`, `src/types/index.ts`, `src/store/useTradeStore.ts`: Deduplicated API match payloads, normalized `PAUSED`/`FT` minutes, preserved `rawStatus` on `ActiveMatchContext`, unified `fetchTodayMatches` and `MatchesTabView` through `resolveFetchedMatchesForDate`, and kept `matches`, `todayMatches`, and `activeMatchContext` synchronized on sync, ticks, and goal events.
- `src/components/matches/MatchesTabView.tsx`, `src/components/matches/MatchAccordionCard.tsx`, `src/components/matches/FormationPitchModal.tsx`, `src/components/market/MarketChartTabView.tsx`, `src/components/market/MatchTimelineChart.tsx`, `src/components/market/FullScreenCandleChartModal.tsx`, `src/components/TopAssetHeader.tsx`, `src/components/RightTradeDockPanel.tsx`, `src/components/TradeBottomSheet.tsx`: Connected all views and order panels to the single match clock and score resolvers.
- `tests/matchSync.test.ts`, `tests/lineupStatus.test.ts`: Added and updated unit tests for duplicate today fixture prevention, `SCORE_ONLY` isolation, and cross-view clock/score consistency.

## Known Issues & Next Steps
- Proceed with `02_badges_and_lang` or run an interactive browser UI pass on `/` to verify visual rendering across live/HT/FT states.
