## Current State
- PitchTrade engine v2.5 frozen (`v2.5-engine-freeze`); Supabase PostgreSQL + Drizzle ORM (Phases 1-3, 7 tables pushed live) and Supabase Auth SSR session-based authentication & API ownership enforcement are implemented with safe fallbacks when env vars are unset.
- `npx tsc --noEmit --incremental false` passes (0 errors); `node --experimental-strip-types --test` passes (104/104 across all 17 suites, 100% offline/mocked).

## Recent Changes
- `package.json`, `package-lock.json`, `.env.example`: Added `@supabase/ssr` & `@supabase/supabase-js` and documented `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `src/lib/supabase/config.ts`, `client.ts`, `server.ts`, `src/middleware.ts`: Implemented browser/SSR cookie clients, server-verified `getAuthenticatedUser()`, session refresh middleware, and unconfigured safe no-op fallback.
- `src/lib/auth/apiAuthService.ts`, `src/app/api/auth/me/route.ts`, `portfolio`, `orders`, `squad-feed` routes: Enforced session-based actor binding (`401` unauthenticated, `403` cross-user spoofing & non-author delete), `users` auto-init (`100,000 P`, `onConflictDoNothing`), and offline fallback compatibility.
- `src/components/AuthModal.tsx`, `TopAssetHeader.tsx`, `src/app/page.tsx`, `src/store/useTradeStore.ts`, `src/types/index.ts`: Connected email login/signup/logout & `onAuthStateChange` sync with Supabase Auth while preserving local demo auth fallback.
- `tests/authAuthorization.test.ts`: Added 4 test cases covering Supabase Auth config/role mapping, session enforcement on portfolio/orders/squad-feed/comments, cross-user tampering blocks (`401`/`403`), and unconfigured fallback compatibility.

## Known Issues & Next Steps
- Live Supabase Auth browser smoke test once `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `PUBLISHABLE_KEY`) are added to `.env.local`.

## 알려진 한계 (Known Limitations)
- **선수 개인 엣지 미반영**: 기대치 `E`가 선수 개인이 아닌 포지션(`FW`/`MF`/`DF`/`GK`) 단위로만 산출됨.
- **RATES 오차 허용 구간**: 포지션 최대 격차(`<= 1.0%p`) 기준 `RATES` 허용 오차 범위는 약 `-17% ~ +32%` 수준(`-20%` 시나리오에서 `1.06%p`로 소폭 초과).
- **조기 상한 도달 비중**: `+15%` 상한 도달자의 약 `50%`(`48.5%~50.0%`)가 개별 이벤트 `2개 이하`로 상한에 도달함.
- **실데이터 연동 시 개선 사항**: 라이브/실데이터 연동 시 `E`를 포지션 평균이 아닌 선수별 실측 발생률(수축 추정, shrinkage estimation)로 교체할 것.
