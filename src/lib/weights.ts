/**
 * Canonical PitchTrade economic weights table (v2.2).
 * Single source of truth consumed by `src/lib/priceEngine.ts` and unit tests.
 */
export const WEIGHTS = {
  CAP_LIMIT: 0.2,
  GOAL: {
    EQUALIZER_OR_GO_AHEAD: 0.13,
    OPENER: 0.085,
    EXTEND_LEAD: 0.06,
    DEFENDER_OR_GK_BONUS: 0.02,
  },
  ASSIST: 0.045,
  KEY_ACTION: {
    OUTFIELD: 0.015,
    GK: 0.008,
  },
  YELLOW_CARD: -0.025,
  RED_CARD: -0.15,
  TEAM_GOAL: 0.005,
  TEAM_CONCEDED: {
    GK_OR_DF: -0.015,
    MF_OR_FW: -0.01,
  },
  CLEAN_SHEET_45: 0.015,
  CLEAN_SHEET_75: 0.02,
  LINEUP_CONFIRMED: 0.0,
  LINEUP_EXCLUDED: -0.025,
  BIG_CHANCE_MISS: -0.015,
} as const;
