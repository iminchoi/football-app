# STATUS

## Current State
- Estimated MVP completion: ~99% (Minimal team-jersey `PlayerAvatar` with jersey number and clean non-overlapping pitch player cards completed).
- Verification: `npx tsc --noEmit` passes with 0 errors; `src/` contains zero `any`, `@ts-ignore`, `eslint-disable`, or `console.*`.
- Working features: `max-w-[1380px]` 3-column adaptive workspace, inline Soft Ivory Green formation pitch (`lg+`), compact 2-row `MatchTimelineChart`, real date/clock X-axis in `전체 시세`, and minimal team-color jersey + backNumber `PlayerAvatar`.

## Recent Changes
- `src/components/PlayerAvatar.tsx`: replaced face/hair vector avatar with a minimal flat-vector football jersey icon displaying the team main color, collar/cuff trim, luminance-aware contrast ink, and centered jersey number.
- `src/components/matches/FormationPitchModal.tsx`: removed the overlapping `#backNumber position` pill and negative margin (`-mt-2`) on `PitchPlayerNode`, stacking rating chip (top-right), jersey icon (top-center), name + subtle position label (middle), and price/change % (bottom) cleanly.

## Known Issues & Next Steps
1. **Priority 1 — Browser UI & E2E verification**: verify minimal jersey `PlayerAvatar` legibility and non-overlapping `PitchPlayerNode` layout across pitch view, market rankings, docked panel, and detail view.
2. **Priority 2 — Real API key verification**: configure `FOOTBALL_DATA_API_KEY` in `.env.local` to test live match lineups and event ingestion.
3. **Priority 3 — Server-side persistence**: migrate accounts, holdings, and market supply from `localStorage` to a backend database for multi-device sync.
