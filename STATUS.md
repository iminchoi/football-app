## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); score-aligned goal/assist markers, click-invariant lineup/bench badges, `Newcastle vs Arsenal` (`02:30`) 4-2-3-1 fixture, and non-tradable manager (`감독`) display in `교체명단` are complete.
- `npx tsc --noEmit --incremental false` passes (0 errors), `npm run build` passes, and `node --experimental-strip-types --test tests/*.test.ts` passes (26/26).

## Recent Changes
- `src/lib/lineupStatus.ts` & `src/lib/priceEngine.ts`: Suppressed spurious goal/assist markers in `SCORE_ONLY` and 0-score matches, added `reconcileTeamGoalMarkers` and `resolveMatchManagers`, and stopped `extractInitialMatchEvents` from fabricating cards/assists when `events: []` or `pitch-` players are clicked.
- `src/store/useTradeStore.ts`: Prevented `ensurePlayerInStore` from overwriting cross-match `matchId` or fabricating events on click, and prevented `tickMarket` from inventing random milestone events on `SCORE_ONLY`, `match.events`, or `pitch-` players.
- `src/components/matches/FormationPitchModal.tsx`, `src/data/dummyData.ts`, `src/types/index.ts`, `src/app/api/matches/route.ts`: Added `m-new-ars` (`Newcastle` vs `Arsenal`, `Matthias Jaissle` / `Mikel Arteta`), isolated cross-match player context, and rendered non-tradable `감독` cards inside `교체명단`.
- `tests/lineupStatus.test.ts`: Added tests for `ScoreOnly` / team-score reconciliation, click immutability, cross-match isolation, and `resolveMatchManagers`.

## Known Issues & Next Steps
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨 (`v2.5-engine-freeze` 범위 외).
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준.
- **브라우저 시각 검증**: 실제 모바일/데스크톱 브라우저에서 `Newcastle vs Arsenal` 라인업, `교체명단` 감독 칸, 선수 클릭 시 배지 불변성 최종 확인 권장.
