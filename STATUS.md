## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); Phase 1 (Drizzle + API-Football DB cache) and Phase 2 (transactional `users`/`holdings`/`ledger_entries` ledger repository + `/api/portfolio` & `/api/orders` routes) are implemented with safe local file fallback when `DATABASE_URL` is unset.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (95/95 across all 15 suites, 100% offline/mocked).

## Recent Changes
- `src/lib/repositories/ledgerRepository.ts`: Implemented `LedgerRepository` (`PostgresLedgerRepository` with Drizzle `db.transaction` + `FOR UPDATE` row locking & conditional updates, and `FileLedgerRepository` with per-user async mutex & rollback preserving `.cache/ledger.json` isolation).
- `src/app/api/portfolio/route.ts`, `src/app/api/orders/route.ts`: Added portfolio hydration/init (`INITIAL_SEED_CASH = 100,000 P`) and server-verified transactional BUY/SELL order execution routes wired to `getDefaultLedgerRepository()`.
- `src/store/useTradeStore.ts`, `src/app/page.tsx`, `src/components/RightTradeDockPanel.tsx`, `src/components/TradeBottomSheet.tsx`: Added `hydratePortfolioFromServer` & `submitOrder` with double-click lock while keeping existing `buyPlayer`/`sellPlayer` actions compatible.
- `tests/ledgerRepository.test.ts`: Verified BUY/weighted avg price, partial/full SELL & oversell rejection, `orderGate`/balance rollback, concurrent burst serialization, `DATABASE_URL` unset file fallback, and `PostgresLedgerRepository` `db.transaction`/`FOR UPDATE` rollback contract.

## Known Issues & Next Steps
- Phase 3: Migrate 11-player squad feed and comments to PostgreSQL (`squad_posts`, `squad_slots`, `squad_comments`).
- Real Supabase verification (`npm run db:push` + live DB transaction test) pending `DATABASE_URL`/`DIRECT_URL` configuration.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
