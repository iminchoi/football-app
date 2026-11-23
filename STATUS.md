## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); `ApiFootballProvider` batch-enriches all matches per date via `/fixtures?ids=...` (20 IDs/call) without the 4-match index cap, and `lineupBuilder` prevents dummy star rosters from mixing into API matches or non-433/4231 formations.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (65/65 across all 9 suites).

## Recent Changes
- `src/lib/providers/ApiFootballProvider.ts`: Removed the 4-match `enrichTopDetailsCount` cap and added chunked `/fixtures?ids=...` batch enrichment (`API_FOOTBALL_BATCH_IDS_LIMIT = 20`) for all matches (LIVE/FT prioritized, UPCOMING included when lineups exist).
- `src/app/api/matches/route.ts`, `src/store/useTradeStore.ts`, `src/lib/lineupStatus.ts`: Preserved `af-p-` player IDs and real dashed formations (`3-4-2-1`, `4-4-2`, etc.) on `DEEP_DATA` matches.
- `src/lib/lineupBuilder.ts`, `FormationPitchModal.tsx`, `MatchAccordionCard.tsx`: Extracted pure lineup/formation-row builder, blocked fixed dummy rosters (`FALLBACK_POOL_BY_POSITION`/`BENCH_5_TEMPLATE`) on API-backed or `usesDummyLineup` matches, and added empty-lineup UI notices.
- `tests/apiFootballProvider.test.ts`, `tests/lineupStatus.test.ts`: Added tests for 7+ same-league batch enrichment and real vs empty API lineup rendering.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
