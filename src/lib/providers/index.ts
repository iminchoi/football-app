import {
  DeepDataLiveProvider,
  NotImplementedError,
} from "./DeepDataLiveProvider.ts";
import { FixtureReplayProvider } from "./FixtureReplayProvider.ts";
import {
  AVAILABLE_EVENT_TYPES as SCORE_ONLY_EVENT_TYPES,
  ScoreOnlyLiveProvider,
} from "./ScoreOnlyLiveProvider.ts";
import {
  AVAILABLE_EVENT_TYPES as SIMULATED_EVENT_TYPES,
  SimulatedEventsProvider,
  type LedgerEntry,
  type LedgerStore,
} from "./SimulatedEventsProvider.ts";
import { diffScoreSnapshotsToTeamEvents } from "./scoreDiff.ts";
import {
  FORBIDDEN_SIMULATED_EVENT_TYPES,
  SCORE_ONLY_AVAILABLE_EVENT_TYPES,
  SIMULATED_AVAILABLE_EVENT_TYPES,
  type MatchDataProvider,
  type ProviderEvaluationResult,
  type ScoreDerivedTeamEvent,
  type ScoreSnapshot,
} from "./types.ts";

export {
  ScoreOnlyLiveProvider,
  FixtureReplayProvider,
  SimulatedEventsProvider,
  DeepDataLiveProvider,
  NotImplementedError,
  diffScoreSnapshotsToTeamEvents,
  SCORE_ONLY_AVAILABLE_EVENT_TYPES,
  SIMULATED_AVAILABLE_EVENT_TYPES,
  FORBIDDEN_SIMULATED_EVENT_TYPES,
  SCORE_ONLY_EVENT_TYPES,
  SIMULATED_EVENT_TYPES,
  type MatchDataProvider,
  type ProviderEvaluationResult,
  type ScoreDerivedTeamEvent,
  type ScoreSnapshot,
  type LedgerEntry,
  type LedgerStore,
};

/**
 * Resolve the active server-side MatchDataProvider:
 * - `SimulatedEventsProvider` ONLY when `process.env.ENABLE_SIMULATED_EVENTS === "true"`
 * - `FixtureReplayProvider` when `process.env.MATCH_PROVIDER === "FIXTURE_REPLAY"`
 * - `ScoreOnlyLiveProvider` by default
 */
export function getActiveMatchDataProvider(): MatchDataProvider {
  if (SimulatedEventsProvider.isEnabled()) {
    return new SimulatedEventsProvider();
  }
  if (process.env.MATCH_PROVIDER === "FIXTURE_REPLAY") {
    return new FixtureReplayProvider();
  }
  return new ScoreOnlyLiveProvider();
}
