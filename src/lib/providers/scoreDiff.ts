import type { GoalContext } from "../priceEngine.ts";
import type { ScoreDerivedTeamEvent, ScoreSnapshot } from "./types.ts";

function inferGoalContext(
  scoringSide: "HOME" | "AWAY",
  prevHome: number,
  prevAway: number
): GoalContext {
  if (prevHome === 0 && prevAway === 0) return "OPENER";
  const prevDiff =
    scoringSide === "HOME" ? prevHome - prevAway : prevAway - prevHome;
  if (prevDiff === -1) return "EQUALIZER";
  if (prevDiff === 0) return "GO_AHEAD";
  return "EXTEND_LEAD";
}

/**
 * Pure function converting score snapshot transitions into team-level events
 * (`TEAM_GOAL`, `TEAM_CONCEDED`, `CLEAN_SHEET_45`, `CLEAN_SHEET_75`).
 * - Marks polling-derived goal events with `{ estimated: true }`.
 * - Removes rolled-back goals when VAR / score correction decreases `homeScore` or `awayScore`.
 */
export function diffScoreSnapshotsToTeamEvents(
  prev: ScoreSnapshot | null,
  curr: ScoreSnapshot,
  existingEvents: readonly ScoreDerivedTeamEvent[] = []
): ScoreDerivedTeamEvent[] {
  const safeHome = Math.max(0, Math.floor(curr.homeScore));
  const safeAway = Math.max(0, Math.floor(curr.awayScore));
  const estMinute = Math.max(1, Math.min(90, Math.round(curr.minute || 45)));

  // 1. Retain existing goal events only up to current score (handles VAR cancellation / score reduction)
  const retainedGoals = existingEvents.filter((ev) => {
    if (ev.matchId !== curr.matchId) return false;
    if (ev.kind === "CLEAN_SHEET_45" || ev.kind === "CLEAN_SHEET_75") {
      return false; // Re-evaluated deterministically below
    }
    if (ev.scoringSide === "HOME" && (ev.goalIndex ?? 0) > safeHome) {
      return false;
    }
    if (ev.scoringSide === "AWAY" && (ev.goalIndex ?? 0) > safeAway) {
      return false;
    }
    return true;
  });

  const existingHomeMax = retainedGoals.reduce(
    (max, ev) =>
      ev.scoringSide === "HOME" ? Math.max(max, ev.goalIndex ?? 0) : max,
    0
  );
  const existingAwayMax = retainedGoals.reduce(
    (max, ev) =>
      ev.scoringSide === "AWAY" ? Math.max(max, ev.goalIndex ?? 0) : max,
    0
  );

  const startHome = prev
    ? Math.min(Math.max(0, Math.floor(prev.homeScore)), existingHomeMax)
    : existingHomeMax;
  const startAway = prev
    ? Math.min(Math.max(0, Math.floor(prev.awayScore)), existingAwayMax)
    : existingAwayMax;

  const nextEvents: ScoreDerivedTeamEvent[] = [...retainedGoals];
  let runningHome = startHome;
  let runningAway = startAway;

  for (let g = startHome + 1; g <= safeHome; g++) {
    const goalContext = inferGoalContext("HOME", runningHome, runningAway);
    runningHome = g;
    nextEvents.push({
      id: `${curr.matchId}-home-g${g}-team_goal`,
      matchId: curr.matchId,
      minute: estMinute,
      teamSide: "HOME",
      scoringSide: "HOME",
      goalIndex: g,
      kind: "TEAM_GOAL",
      goalContext,
      source: "REAL",
      estimated: true,
      metadata: { estimated: true },
      description: "팀 득점 보너스 (폴링 감지)",
    });
    nextEvents.push({
      id: `${curr.matchId}-home-g${g}-team_conceded`,
      matchId: curr.matchId,
      minute: estMinute,
      teamSide: "AWAY",
      scoringSide: "HOME",
      goalIndex: g,
      kind: "TEAM_CONCEDED",
      goalContext,
      source: "REAL",
      estimated: true,
      metadata: { estimated: true },
      description: "팀 실점 반영 (폴링 감지)",
    });
  }

  for (let g = startAway + 1; g <= safeAway; g++) {
    const goalContext = inferGoalContext("AWAY", runningHome, runningAway);
    runningAway = g;
    nextEvents.push({
      id: `${curr.matchId}-away-g${g}-team_goal`,
      matchId: curr.matchId,
      minute: estMinute,
      teamSide: "AWAY",
      scoringSide: "AWAY",
      goalIndex: g,
      kind: "TEAM_GOAL",
      goalContext,
      source: "REAL",
      estimated: true,
      metadata: { estimated: true },
      description: "팀 득점 보너스 (폴링 감지)",
    });
    nextEvents.push({
      id: `${curr.matchId}-away-g${g}-team_conceded`,
      matchId: curr.matchId,
      minute: estMinute,
      teamSide: "HOME",
      scoringSide: "AWAY",
      goalIndex: g,
      kind: "TEAM_CONCEDED",
      goalContext,
      source: "REAL",
      estimated: true,
      metadata: { estimated: true },
      description: "팀 실점 반영 (폴링 감지)",
    });
  }

  // 2. Clean sheet milestones at 45' and 75' based on first conceded minute
  const firstConcededHome = nextEvents
    .filter((e) => e.teamSide === "HOME" && e.kind === "TEAM_CONCEDED")
    .reduce((min, e) => Math.min(min, e.minute), 999);
  const firstConcededAway = nextEvents
    .filter((e) => e.teamSide === "AWAY" && e.kind === "TEAM_CONCEDED")
    .reduce((min, e) => Math.min(min, e.minute), 999);

  const effectiveMinute = curr.status === "FT" ? 90 : curr.minute;

  if (effectiveMinute >= 45 && firstConcededHome > 45) {
    nextEvents.push({
      id: `${curr.matchId}-home-cs45`,
      matchId: curr.matchId,
      minute: 45,
      teamSide: "HOME",
      kind: "CLEAN_SHEET_45",
      source: "REAL",
      estimated: false,
      metadata: { estimated: false },
      description: "전반 무실점 클린시트 보상",
    });
  }
  if (effectiveMinute >= 75 && firstConcededHome > 75) {
    nextEvents.push({
      id: `${curr.matchId}-home-cs75`,
      matchId: curr.matchId,
      minute: 75,
      teamSide: "HOME",
      kind: "CLEAN_SHEET_75",
      source: "REAL",
      estimated: false,
      metadata: { estimated: false },
      description: "75분 무실점 클린시트 보상",
    });
  }
  if (effectiveMinute >= 45 && firstConcededAway > 45) {
    nextEvents.push({
      id: `${curr.matchId}-away-cs45`,
      matchId: curr.matchId,
      minute: 45,
      teamSide: "AWAY",
      kind: "CLEAN_SHEET_45",
      source: "REAL",
      estimated: false,
      metadata: { estimated: false },
      description: "전반 무실점 클린시트 보상",
    });
  }
  if (effectiveMinute >= 75 && firstConcededAway > 75) {
    nextEvents.push({
      id: `${curr.matchId}-away-cs75`,
      matchId: curr.matchId,
      minute: 75,
      teamSide: "AWAY",
      kind: "CLEAN_SHEET_75",
      source: "REAL",
      estimated: false,
      metadata: { estimated: false },
      description: "75분 무실점 클린시트 보상",
    });
  }

  return nextEvents.sort((a, b) => a.minute - b.minute);
}
