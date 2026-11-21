## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); formation pitch and bench (`교체명단`) now render substitution times (`IN →` / `OUT ←`), re-substitutions, yellow cards, and red cards from live API, replay, fixture, and player events.
- `npx tsc --noEmit --incremental false` passes (0 errors), `npm run build` passes, and `node --experimental-strip-types --test tests/*.test.ts` passes (24/24).

## Recent Changes
- `src/lib/lineupStatus.ts`: Added `resolvePlayerMatchStatus` and `applyLineupEntryMeta` to aggregate `subInMinute`, `subOutMinute`, `yellowCards`, `redCards`, and captaincy across lineup metadata, match events, provider/replay events, and player history without double-counting.
- `src/components/matches/FormationPitchModal.tsx`: Added non-overlapping avatar sub-out (`←`) and yellow/red card badges on pitch nodes, plus `교체명단` sub-in (`→`), re-substitution (`65' →` + `90' ←`), and card badges while keeping `PlayerAvatar` styling intact.
- `src/app/api/matches/route.ts`, `src/store/useTradeStore.ts`, `src/types/index.ts`, `src/lib/priceEngine.ts`, `src/data/dummyData.ts`: Mapped `SUB_IN`/`SUB_OUT`/`SUB`/`YELLOW_CARD`/`RED_CARD` cleanly without modifying v2.5 weights, rates, or provider rules.
- `tests/lineupStatus.test.ts`: Added 4 unit tests covering sub-out, sub-in, re-substitution, cards, and `FixtureReplayProvider` integration.

## Known Issues & Next Steps
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨 (`v2.5-engine-freeze` 범위 외).
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준.
- **브라우저 시각 검증**: 실제 모바일 뷰포트(390x844)에서 아코디언 내 피치/교체명단 뱃지 배치 확인 권장.
