# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), substitution/card badges (`lineupStatus.ts`), manager strip (`교체명단`), and `v2.5` pricing engine (`WEIGHTS`, `priceEngine.ts`, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- Unified today match deduplication/merging and single-source match clock (`PRE` / `1H` / `HT` / `2H` / `FT`) and score (`homeScore : awayScore`) synchronization in `src/lib/matchSync.ts` are audited and connected across API, store, schedule cards, lineup/pitch view, market summary, charts, header, trade panels, and player detail modal.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts`.

## Recent Changes
- `src/lib/matchSync.ts`, `src/types/index.ts`, `src/app/api/matches/route.ts`: Fixed `FCB` TLA collision (`FC Barcelona` -> `BAR` vs `FC Bayern München` -> `BAY`), added future-date normalization (`normalizeFutureMatches`) and multi-day past fallback handling, prevented non-null `match` from inheriting stale `fallbackContext` status/scores, isolated cross-date/unrelated contexts in `resolveSyncedMatch`, `resolveSyncedMatchFromContext`, and `resolveMatchForPlayerView`, and aligned `buildActiveMatchContext` and `mapApiStatus` for `PAUSED`/`HT`/`HALF_TIME`/`AWARDED`/`POSTPONED`.
- `src/store/useTradeStore.ts`, `src/lib/lineupStatus.ts`, `src/components/matches/FormationPitchModal.tsx`, `src/components/matches/MatchesTabView.tsx`, `src/components/PlayerDetailModal.tsx`: Guarded `syncPlayersFromMatches` against past/future date views clobbering today's live fixtures, aligned `buyPlayer`/`sellPlayer`/`tickMarket`/`triggerMatchEvent` and `PlayerDetailModal` `SCORE_ONLY` checks onto `matchSync` resolvers, and paused live ticks during `HT`.
- `tests/matchSync.test.ts`: Added unit tests covering `FCB` disambiguation, future-date `AMATCH_FALLBACK` normalization, multi-day past fallback, cross-date isolation, `POSTPONED`/`HALF_TIME`/`AWARDED` rawStatuses, and stale/unrelated context isolation.

## Known Issues & Next Steps
- Proceed with `02_badges_and_lang` or run an interactive browser UI check on `/` across live/HT/FT/past/future dates.
