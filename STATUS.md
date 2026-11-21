# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), strict event-only substitution/card badges (`lineupStatus.ts`), unified Korean-first player display name resolution (`playerDisplayName.ts`), manager strip (`교체명단`), match sync (`matchSync.ts`), and `v2.5` pricing engine (`weights.ts`, `priceEngine.ts`, `SimulatedEventsProvider.ts`, `.cache/ledger.json` untouched) are working.
- Verified with `npx tsc --noEmit` (0 errors) and `node --experimental-strip-types --test tests/*.test.ts`.

## Recent Changes
- `src/lib/lineupStatus.ts`: Extended strict `SCORE_ONLY` and `usesDummyLineup` gating across all card/substitution resolution paths (`match.events`, `providerPlayerEvents`, `player.events`/`priceHistory`, and lineup metadata).
- `src/store/useTradeStore.ts`, `src/app/page.tsx`: Returned canonical resolved player IDs from `ensurePlayerInStore` / `selectPlayer` so selecting a canonicalized cross-ID player always opens the trade/chart panel; added `canonicalizeTeamKey` club matching in `doesPlayerBelongToTeam`; blocked invalid-minute (`< 1`) and `SCORE_ONLY`/dummy-lineup card/sub event bindings in `syncPlayersFromMatches`.
- `src/components/matches/FormationPitchModal.tsx`, `src/components/portfolio/PortfolioTabView.tsx`: Prevented duplicate canonicalized starter/bench/synthetic lineup players, reset stale fields on `usesDummyLineup` matches while preserving same-match upcoming captains, and added cross-script holding name matching.
- `tests/lineupStatus.test.ts`, `tests/playerDisplayName.test.ts`: Added regression tests for `SCORE_ONLY`/`usesDummyLineup` card/sub badge suppression and cross-script lineup entry lookup.

## Known Issues & Next Steps
- Run an interactive browser UI check on `/` across live/HT/FT/past/future dates and Newcastle vs Arsenal lineup/chart panels if visual verification is requested.
