## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`): `WEIGHTS`, `RATES`, `priceEngine.ts`, and pass/fail constants locked.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --test tests/priceEngine.test.ts tests/orderGate.test.ts tests/tradeStore.test.ts` passes (17/17).
- Starter population passes all 4 criteria across both `9001..9005` and default seeds (`20261119..20261523`, 5,000 matches/seed).

## Recent Changes
- `scripts/simulateBalance.ts`: Added report-only `minCellLowerCi95` output for lowest Pos × Matchup 95% CI lower bound.
- `STATUS.md`: Documented frozen v2.5 state and known limitations (`알려진 한계`).

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
