## Current State
- PitchTrade v2.5 on-pitch expectation deduction implemented (`src/lib/weights.ts` starter-90m `RATES`, `src/lib/priceEngine.ts` `onPitchMinutes * E90 / 90`, `scripts/simulateBalance.ts` starter/sub split at 5,000 matches/seed).
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --test tests/priceEngine.test.ts tests/orderGate.test.ts tests/tradeStore.test.ts` passes (17/17).
- `WEIGHTS` and pass/fail constants remain unchanged; v2.5 Baseline is **ALL PASS** across both `9001..9005` and default seeds (`20261119..20261523`).

## Recent Changes
- `src/lib/weights.ts`: Redefined `RATES` strictly by formula from simulator 90-min starter probabilities (`4-3-3`, `λ=1.4`).
- `src/lib/priceEngine.ts`: Added `subOutMinute` on `PlayerContext`; `buildPriceSeries` deducts `onPitchMinutes * E90 / 90` (zero while on bench, stops after sub-out or red card).
- `tests/priceEngine.test.ts`: Added tests for bench waiting zero deduction, sub-in/sub-out on-pitch deduction, and 90-min `E90` total deduction.
- `scripts/simulateBalance.ts`: Default `--matches 5000`; separated starter verdict metrics from report-only substitutes; split upper/lower intraday hit rates.

## Known Issues & Next Steps
- Under `RATES -20%` sensitivity scenario, `Position Max Spread` is `1.06%p` (`9001..9005`) / `1.10%p` (default seeds), failing `<= 1.0%p` while `RATES Base` and `RATES +20%` are `ALL PASS`.
- Next: Review whether `v2.5` parameters are ready to freeze for production live feed integration.
