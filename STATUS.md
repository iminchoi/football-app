# STATUS

## Current State
- Estimated MVP completion: ~85% (client-side trading prototype complete; server persistence and live match event ingestion remain).
- Verification: `npx tsc --noEmit` passes with 0 errors; `next dev` compiles cleanly (`GET /` and `GET /api/matches` return HTTP 200).
- Working features: 3-tab mobile UI (`MATCHES`, `PORTFOLIO`, `MARKET`), multi-account local auth & portfolio isolation, 5s market ticker with +/-30% price cap/floor, 0-90' timeline & OHLC candlestick charts, formation pitch view, and Football-Data.org v4 API route with fallback modes.

## Recent Changes
- `src/components/TradeBottomSheet.tsx`: added `timeLabel` fallback (`${minute}'`) in `TICK` series (`TS2322` fix) and wired all-account `availableShares` with `"물량 소진 (Sold Out)"` state.
- `src/app/api/matches/route.ts`: replaced all `any` usages with explicit Football-Data interfaces, narrowed `catch (error: unknown)`, and added `AbortSignal.timeout(8000)` to upstream fetches.
- `src/components/matches/MatchesTabView.tsx`: removed `eslint-disable`, wrapped `fetchMatchesByDate` in `useCallback`, and added `AbortController` request cancellation on rapid date changes and unmount.
- `src/store/useTradeStore.ts` & `src/types/index.ts`: isolated `watchlist` per account across `login`, `signup`, `logout`, `resetAll`, and `toggleWatchlist`; enforced all-account `availableShares` check in `buyPlayer`.
- `src/utils/tier.ts`: updated `getAvailableShares` to sum holdings across all stored accounts without double-counting the active session.
- `src/components/market/MarketChartTabView.tsx`: extended `EPL` league filter to match normalized `"pl-2021"` API league IDs.

## Known Issues & Next Steps
1. **Priority 1 — Sync `MatchAccordionCard` supply badge**: pass `accounts` and active account key to `getAvailableShares` in `src/components/matches/MatchAccordionCard.tsx` so match-card sold-out badges match `TradeBottomSheet`.
2. **Priority 2 — Browser UI & E2E verification**: verify 390x844 mobile layout, rapid date switching, EPL filter, chart period tabs, and multi-account sold-out behavior in a live browser session.
3. **Priority 3 — Real API key & live event binding**: configure `FOOTBALL_DATA_API_KEY` in `.env.local` to verify live lineups/scores and map real match events (goals/cards) to player price ticks.
