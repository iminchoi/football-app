## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); live `tickMarket` synthetic drift is now balanced and mean-reverting (`src/lib/marketTick.ts`), preventing mass +15% buy-cap crowding on the Market tab while preserving all `REAL` events and v2.5 weights.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (79/79 across all 11 suites, 100% mocked/offline).

## Recent Changes
- `src/lib/marketTick.ts`: Added pure symmetric/mean-reverting tick evaluator (`evaluateSimulatedTickEvent`), sliding-window + soft net-drift cap (`sanitizeSimulatedTickEvents`, `mergeSimulatedTickEvents`, max 3 `SIMULATED` events within `±8.5%` net drift, zero synthetic cards, 100% `REAL` event preservation, and minute wrap-around cleanup).
- `src/store/useTradeStore.ts`: Replaced one-sided positive `POSITION_EVENTS` accumulation in `tickMarket` with `evaluateSimulatedTickEvent` + `mergeSimulatedTickEvents`, and applied `sanitizeSimulatedTickEvents` in `applyPersistedPrices` and `syncPlayersFromMatches` to unblock stale persisted +15% cap lock-ins on reload.
- `src/data/dummyData.ts`: Neutralized default +3% seed inflation in `createSquadPlayer` for non-scoring/non-explicit players so initial quotes start balanced around `basePrice`.
- `tests/marketTick.test.ts`: Added unit tests verifying 100-player × 200-tick zero synthetic cap crowding, two-sided swings across all 4 position lines, hydration recovery of runaway `SIMULATED` events, and `REAL` +15% cap preservation.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
