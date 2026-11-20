/**
 * Canonical PitchTrade economic weights table (v2.2).
 * Single source of truth consumed by `src/lib/priceEngine.ts` and unit tests.
 */
export const WEIGHTS = {
  CAP_LIMIT: 0.15,
  GOAL: {
    EQUALIZER_OR_GO_AHEAD: 0.12,
    OPENER: 0.085,
    EXTEND_LEAD: 0.06,
    DEFENDER_OR_GK_BONUS: 0.02,
  },
  ASSIST: 0.045,
  KEY_ACTION: {
    OUTFIELD: 0.012,
    GK: 0.004,
  },
  YELLOW_CARD: -0.025,
  RED_CARD: -0.15,
  TEAM_GOAL: 0.005,
  TEAM_CONCEDED: {
    GK_OR_DF: -0.015,
    MF_OR_FW: -0.013,
  },
  CLEAN_SHEET_45: 0.015,
  CLEAN_SHEET_75: 0.02,
  LINEUP_CONFIRMED: 0.0,
  LINEUP_EXCLUDED: -0.025,
  BIG_CHANCE_MISS: -0.015,
} as const;

/**
 * Expected per-match event rates by position group at baseline team strength (1.0 vs 1.0).
 * Used by `expectedReturn` in `src/lib/priceEngine.ts` to deduct pre-match expectation over 90 minutes.
 */
export const RATES = {
  GOAL: { FW: 0.165, MF: 0.095, DF: 0.022, GK: 0.011 },
  ASSIST: { FW: 0.064, MF: 0.113, DF: 0.036, GK: 0.009 },
  KEY_ACTION: { FW: 0.292, MF: 0.308, DF: 0.175, GK: 1.5 },
  TEAM_GOAL: { FW: 0.8, MF: 1.0, DF: 1.14, GK: 1.08 },
  TEAM_CONCEDED: { FW: 0.985, MF: 1.092, DF: 1.153, GK: 1.107 },
  CLEAN_SHEET_45: { FW: 0.0, MF: 0.0, DF: 0.42, GK: 0.4 },
  CLEAN_SHEET_75: { FW: 0.0, MF: 0.0, DF: 0.29, GK: 0.28 },
  YELLOW_CARD: { FW: 0.085, MF: 0.125, DF: 0.15, GK: 0.02 },
  RED_CARD: { FW: 0.007, MF: 0.008, DF: 0.008, GK: 0.005 },
} as const;
