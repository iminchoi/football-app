# STATUS

## Current State
- Estimated MVP completion: ~99% (Economic Engine v2.1 weight tuning, isolated `orderGate.ts` circuit breaker module, and Poisson 100-match balance simulator completed).
- Verification: `npx tsc --noEmit` passes with 0 errors; `node scripts/simulateBalance.ts --seed=20261119` (100 matches / 2,978 participants) reports 0.00% ±30% hits, FW +1.80% / MF +1.33% / DF -0.40% / GK +0.17% (2.20%p spread), +0.207% post-event 10m drift, and +0.79% aggregate point change.
- Working features: pure deterministic `src/lib/priceEngine.ts` v2.1, time-independent `src/lib/orderGate.ts`, cash-bounded trading, unified inline Soft Ivory Green pitch, and minimal jersey `PlayerAvatar`.

## Recent Changes
- `src/lib/priceEngine.ts`, `src/utils/priceEngine.ts`: tuned v2.1 weights (`LINEUP_CONFIRMED` 0%, `GOAL` +12%/+9.5%/+7% +2% DF/GK, `ASSIST` +5.5%, `KEY_ACTION` +1.5% / GK +0.8%, `TEAM_CONCEDED` -2.2%/-1.0%, `YELLOW_CARD` -2.5%, `RED_CARD` -15.0%) and seeded quiet noise by `(playerId, matchId, minute)`.
- `src/lib/orderGate.ts`, `src/store/useTradeStore.ts`, `src/components/RightTradeDockPanel.tsx`, `src/components/TradeBottomSheet.tsx`: extracted `API_LATENCY_BUFFER_SEC = 30` and `isCircuitBreakerActive` from `priceEngine.ts`.
- `scripts/simulateBalance.ts`: added `--seed` PRNG, `Poisson(1.4)` goals, 60/30/9/1 scorer weights, 70% assist, 15% YC, 0.5% RC, 3~5 subs (`55~85'`), and 4-part balance telemetry.

## Known Issues & Next Steps
1. **Priority 1 — Browser UI & E2E verification**: verify v2.1 price updates and `orderGate` 30s lock on desktop (`1380px`) and mobile (`390x844`).
2. **Priority 2 — Real API key verification**: configure `FOOTBALL_DATA_API_KEY` in `.env.local` to test live match lineups and event ingestion.
3. **Priority 3 — Server-side persistence**: migrate accounts, holdings, and transactions from `localStorage` to a backend database.
