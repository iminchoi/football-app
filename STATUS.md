# STATUS

## Current State
- Estimated MVP completion: ~99% (Past-date match status normalization, position event whitelist, and streamlined PRE pitch-view flow completed).
- Verification: `npx tsc --noEmit` passes with 0 errors; `src/` contains zero `any`, `@ts-ignore`, `eslint-disable`, or `console.*`.
- Working features: 3-tab mobile UI (`MATCHES`, `PORTFOLIO`, `MARKET`), DEMO header badge, multi-account local auth & share supply, SSOT `MatchEvent[]` price/candle/timeline derivation (`src/utils/priceEngine.ts`) with strict position event whitelists, direct PRE pitch-view navigation, and Football-Data.org v4 API route.

## Recent Changes
- `src/components/matches/MatchesTabView.tsx`, `src/components/matches/MatchAccordionCard.tsx`: forced past-date matches (`matchDate < today`) to `FT` (`경기 종료 (FT)`), prevented live store overlay on past `FT` matches, and removed intermediate PRE preview cards so clicking a `PRE` match opens the pitch view directly.
- `src/components/matches/FormationPitchModal.tsx`: removed the duplicate pre-kickoff confirmation screen and kept a single top status chip (`예상 선발 · 킥오프 45분 전 공식 라인업 확정`).
- `src/types/index.ts`, `src/utils/priceEngine.ts`, `src/data/dummyData.ts`, `src/store/useTradeStore.ts`, `src/components/market/MatchTimelineChart.tsx`, `src/components/market/FullScreenCandleChartModal.tsx`: added `CONCEDED`, `DEFENSIVE_ACTION`, `KEY_PLAY`, `BIG_CHANCE_MISS` and enforced `POSITION_EVENT_WHITELIST` so `SAVE` is strictly GK-only.

## Known Issues & Next Steps
1. **Priority 1 — Browser UI & E2E verification**: verify past-date `FT` badges, position-specific events (e.g. Kim Min-jae `DF` actions), and direct `PRE` pitch-view flow on `390x844` mobile viewport.
2. **Priority 2 — Real API key verification**: configure `FOOTBALL_DATA_API_KEY` in `.env.local` to test live match lineups and event ingestion.
3. **Priority 3 — Server-side persistence**: migrate accounts, holdings, and market supply from `localStorage` to a backend database for multi-device sync.
