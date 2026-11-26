## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); Phase 1 Supabase PostgreSQL + Drizzle ORM foundation and 3-tier API-Football DB cache (`memory -> fixtures_cache -> external API`) are implemented with permanent `FT` retention (`expires_at = NULL`) and safe in-memory fallback when `DATABASE_URL` is unset.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (89/89 across all 14 suites, 100% offline/mocked).

## Recent Changes
- `package.json`, `package-lock.json`, `drizzle.config.ts`, `.env.example`: Added `drizzle-orm`, `postgres`, `drizzle-kit`, `db:generate`/`db:push` scripts, and `DATABASE_URL`/`DIRECT_URL` templates.
- `src/db/schema.ts`, `src/db/index.ts`: Defined core PostgreSQL tables (`fixtures_cache`, `users`, `holdings`, `ledger_entries`, `squad_posts`, `squad_slots`, `squad_comments`) and HMR/PgBouncer-safe (`prepare: false`) singleton client with `isDatabaseConfigured()` guard.
- `src/lib/repositories/fixtureCacheRepository.ts`, `src/lib/providers/ApiFootballProvider.ts`: Implemented `FixtureCacheRepository` (`PostgresFixtureCacheRepository` + `MemoryFixtureCacheRepository` fallback) and wired 3-tier caching (`getMatchesByDate`/`fetchMatchesForDate`, `fetchFixtureDetail`), permanent `FT` caching, per-fixture FT detail reuse, and stale DB fallback.
- `tests/fixtureCacheRepository.test.ts`: Added offline tests covering unset `DATABASE_URL` fallback, 0-call permanent `FT` DB cache hits after memory clear, `LIVE`/`PRE` TTL expiry & FT upgrade, stale 429 DB fallback, and schema exports.

## Known Issues & Next Steps
- Phase 2: Migrate user accounts, portfolio holdings, and append-only trade ledger to PostgreSQL (`users`, `holdings`, `ledger_entries`).
- Phase 3: Migrate 11-player squad feed and comments to PostgreSQL (`squad_posts`, `squad_slots`, `squad_comments`).

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
