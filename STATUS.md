# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), substitution/card badges (`lineupStatus.ts`), manager strip (`교체명단`), and `v2.5` pricing engine (`WEIGHTS` untouched) are working.
- `m-new-ars` (`Newcastle vs Arsenal`) stays pinned to today's match list alongside live API fixtures (`fd-*`), with expanded inline pitch + `교체명단` + managers rendered immediately.
- Verified with `npx tsc --noEmit --incremental false`, `node --experimental-strip-types --test tests/*.test.ts` (27/27 pass), and `npm run build` (Next.js 15.5.28 production build + lint pass).

## Recent Changes
- `src/lib/lineupStatus.ts` & `tests/lineupStatus.test.ts`: Added `PINNED_TODAY_FIXTURE_IDS` and `mergePinnedFixturesForToday` to inject `m-new-ars` on today's date only (tested).
- `src/components/matches/MatchesTabView.tsx` & `src/store/useTradeStore.ts`: Merged pinned today fixtures across API/fallback fetch paths (`fetchMatchesByDate`, `fetchTodayMatches`) and locked `syncPlayersFromMatches` event binding to `p.matchId === match.id`.
- `src/components/matches/FormationPitchModal.tsx`: Replaced effect-delayed lineup state with immediate `useMemo`, and kept `data-testid="bench-managers-section"` visible with `"감독 정보 미제공"` fallback.
- `src/components/matches/MatchAccordionCard.tsx` & `src/components/market/MarketChartTabView.tsx`: Auto-opened inline pitch for `m-new-ars`, added status badges to key player rows, matched `p.matchId === match.id` in `pickTop3`, and added Newcastle/Arsenal to `EplTeams`.

## Known Issues & Next Steps
- Live `football-data.org` free-tier `fd-*` matches remain in `SCORE_ONLY` mode (`usesDummyLineup: true`, no event/lineup/coach feed from upstream).
- Perform an interactive UI pass in the browser on `/` to inspect desktop and mobile rendering of `m-new-ars` pitch, bench, and `감독` badges.
