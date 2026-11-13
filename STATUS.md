# STATUS

## Current State
- Estimated MVP completion: ~92% (client-side trading, multi-account supply sync, and live match event price binding complete; external DB persistence remains).
- Verification: `npx tsc --noEmit` and `npm run build` (Next.js 15 production build + ESLint + type check) pass with 0 errors.
- Working features: 3-tab mobile UI (`MATCHES`, `PORTFOLIO`, `MARKET`), multi-account local auth & portfolio isolation, all-account supply sync across match cards and trade sheet, 5s market ticker with +/-30% price cap/floor, 0-90' timeline & OHLC candlestick charts, formation pitch view, and Football-Data.org v4 API route with live match event (`GOAL`, `ASSIST`, `YELLOW_CARD`, `RED_CARD`, `SUB_OUT`) binding and fallback modes.

## Recent Changes
- `src/types/index.ts`: added `ApiMatchEvent` interface and `Match.events` optional array for real match event ingestion.
- `src/app/api/matches/route.ts`: added `normalizeMatchEvents` to parse Football-Data.org `goals`, `bookings`, and `substitutions` into normalized `ApiMatchEvent[]`.
- `src/store/useTradeStore.ts`: bound `match.events` idempotently in `syncPlayersFromMatches` to update player prices (scaled by tier `volatilityMultiplier` and clamped to +/-30%), append `ChartEventMarker` points, and increment match stats (`goals`, `assists`, `rating`).
- `src/components/matches/MatchAccordionCard.tsx`: wired `user`, `accounts`, and `normalizeAccountKey` into `getAvailableShares` so match-card supply and sold-out badges match `TradeBottomSheet`; removed duplicate nested `football-app/` folder.
- `.env.example`: documented `FOOTBALL_DATA_API_KEY` configuration template without hardcoded secrets.

## Known Issues & Next Steps
1. **Live API Key Activation**: copy `.env.example` to `.env.local` and set a valid `FOOTBALL_DATA_API_KEY` to switch `/api/matches` from `MOCK_FALLBACK` to live Football-Data.org responses.
2. **Interactive Browser Session**: use `/browser` in an interactive session to visually inspect 390x844 mobile viewport rendering with live API fixtures.
