# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), strict event-only substitution/card badges (`lineupStatus.ts`), unified Korean-first player display name resolution (`playerDisplayName.ts`), manager strip (`교체명단`), match sync (`matchSync.ts`), and `v2.5` pricing engine (`weights.ts`, `priceEngine.ts` v2.5 constants, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts` (46/46 passing).

## Recent Changes
- `src/lib/priceEngine.ts`, `src/app/api/matches/route.ts`: Stopped `extractInitialMatchEvents` from fabricating `YELLOW_CARD` from negative price diffs on non-`pitch-` players; preserved explicit empty `events: []` arrays on API matches.
- `src/lib/lineupStatus.ts`, `src/components/matches/FormationPitchModal.tsx`, `src/components/matches/MatchAccordionCard.tsx`: Scoped lineup entry and match-event resolution to `teamSide` to block cross-team badge leaks, guarded orphan `pitch-*` fallback status, prevented synthetic slot name collisions, and deduplicated key player rows by canonical display name.
- `src/lib/playerDisplayName.ts`, `src/store/useTradeStore.ts`: Added Turkish `ı`/`İ` folding and generational suffix (`Jr.`/`Sr.`/`II`/`III`) pitch label handling; canonicalized stored/initial player names and filtered stale/simulated persisted card/sub events on click/sync/rehydration.
- `tests/lineupStatus.test.ts`, `tests/playerDisplayName.test.ts`: Added regression tests for non-`pitch-` negative diff card suppression, team-side badge scoping, orphan `pitch-*` isolation, Turkish diacritic folding, and generational suffix pitch labels.

## Known Issues & Next Steps
- Run an interactive browser UI check on `/` across live/HT/FT/past/future dates and Newcastle vs Arsenal lineup/chart panels if visual verification is requested.
