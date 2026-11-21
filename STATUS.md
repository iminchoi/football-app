# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), substitution/card badges (`lineupStatus.ts`), manager strip (`교체명단`), and `v2.5` pricing engine (`WEIGHTS`, `priceEngine.ts`, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- Unified today match deduplication/merging and single-source match clock (`PRE` / `1H` / `HT` / `2H` / `FT`) and score (`homeScore : awayScore`) synchronization in `src/lib/matchSync.ts` are audited and connected across API, store, schedule cards, lineup/pitch view, market summary, charts, header, trade panels, and player detail modal.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts` (36/36 passing).

## Recent Changes
- `src/lib/matchSync.ts`: Isolated static fixture events/lineup badges from `UPCOMING` and API-backed matches in `enrichMatchFromFixture`, stripped lineup match events in `normalizeFutureMatches`, made `finalizePastMatches`/`normalizeFutureMatches` timezone-safe across UTC/KST/local dates, and preferred `LIVE` matches in `resolveSyncedMatchFromContext` team-pair fallback.
- `src/store/useTradeStore.ts`, `src/components/matches/MatchesTabView.tsx`: Deduplicated `todayMatches` in `setTodayMatches` and `syncPlayersFromMatches`, restricted existing-player card/sub metadata updates to same-match records, and passed `todayStr` into `MatchesTabView` `resolveSyncedMatch`.
- `src/components/market/MatchTimelineChart.tsx`, `src/components/market/FullScreenCandleChartModal.tsx`: Aligned HT indicator styling in `MatchTimelineChart` and displayed synced match score (`resolveMatchScore`) alongside clock in `FullScreenCandleChartModal`.
- `tests/matchSync.test.ts`: Added unit tests for static fixture isolation on `UPCOMING`/API matches, future lineup badge stripping, KST midnight kickoff preservation, and `LIVE`-first context fallback.

## Known Issues & Next Steps
- Proceed with `02_badges_and_lang` or run an interactive browser UI check on `/` across live/HT/FT/past/future dates.
