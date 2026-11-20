# STATUS

## Current State
- Estimated MVP completion: ~99% (PitchTrade v2.3 economic engine ALL PASS at `cap=0.15` and UI/order guards synchronized).
- Verification: `npx tsc --noEmit` passes (0 errors); `node --test tests/priceEngine.test.ts` passes (5/5); `node scripts/simulateBalance.ts` exits with code 0 (`ALL PASS`: Intraday ±15% Hit `1.21%`, Max Spread `0.90%p`, |Overall Mean| `0.50%`).
- Working features: `src/lib/weights.ts` v2.3 (`CAP_LIMIT: 0.15`), `src/lib/priceEngine.ts` SSOT, `src/lib/orderGate.ts` 30s circuit breaker, FT settlement order lock, ±15% cap/floor order guards, and lineup reference pricing.

## Recent Changes
- `src/lib/weights.ts`, `scripts/simulateBalance.ts`: tuned v2.3 (`CAP_LIMIT: 0.15`, `EQUALIZER_OR_GO_AHEAD: 0.12`, `TEAM_CONCEDED.MF_OR_FW: -0.013`, `KEY_ACTION.OUTFIELD: 0.012`, `KEY_ACTION.GK: 0.004`), added position yellow-card probabilities, event contribution table, and early cap-hit telemetry.
- `src/lib/priceEngine.ts`, `src/store/useTradeStore.ts`, `src/components/RightTradeDockPanel.tsx`, `src/components/TradeBottomSheet.tsx`, `src/components/AdminPanel.tsx`, `src/components/matches/MatchesTabView.tsx`, `src/components/matches/FormationPitchModal.tsx`, `src/types/index.ts`: enforced `FT` order lock (`경기 종료 · 정산 완료`), `±15%` upper/lower guards, and pre-match lineup / unused bench `0.00%` display.

## Known Issues & Next Steps
1. **Priority 1 — Browser UI & E2E verification**: verify `FT` order lock, `±15%` upper/lower guard banners, and lineup/bench percentage formatting on desktop (`1380px`) and mobile (`390x844`).
2. **Priority 2 — Real API key verification**: configure `FOOTBALL_DATA_API_KEY` in `.env.local` to test live match lineups and event ingestion.
