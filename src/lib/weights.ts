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
 * Expected 90-minute starter event rates by position group at baseline team strength (1.0 vs 1.0).
 * Derived directly from simulator generation probabilities (4-3-3: 3 FW, 3 MF, 4 DF, 1 GK; baseline lambda=1.4):
 * - GOAL: 1.4 * {FW:0.60/3, MF:0.30/3, DF:0.09/4, GK:0.01/1}
 * - ASSIST: 1.4 * 0.70 * {FW:0.32/3, MF:0.48/3, DF:0.19/4, GK:0.01/1}
 * - KEY_ACTION: 3.5 * {FW:0.40/3, MF:0.35/3, DF:0.25/4}, GK=2.0
 * - TEAM_GOAL / TEAM_CONCEDED: 1.4 across all on-pitch positions
 * - CLEAN_SHEET_45: exp(-1.4 * 44/88) = 0.4966 (DF/GK); CLEAN_SHEET_75: exp(-1.4 * 74/88) = 0.3081 (DF/GK)
 * - YELLOW_CARD: {FW:0.10, MF:0.15, DF:0.18, GK:0.02}; RED_CARD: 0.005
 */
export const RATES = {
  GOAL: { FW: 0.28, MF: 0.14, DF: 0.0315, GK: 0.014 },
  ASSIST: { FW: 0.1045, MF: 0.1568, DF: 0.0466, GK: 0.0098 },
  KEY_ACTION: { FW: 0.4667, MF: 0.4083, DF: 0.2188, GK: 2.0 },
  TEAM_GOAL: { FW: 1.4, MF: 1.4, DF: 1.4, GK: 1.4 },
  TEAM_CONCEDED: { FW: 1.4, MF: 1.4, DF: 1.4, GK: 1.4 },
  CLEAN_SHEET_45: { FW: 0.0, MF: 0.0, DF: 0.4966, GK: 0.4966 },
  CLEAN_SHEET_75: { FW: 0.0, MF: 0.0, DF: 0.3081, GK: 0.3081 },
  YELLOW_CARD: { FW: 0.1, MF: 0.15, DF: 0.18, GK: 0.02 },
  RED_CARD: { FW: 0.005, MF: 0.005, DF: 0.005, GK: 0.005 },
} as const;
