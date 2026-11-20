## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); `MatchDataProvider` architecture (`ScoreOnlyLiveProvider`, `FixtureReplayProvider`, `SimulatedEventsProvider`, `DeepDataLiveProvider`) implemented under `src/lib/providers/`.
- `PlayerEvent.source` (`'REAL' | 'SIMULATED'`) preserved across adapter, `priceEngine.ts`, UI badges, and tests; `.cache/ledger.json` ledger persists simulated `GOAL`/`ASSIST` events without recalculation.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --test tests/priceEngine.test.ts tests/orderGate.test.ts tests/tradeStore.test.ts tests/providerLedger.test.ts` passes (20/20).

## Recent Changes
- `src/lib/providers/*`: Added `MatchDataProvider` interface, `ScoreOnlyLiveProvider` (default), `FixtureReplayProvider`, `SimulatedEventsProvider` (server secret seed + `.cache/ledger.json`), `DeepDataLiveProvider` (stub), and pure `diffScoreSnapshotsToTeamEvents`.
- `src/lib/priceEngine.ts`, `src/types/index.ts`, `src/app/api/matches/route.ts`: Added `source: 'REAL' | 'SIMULATED'`, `{ estimated: true }` metadata, `providerMode`, and `usesDummyLineup`.
- `src/components/*`: Added `"시뮬레이션 이벤트 포함"`, `"예상/더미 라인업 (무료 API 라인업 미제공)"`, and `"데이터 없음 (실제 스코어 전용 모드)"` notices.
- `tests/providerLedger.test.ts`, `scripts/simulateBalance.ts`: Added 3 ledger/VAR/whitelist unit tests and `ScoreOnly` vs `Simulated` balance simulation evaluation.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
