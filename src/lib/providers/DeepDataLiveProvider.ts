import type { MatchParticipant } from "../priceEngine.ts";
import type {
  MatchDataProvider,
  ProviderEvaluationResult,
  ScoreDerivedTeamEvent,
  ScoreSnapshot,
} from "./types.ts";

export class NotImplementedError extends Error {
  constructor(message = "DeepDataLiveProvider is not implemented yet.") {
    super(message);
    this.name = "NotImplementedError";
  }
}

/**
 * Placeholder stub for future paid real-time player event feed integration (Opta / Sportradar / API-Football Pro).
 */
export class DeepDataLiveProvider implements MatchDataProvider {
  readonly name = "DeepDataLiveProvider";
  readonly mode = "DEEP_DATA" as const;
  readonly availableEventTypes = [
    "TEAM_GOAL",
    "TEAM_CONCEDED",
    "CLEAN_SHEET_45",
    "CLEAN_SHEET_75",
    "GOAL",
    "ASSIST",
    "KEY_ACTION",
    "YELLOW_CARD",
    "RED_CARD",
    "LINEUP_CONFIRMED",
    "LINEUP_EXCLUDED",
    "SUB_IN",
  ] as const;
  readonly isSimulated = false;
  readonly usesDummyLineupFallback = false;

  async evaluateSnapshot(
    _prev: ScoreSnapshot | null,
    _curr: ScoreSnapshot,
    _existingTeamEvents?: ScoreDerivedTeamEvent[],
    _participants?: MatchParticipant[]
  ): Promise<ProviderEvaluationResult> {
    throw new NotImplementedError(
      "DeepDataLiveProvider requires a paid real-time player event feed subscription."
    );
  }
}
