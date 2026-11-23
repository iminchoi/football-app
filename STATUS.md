## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); Squad Maker (`SQUAD` tab) now runs an FC Online-style interactive 11-slot pitch + right control panel layout supporting 8 formations (`4-4-2`, `4-2-3-1`, `4-3-3`, `4-1-4-1`, `3-4-2-1`, `3-5-2`, `3-4-3`, `5-3-2`) alongside the Community Feed.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (76/76 across all 10 suites, 100% mocked/offline).

## Recent Changes
- `src/types/index.ts`, `src/lib/squadFeed.ts`, `src/store/useTradeStore.ts`: Added 8-formation `(x%, y%)` 11-slot layouts (`SQUAD_FORMATION_LAYOUTS`), slot-level owned-only assignment/replacement/clearing/pruning (`assignPlayerToSquadSlot`, `clearSquadSlot`, `pruneUnownedSlotAssignments`), smooth formation remapping (`remapSquadSlotsForFormation`), slotted snapshot metadata (`slotIndex`, `slotLabel`), and `placeSnapshotsOnFormation`.
- `src/components/squad/SquadPlayerPickerModal.tsx`, `src/components/squad/SquadFeedTabView.tsx`: Redesigned Squad Maker into a 2-column tactical pitch + sticky right panel (title, strategy comment, live checklist, publish & reset), interactive `+` slots that open a searchable/filterable owned-player picker with duplicate prevention, and upgraded feed cards to render exact 8-formation coordinates.
- `tests/squadFeed.test.ts`: Added unit tests for all 8 formation coordinates/spacing, sequential formation remapping with zero loss/duplicates, owned-only slot assignment/clearing/pruning, and slotted 5-3-2 publish & GK validation.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
