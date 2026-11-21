# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), strict event-only substitution/card badges (`lineupStatus.ts`), unified Korean-first player display name resolution (`playerDisplayName.ts`), manager strip (`교체명단`), match sync (`matchSync.ts`), and `v2.5` pricing engine (`weights.ts`, `priceEngine.ts` v2.5 constants, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts` (48/48 passing).

## Recent Changes
- `src/lib/priceEngine.ts`: Preserved `pt.event.source` when extracting `priceHistory` events in `extractInitialMatchEvents` and skipped `SUB_IN`/`SUB_OUT`/`SUB` markers so substitution points are never converted into `YELLOW_CARD` or `ASSIST`.
- `src/lib/lineupStatus.ts`: Added `hasConflictingAuthoritativeIds` guard in `doesIdentityMatchPlayer` to block same-team/cross-team alias collisions between distinct authoritative player IDs while preserving curated multi-ID and cross-namespace matches.
- `src/store/useTradeStore.ts`: Scoped `applyPersistedPrices`, `ensurePlayerInStore`, and `syncPlayersFromMatches` against conflicting authoritative IDs, opposite-team lineup/event binding, explicit `match.events` SSOT leaks, and blocked card/sub events on `UPCOMING`/`SCORE_ONLY`/dummy-lineup matches.
- `tests/lineupStatus.test.ts`: Added regression tests for `priceHistory` `SIMULATED` source preservation, `SUB_*` non-fabrication, and distinct authoritative ID collision blocking.

## Known Issues & Next Steps
- Run an interactive browser UI check on `/` across live/HT/FT/past/future dates and Newcastle vs Arsenal lineup/chart panels if visual verification is requested.
