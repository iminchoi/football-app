## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); API-Football `grid` (`row:col`) coordinates now drive exact formation rows & left-to-right flanks on the pitch, and candlestick charts render proportionate wicks with softened single-event transitions while preserving exact `currentPrice`/`changeRate`.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (82/82 across all 12 suites, 100% mocked/offline).

## Recent Changes
- `src/types/index.ts`, `src/lib/providers/ApiFootballProvider.ts`, `src/app/api/matches/route.ts`, `src/lib/lineupStatus.ts`: Preserved API-Football `startXI[].player.grid` through `ApiLineupPlayer` and `Player`, and derived accurate positions respecting `col=1` (right: RB/RAM/RW) to `col=N` (left: LB/LAM/LW).
- `src/lib/lineupBuilder.ts`, `src/components/matches/FormationPitchModal.tsx`: Updated `buildTeamLineupForMatch` and `buildFormationRows` to group by `grid.row` DESC (ST → AM → DM → DF → GK) and sort each row by `grid.col` DESC (left → right) with automatic fallback when `grid` is absent; improved 5-row pitch vertical spacing.
- `src/lib/priceEngine.ts`, `src/components/market/FullScreenCandleChartModal.tsx`: Tightened minute-bar and daily wick ratios proportional to candle body, added `smoothIntradayCandlesForDisplay` to soften single-bar vertical event cliffs while preserving exact `openPrice`, `currentPrice`, and event markers, and balanced modal Y-axis headroom & High/Low readout consistency.
- `tests/gridAndCandle.test.ts`: Added unit tests verifying 4-2-3-1 `grid` placement (Kerkez LB left → Frimpong RB right, 2nd/3rd line separation), no-grid fallback, candlestick wick ratios, cliff softening, and final close/marker integrity.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
