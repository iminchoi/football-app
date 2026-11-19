# STATUS

## Current State
- Estimated MVP completion: ~99% (PRE -> Last Match FT instant review toggle implemented across `priceEngine.ts`, `MatchTimelineChart.tsx`, and `FullScreenCandleChartModal.tsx`).
- Verification: `npx tsc --noEmit --incremental false` passes with 0 errors; `src/` contains zero `any`, `@ts-ignore`, or `eslint-disable`.
- Working features: 3-tab mobile UI (`MATCHES`, `PORTFOLIO`, `MARKET`), DEMO header badge, multi-account local auth & share supply, SSOT `MatchEvent[]` price/candle/timeline derivation (`src/utils/priceEngine.ts`) with `UPCOMING`/`PRE` freeze guard and `resolveLastMatchReview`, Soft Ivory Green `lightweight-charts` terminal with `[캔들 | 라인]` & `[오늘 경기 (PRE) | 지난 경기 (FT)]` toggles, `<TradeBottomSheet />`, and Football-Data.org v4 API route.

## Recent Changes
- `src/utils/priceEngine.ts`: added `resolveLastMatchReview` to deterministically derive 0'~90' FT review data and opponent label for `PRE` players.
- `src/components/market/MatchTimelineChart.tsx` & `src/components/market/FullScreenCandleChartModal.tsx`: added `[오늘 경기 (PRE) | 지난 경기 (FT)]` toggle, `📊 지난 경기 시세 차트 바로 보기 →` CTA inside the `PRE` overlay card, and `LAST MATCH · FT` context badge while keeping pre-market orders bound to today's match.

## Known Issues & Next Steps
1. **Priority 1 — Browser UI & E2E verification**: verify `PRE` -> `LAST_FT` switching, `LAST MATCH · FT` badge, and pre-market order flow on 390x844 mobile viewport.
2. **Priority 2 — Real API key verification**: configure `FOOTBALL_DATA_API_KEY` in `.env.local` to test live match lineups and event ingestion.
3. **Priority 3 — Server-side persistence**: migrate accounts, holdings, and market supply from `localStorage` to a backend database for multi-device sync.
