## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); `todayMatches` pre-fetched on app mount (`page.tsx`) into `useTradeStore` and rendered in `MarketChartTabView` with loading skeleton instead of stale dummy fixtures.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --test` passes (20/20).

## Recent Changes
- `src/store/useTradeStore.ts`: Added `todayMatches`, `isLoadingTodayMatches`, `hasFetchedTodayMatches`, and deduplicated `fetchTodayMatches` action.
- `src/app/page.tsx`: Triggered `fetchTodayMatches()` immediately on app mount.
- `src/components/market/MarketChartTabView.tsx`: Subscribed directly to store `todayMatches`; removed old `INITIAL_MATCHES` fallback and rendered loading skeleton (`경기 일정을 불러오는 중...`) until loaded.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
