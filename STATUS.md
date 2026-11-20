# STATUS

## Current State
- Estimated MVP completion: ~99% (v2.2 weight table extracted to `src/lib/weights.ts` and stepwise `cap=0.20` tuning experiments completed).
- Verification: `npx tsc --noEmit` passes (0 errors); `node --test tests/priceEngine.test.ts` passes (5/5).
- Balance status (`node scripts/simulateBalance.ts --cap 0.20`, v2.2 final): `IntradayHit 0.31%` (`FAIL`, target `[0.5%, 10%]`), `MaxSpread 1.15%p` (`FAIL`, target `<= 1.0%p`), `|OverallMean| 0.80%` (`FAIL`, target `<= 0.5%`).

## Recent Changes
- `src/lib/weights.ts`, `src/lib/priceEngine.ts`, `tests/priceEngine.test.ts`: extracted canonical `WEIGHTS` constant table (`CAP_LIMIT: 0.2`, `EQUALIZER_OR_GO_AHEAD: 0.13`, `OPENER: 0.085`, `EXTEND_LEAD: 0.06`, `ASSIST: 0.045`, `TEAM_GOAL: 0.005`, `TEAM_CONCEDED.GK_OR_DF: -0.015`, `CLEAN_SHEET_45: 0.015`, `CLEAN_SHEET_75: 0.02`) and wired both engine and unit tests to import it.

## Known Issues & Next Steps
1. **Priority 1 — Balance tuning follow-up**: current v2.2 weights improved `MaxSpread` from `2.24%p` to `1.15%p` (but still > `1.0%p`), `|OverallMean|` is `+0.80%` (> `0.5%`), and `±20%` hit rate is `0.31%` (< `0.5%`). Further lowering positive drift or using `±15%` cap (`1.39%` hit rate) can bring all 3 criteria into PASS.
2. **Priority 2 — Real API key verification**: configure `FOOTBALL_DATA_API_KEY` in `.env.local`.
