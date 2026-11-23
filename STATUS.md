## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); 11-player Squad Maker & Community Feed (`SQUAD` tab) is live alongside full API-Football lineup/event/stats parsing.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (73/73 across all 10 suites, 100% mocked/offline).

## Recent Changes
- `src/types/index.ts`, `src/lib/squadFeed.ts`: Added `SQUAD` tab type, `SquadFeedPost`/`SquadFeedComment`/`SquadFeedPlayerSnapshot` types, and pure squad domain rules (11 distinct owned players + >=1 GK validation, publish immutability with delete-only permissions, multi-feed support, per-player & squad-level `'보유 중'`/`'일부 매도'`/`'전량 매도'` badge resolution across accounts, comment add/delete, and persistence sanitizer).
- `src/store/useTradeStore.ts`: Added `squadFeeds` state and `publishSquadFeed`, `deleteSquadFeed`, `addSquadComment`, `deleteSquadComment` actions persisted via Zustand `persist` (`partialize`/`merge`).
- `src/components/squad/SquadFeedTabView.tsx`, `src/components/TopAssetHeader.tsx`, `src/components/BottomTabBar.tsx`, `src/app/page.tsx`: Built Squad Maker & Community Feed UI (owned-only picker, 11-player pitch snapshot, sell-status badges/captions, delete-only lock, comments) and wired the 4th `스쿼드 피드` navigation tab.
- `tests/squadFeed.test.ts`: Added 6 unit test suites verifying 11-player/GK/duplicate/ownership validation, dynamic `af-p-...` holdings, publish immutability & multi-feed deletion, `'일부 매도'`/`'전량 매도'` evaluation across accounts, comments, and reload persistence.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
