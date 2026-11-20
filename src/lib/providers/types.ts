import type { MatchStatus, ProviderMode } from "../../types/index.ts";
import type {
  EventSource,
  GoalContext,
  MatchParticipant,
  PlayerEvent,
  TeamMatchRawEvent,
} from "../priceEngine.ts";

export const SCORE_ONLY_AVAILABLE_EVENT_TYPES = [
  "TEAM_GOAL",
  "TEAM_CONCEDED",
  "CLEAN_SHEET_45",
  "CLEAN_SHEET_75",
] as const;

export const SIMULATED_AVAILABLE_EVENT_TYPES = [
  "TEAM_GOAL",
  "TEAM_CONCEDED",
  "CLEAN_SHEET_45",
  "CLEAN_SHEET_75",
  "GOAL",
  "ASSIST",
] as const;

export const FORBIDDEN_SIMULATED_EVENT_TYPES = [
  "YELLOW_CARD",
  "RED_CARD",
  "KEY_ACTION",
] as const;

export interface ScoreSnapshot {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  minute: number;
  observedAt?: number;
}

export interface ScoreDerivedTeamEvent extends TeamMatchRawEvent {
  matchId: string;
  goalIndex?: number;
  scoringSide?: "HOME" | "AWAY";
  source: EventSource;
  estimated: boolean;
  metadata: { estimated: boolean };
  goalContext?: GoalContext;
}

export interface ProviderEvaluationResult {
  providerMode: ProviderMode;
  teamEvents: ScoreDerivedTeamEvent[];
  playerEvents: Record<string, PlayerEvent[]>;
  usesDummyLineupFallback: boolean;
  hasSimulatedEvents: boolean;
}

export interface MatchDataProvider {
  readonly name: string;
  readonly mode: ProviderMode;
  readonly availableEventTypes: readonly string[];
  readonly isSimulated: boolean;
  readonly usesDummyLineupFallback: boolean;
  evaluateSnapshot(
    prev: ScoreSnapshot | null,
    curr: ScoreSnapshot,
    existingTeamEvents?: ScoreDerivedTeamEvent[],
    participants?: MatchParticipant[]
  ): Promise<ProviderEvaluationResult>;
}
