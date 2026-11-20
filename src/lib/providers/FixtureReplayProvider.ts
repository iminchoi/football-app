import {
  fanOutTeamEventsToPlayers,
  type MatchParticipant,
} from "../priceEngine.ts";
import {
  SIMULATED_AVAILABLE_EVENT_TYPES,
  type MatchDataProvider,
  type ProviderEvaluationResult,
  type ScoreDerivedTeamEvent,
  type ScoreSnapshot,
} from "./types.ts";

/**
 * Pre-recorded fixture replay provider for deterministic dev, demo, circuit-breaker,
 * and price-limit cap verification.
 */
export class FixtureReplayProvider implements MatchDataProvider {
  readonly name = "FixtureReplayProvider";
  readonly mode = "FIXTURE_REPLAY" as const;
  readonly availableEventTypes = SIMULATED_AVAILABLE_EVENT_TYPES;
  readonly isSimulated = false;
  readonly usesDummyLineupFallback = false;

  private readonly recordedFixtures: Map<string, ScoreDerivedTeamEvent[]>;

  constructor(fixtures: Record<string, ScoreDerivedTeamEvent[]> = {}) {
    this.recordedFixtures = new Map(Object.entries(fixtures));
  }

  async evaluateSnapshot(
    _prev: ScoreSnapshot | null,
    curr: ScoreSnapshot,
    existingTeamEvents: ScoreDerivedTeamEvent[] = [],
    participants: MatchParticipant[] = []
  ): Promise<ProviderEvaluationResult> {
    const recorded =
      this.recordedFixtures.get(curr.matchId) ?? existingTeamEvents;
    const activeEvents = recorded
      .filter((ev) => ev.minute <= (curr.status === "FT" ? 95 : curr.minute))
      .map((ev) => ({
        ...ev,
        source: ev.source ?? ("REAL" as const),
      }));
    const playerEvents = fanOutTeamEventsToPlayers(participants, activeEvents);

    return {
      providerMode: this.mode,
      teamEvents: activeEvents,
      playerEvents,
      usesDummyLineupFallback: false,
      hasSimulatedEvents: activeEvents.some((e) => e.source === "SIMULATED"),
    };
  }
}
