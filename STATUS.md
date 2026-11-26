## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); formation `grid` columns now align left-to-right (`col=1` LB/LW -> `col=N` RB/RW), player display names are unified to English (with Korean auxiliary search retained), Market tab defaults to major-league paginated rows (30/page) with full-universe search, and Hot Player Spotlight dynamically selects 6 distinct leaders with quantitative evidence badges.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (84/84 across all 13 suites, 100% mocked/offline).

## Recent Changes
- `src/lib/providers/ApiFootballProvider.ts`, `src/lib/lineupBuilder.ts`, `src/types/index.ts`: Fixed grid horizontal orientation to ascending `col` (`col=1` LB/LAM/LW left -> `col=N` RB/RAM/RW right) and matched `derivePositionFromGrid` flank mapping.
- `src/lib/playerDisplayName.ts`, `src/components/squad/SquadPlayerPickerModal.tsx`: Unified `resolvePlayerDisplayName` and `canonicalizeIncomingPlayerNames` to canonical English display names while preserving Korean search (`matchesPlayerSearchQuery`) and cross-script event identity matching.
- `src/lib/marketListing.ts`, `src/components/market/MarketChartTabView.tsx`: Added major-league default filtering (excluding minor-league clutter like `Viking`/`Sabah FA` unless searched or toggled), 30-item pagination (`더 보기`), and dynamic 6-card evidence-based Hot Player Spotlight (`selectHotSpotlightPlayers`) replacing hardcoded `SPOTLIGHT_IDS`.
- `tests/gridAndCandle.test.ts`, `tests/playerDisplayName.test.ts`, `tests/marketListing.test.ts`: Verified ascending `grid` col placement, English name unification with Korean search compatibility, major-league filtering/pagination, and dynamic spotlight selection.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
