## Current State
- PitchTrade v2.4 expectation-deduction pricing implemented (`src/lib/weights.ts` `RATES`, `src/lib/priceEngine.ts` `expectedReturn` & `buildPriceSeries`, `scripts/simulateBalance.ts`).
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --test tests/priceEngine.test.ts tests/orderGate.test.ts tests/tradeStore.test.ts` passes (15/15).
- `WEIGHTS` and pass/fail constants remain unchanged; v2.4 verification reported as-is (`FAIL` only on starter `FW` upper 95% CI `<= 1.0%` cell bound).

## Recent Changes
- `src/lib/weights.ts`: Added `RATES` expected per-match event rates by position group (`FW`/`MF`/`DF`/`GK`).
- `src/lib/priceEngine.ts`: Added pure `expectedReturn(pos, teamAttack, oppDefense)` and integrated `E * (minute / 90)` deduction into `buildPriceSeries` and `calculateCumulativeReturn` (`rawReturn`/`clampedReturn` preserved, `0` deduction at `m=0`).
- `tests/priceEngine.test.ts`: Added tests for `E=0` equivalence, full-time deduction equality at `m=90`, and `expectedReturn` determinism.
- `scripts/simulateBalance.ts`: Added 4×9 Pos×Matchup starter 95% CI table, v2.3 vs v2.4 comparison, and `RATES ±20%` sensitivity runs across seeds `9001..9005` and default seeds.

## Known Issues & Next Steps
- On seeds `9001..9005`, v2.4 passes Intraday Hit (`0.99%`), Position Spread (`0.24%p`), and `|Overall Mean|` (`0.00%`), but starter `FW/S-W` (`+1.12% ± 0.30%`, upper CI `1.41%`) fails `<= 1.0%` because `RATES` reflects all participants (starters + subs) rather than starter-only minute share.
- Next: Decide whether to add starter-only minute scaling in `RATES` / `expectedReturn` or keep `RATES` as all-participant baseline.
