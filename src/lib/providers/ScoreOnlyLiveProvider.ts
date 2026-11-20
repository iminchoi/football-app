import {
  fanOutTeamEventsToPlayers,
  type MatchParticipant,
} from "../priceEngine.ts";
import { diffScoreSnapshotsToTeamEvents } from "./scoreDiff.ts";
import {
  SCORE_ONLY_AVAILABLE_EVENT_TYPES,
  type MatchDataProvider,
  type ProviderEvaluationResult,
  type ScoreDerivedTeamEvent,
  type ScoreSnapshot,
} from "./types.ts";

export const AVAILABLE_EVENT_TYPES = SCORE_ONLY_AVAILABLE_EVENT_TYPES;

/**
 * Default live provider consuming free football-data.org schedule, status, and score snapshots only.
 * Never synthesizes individual player goals, assists, key actions, or cards.
 */
export class ScoreOnlyLiveProvider implements MatchDataProvider {
  readonly name = "ScoreOnlyLiveProvider";
  readonly mode = "SCORE_ONLY" as const;
  readonly availableEventTypes = AVAILABLE_EVENT_TYPES;
  readonly isSimulated = false;
  readonly usesDummyLineupFallback = true;

  async evaluateSnapshot(
    prev: ScoreSnapshot | null,
    curr: ScoreSnapshot,
    existingTeamEvents: ScoreDerivedTeamEvent[] = [],
    participants: MatchParticipant[] = []
  ): Promise<ProviderEvaluationResult> {
    const teamEvents = diffScoreSnapshotsToTeamEvents(
      prev,
      curr,
      existingTeamEvents
    );
    const playerEvents = fanOutTeamEventsToPlayers(participants, teamEvents);

    return {
      providerMode: this.mode,
      teamEvents,
      playerEvents,
      usesDummyLineupFallback: this.usesDummyLineupFallback,
      hasSimulatedEvents: false,
    };
  }
}
