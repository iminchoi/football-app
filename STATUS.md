# STATUS

## Current State
- Estimated MVP completion: ~99% (Consolidated `src/lib/priceEngine.ts` SSOT, `node:test` unit suite, and multi-seed PASS/FAIL balance simulator completed).
- Verification: `npx tsc --noEmit` passes (0 errors); `node --test tests/priceEngine.test.ts` passes (5/5); `src/lib/priceEngine.ts` has 0 `Date.now` / `new Date` occurrences.
- Balance baseline (`node scripts/simulateBalance.ts`, 1,000 matches x 5 seeds, current v2.1 weights): exit code 1 (`FAIL` on all 3 targets: Intraday ±30% Hit 0.02% vs `[0.5%, 10%]`, Max Spread 2.26%p vs `<= 1.0%p`, |Overall Mean| 0.76% vs `<= 0.5%`).

## Recent Changes
- `src/lib/priceEngine.ts`, `src/utils/tier.ts`, `src/store/useTradeStore.ts`, `src/components/MatchEventTimeline.tsx`, `src/components/TradeBottomSheet.tsx`, `src/components/market/MatchTimelineChart.tsx`, `src/components/market/FullScreenCandleChartModal.tsx`: removed legacy `src/utils/priceEngine.ts`, consolidated all SSOT logic into `src/lib/priceEngine.ts`, and added configurable `capLimit` parameter.
- `tests/priceEngine.test.ts`: added 5 `node:test` specs covering goal priority, rawReturn clamp preservation, unused bench 0%, determinism, and stats/timeline/marker SSOT parity.
- `scripts/simulateBalance.ts`: added `--matches`, `--seeds`, `--cap`, 95% CI per position, p50/p90/p99 intraday peak distribution, `0.15/0.20/0.30` cap comparison table, and PASS/FAIL exit code 1 enforcement.

## Known Issues & Next Steps
1. **Priority 1 — Weight re-tuning**: adjust v2.1 weights so `simulateBalance.ts` passes all 3 thresholds (raise ±30% hit rate into `[0.5%, 10%]`, compress position spread to `<= 1.0%p`, and center overall mean within `±0.5%`).
2. **Priority 2 — Real API key verification**: configure `FOOTBALL_DATA_API_KEY` in `.env.local` to test live match lineups and event ingestion.
