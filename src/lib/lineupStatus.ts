import type {
  ApiLineupPlayer,
  ApiMatchEvent,
  Match,
  Player,
} from "../types/index.ts";
import { resolveMatchClock } from "./matchSync.ts";
import type { PlayerEvent } from "./priceEngine.ts";

export interface PlayerMatchLineupStatus {
  subInMinute?: number;
  subOutMinute?: number;
  yellowCards: number;
  redCards: number;
  goals: number;
  assists: number;
  isCaptain: boolean;
}

export interface MatchManagers {
  homeManager?: string;
  awayManager?: string;
}

function normalizeId(raw?: string | number): string {
  return raw !== undefined ? String(raw).trim() : "";
}

function normalizeName(raw?: string): string {
  return (raw || "").trim().toLowerCase();
}

export function resolveMatchManagers(match?: Match | null): MatchManagers {
  const homeManager =
    match?.homeTeam?.manager?.trim() || match?.homeManager?.trim() || undefined;
  const awayManager =
    match?.awayTeam?.manager?.trim() || match?.awayManager?.trim() || undefined;
  return { homeManager, awayManager };
}

export function doesIdentityMatchPlayer(
  player: Pick<Player, "id" | "name" | "englishName">,
  candidateId?: string | number,
  candidateName?: string
): boolean {
  const idStr = normalizeId(candidateId);
  if (idStr) {
    if (
      player.id === idStr ||
      player.id === `api-p-${idStr}` ||
      `api-p-${player.id}` === idStr
    ) {
      return true;
    }
  }
  const nameLower = normalizeName(candidateName);
  if (nameLower) {
    if (normalizeName(player.name) === nameLower) return true;
    if (player.englishName && normalizeName(player.englishName) === nameLower) {
      return true;
    }
  }
  return false;
}

export function findLineupEntryForPlayer(
  player: Pick<Player, "id" | "name" | "englishName">,
  match?: Match | null
): ApiLineupPlayer | undefined {
  if (!match) return undefined;
  const pools: Array<ApiLineupPlayer[] | undefined> = [
    match.homeTeam?.lineup,
    match.homeTeam?.bench,
    match.awayTeam?.lineup,
    match.awayTeam?.bench,
  ];
  for (const list of pools) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (
        doesIdentityMatchPlayer(
          player,
          entry.id ?? entry.externalId,
          entry.name
        )
      ) {
        return entry;
      }
    }
  }
  return undefined;
}

function isMatchUpcoming(match?: Match | null): boolean {
  if (!match) return false;
  return resolveMatchClock(match).isUpcoming;
}

function resolveTeamScoreForPlayer(
  player: Pick<Player, "id" | "name" | "englishName" | "teamId" | "teamShort" | "teamName">,
  match?: Match | null,
  explicitSide?: "HOME" | "AWAY"
): number | undefined {
  if (!match) return undefined;
  if (explicitSide === "HOME") return match.homeTeam?.score;
  if (explicitSide === "AWAY") return match.awayTeam?.score;

  const inHomeRoster =
    (match.homeTeam?.lineup ?? []).some((e) =>
      doesIdentityMatchPlayer(player, e.id ?? e.externalId, e.name)
    ) ||
    (match.homeTeam?.bench ?? []).some((e) =>
      doesIdentityMatchPlayer(player, e.id ?? e.externalId, e.name)
    );
  if (inHomeRoster) return match.homeTeam?.score;

  const inAwayRoster =
    (match.awayTeam?.lineup ?? []).some((e) =>
      doesIdentityMatchPlayer(player, e.id ?? e.externalId, e.name)
    ) ||
    (match.awayTeam?.bench ?? []).some((e) =>
      doesIdentityMatchPlayer(player, e.id ?? e.externalId, e.name)
    );
  if (inAwayRoster) return match.awayTeam?.score;

  const pTeamId = normalizeName(player.teamId);
  const pTeamShort = normalizeName(player.teamShort);
  const pTeamName = normalizeName(player.teamName);

  if (
    (pTeamId && pTeamId === normalizeName(match.homeTeam?.id)) ||
    (pTeamShort && pTeamShort === normalizeName(match.homeTeam?.shortName)) ||
    (pTeamName && pTeamName === normalizeName(match.homeTeam?.name))
  ) {
    return match.homeTeam?.score;
  }

  if (
    (pTeamId && pTeamId === normalizeName(match.awayTeam?.id)) ||
    (pTeamShort && pTeamShort === normalizeName(match.awayTeam?.shortName)) ||
    (pTeamName && pTeamName === normalizeName(match.awayTeam?.name))
  ) {
    return match.awayTeam?.score;
  }

  return undefined;
}

/**
 * Resolve substitution minutes, card counts, and score-aligned goal/assist counts
 * for a player node or bench row from lineup metadata, match events, provider/replay/test
 * PlayerEvent arrays, and same-match player SSOT events without double-counting.
 */
export function resolvePlayerMatchStatus(params: {
  player: Pick<
    Player,
    | "id"
    | "name"
    | "englishName"
    | "matchId"
    | "teamId"
    | "teamShort"
    | "teamName"
    | "events"
    | "priceHistory"
    | "stats"
    | "isCaptain"
    | "subInMinute"
    | "subOutMinute"
    | "yellowCards"
    | "redCards"
  >;
  match?: Match | null;
  lineupEntry?: ApiLineupPlayer;
  providerPlayerEvents?: PlayerEvent[];
  teamSide?: "HOME" | "AWAY";
}): PlayerMatchLineupStatus {
  const { player, match, providerPlayerEvents, teamSide } = params;
  const entry = params.lineupEntry ?? findLineupEntryForPlayer(player, match);
  const isCaptain = Boolean(entry?.isCaptain ?? player.isCaptain);

  if (isMatchUpcoming(match)) {
    return {
      subInMinute: undefined,
      subOutMinute: undefined,
      yellowCards: 0,
      redCards: 0,
      goals: 0,
      assists: 0,
      isCaptain,
    };
  }

  let subInMinute: number | undefined =
    typeof entry?.subInMinute === "number"
      ? entry.subInMinute
      : typeof player.subInMinute === "number"
      ? player.subInMinute
      : undefined;

  let subOutMinute: number | undefined =
    typeof entry?.subOutMinute === "number"
      ? entry.subOutMinute
      : typeof player.subOutMinute === "number"
      ? player.subOutMinute
      : undefined;

  const yellowMinutes = new Set<number>();
  const redMinutes = new Set<number>();
  const explicitGoalMinutes = new Set<number>();
  const explicitAssistMinutes = new Set<number>();
  const fallbackGoalMinutes = new Set<number>();
  const fallbackAssistMinutes = new Set<number>();

  const recordSubIn = (minute: number) => {
    const safeMin = Math.max(1, Math.min(95, Math.round(minute)));
    subInMinute =
      subInMinute === undefined ? safeMin : Math.min(subInMinute, safeMin);
  };

  const recordSubOut = (minute: number) => {
    const safeMin = Math.max(1, Math.min(95, Math.round(minute)));
    subOutMinute =
      subOutMinute === undefined ? safeMin : Math.max(subOutMinute, safeMin);
  };

  // 1) Match-level events (live API, fixture replay, dummy match events)
  const hasMatchEventsProp = Array.isArray(match?.events);
  const matchEvents: ApiMatchEvent[] = hasMatchEventsProp
    ? (match?.events as ApiMatchEvent[])
    : [];
  const isScoreOnlyMode = match?.providerMode === "SCORE_ONLY";

  for (const ev of matchEvents) {
    const minute = Math.max(1, Math.min(95, Math.round(ev.minute)));
    if (ev.type === "SUB") {
      if (doesIdentityMatchPlayer(player, ev.playerInId, ev.playerInName)) {
        recordSubIn(minute);
      }
      if (doesIdentityMatchPlayer(player, ev.playerOutId, ev.playerOutName)) {
        recordSubOut(minute);
      }
      continue;
    }

    if (!doesIdentityMatchPlayer(player, ev.playerId, ev.playerName)) {
      continue;
    }

    if (ev.type === "SUB_IN") {
      recordSubIn(minute);
    } else if (ev.type === "SUB_OUT") {
      recordSubOut(minute);
    } else if (ev.type === "YELLOW_CARD") {
      yellowMinutes.add(minute);
    } else if (ev.type === "RED_CARD") {
      redMinutes.add(minute);
    } else if (ev.type === "GOAL") {
      explicitGoalMinutes.add(minute);
    } else if (ev.type === "ASSIST") {
      explicitAssistMinutes.add(minute);
    }
  }

  // 2) Provider / Replay / Test PlayerEvent[] (preserves PlayerEvent.source)
  if (Array.isArray(providerPlayerEvents)) {
    for (const pev of providerPlayerEvents) {
      if (!doesIdentityMatchPlayer(player, pev.playerId)) continue;
      const minute = Math.max(1, Math.min(95, Math.round(pev.minute)));
      if (pev.type === "SUB_IN") {
        recordSubIn(minute);
      } else if (pev.type === "SUB_OUT") {
        recordSubOut(minute);
      } else if (pev.type === "YELLOW_CARD") {
        yellowMinutes.add(minute);
      } else if (pev.type === "RED_CARD") {
        redMinutes.add(minute);
      } else if (pev.type === "GOAL") {
        explicitGoalMinutes.add(minute);
      } else if (pev.type === "ASSIST") {
        explicitAssistMinutes.add(minute);
      }
    }
  }

  // 3) Player SSOT events & priceHistory markers
  // Only read player-level fallback when:
  // - player belongs to this exact match (never cross-match)
  // - not a ScoreOnly match (ScoreOnly has no individual scorer/assister data)
  const sameMatchAsPlayer =
    !match || (!player.id.startsWith("pitch-") && player.matchId === match.id);

  if (sameMatchAsPlayer) {
    if (Array.isArray(player.events)) {
      for (const ev of player.events) {
        const minute = Math.max(1, Math.min(95, Math.round(ev.minute)));
        if (ev.type === "YELLOW_CARD") yellowMinutes.add(minute);
        else if (ev.type === "RED_CARD") redMinutes.add(minute);
        else if (!isScoreOnlyMode && !hasMatchEventsProp) {
          if (ev.type === "GOAL") fallbackGoalMinutes.add(minute);
          else if (ev.type === "ASSIST") fallbackAssistMinutes.add(minute);
        }
      }
    }

    if (Array.isArray(player.priceHistory)) {
      for (const pt of player.priceHistory) {
        const ev = pt.event;
        if (!ev || typeof pt.minute !== "number" || pt.minute <= 0) continue;
        const minute = Math.max(1, Math.min(95, Math.round(pt.minute)));
        if (ev.type === "SUB_IN") recordSubIn(minute);
        else if (ev.type === "SUB_OUT") recordSubOut(minute);
        else if (ev.type === "YELLOW_CARD") yellowMinutes.add(minute);
        else if (ev.type === "RED_CARD") redMinutes.add(minute);
        else if (!isScoreOnlyMode && !hasMatchEventsProp) {
          if (ev.type === "GOAL") fallbackGoalMinutes.add(minute);
          else if (ev.type === "ASSIST") fallbackAssistMinutes.add(minute);
        }
      }
    }
  }

  const explicitYellows = Math.max(
    0,
    entry?.yellowCards ?? player.yellowCards ?? player.stats?.yellowCards ?? 0
  );
  const explicitReds = Math.max(
    0,
    entry?.redCards ?? player.redCards ?? player.stats?.redCards ?? 0
  );

  let goals = 0;
  let assists = 0;

  if (isScoreOnlyMode) {
    // In ScoreOnly mode, individual GOAL/ASSIST markers only appear if explicitly present
    goals = explicitGoalMinutes.size;
    assists = explicitAssistMinutes.size;
  } else if (hasMatchEventsProp) {
    // When match.events is explicitly provided, it is the single source of truth for goals/assists
    goals = explicitGoalMinutes.size;
    assists = explicitAssistMinutes.size;
  } else if (sameMatchAsPlayer) {
    goals = Math.max(player.stats?.goals ?? 0, fallbackGoalMinutes.size);
    assists = Math.max(player.stats?.assists ?? 0, fallbackAssistMinutes.size);
  }

  const teamScore = resolveTeamScoreForPlayer(player, match, teamSide);
  if (typeof teamScore === "number") {
    if (teamScore <= 0) {
      goals = 0;
      assists = 0;
    } else {
      goals = Math.min(goals, teamScore);
      assists = Math.min(assists, teamScore);
    }
  }

  return {
    subInMinute,
    subOutMinute,
    yellowCards: Math.max(explicitYellows, yellowMinutes.size),
    redCards: Math.max(explicitReds, redMinutes.size),
    goals,
    assists,
    isCaptain,
  };
}

/**
 * Reconcile a team's player status map against the team's scoreboard total so that
 * total displayed goal (⚽) and assist (🅰️) markers never exceed `teamScore`.
 */
export function reconcileTeamGoalMarkers(
  orderedPlayerIds: string[],
  statusById: Record<string, PlayerMatchLineupStatus>,
  teamScore?: number
): Record<string, PlayerMatchLineupStatus> {
  if (typeof teamScore !== "number") return statusById;
  const safeScore = Math.max(0, Math.floor(teamScore));
  let remainingGoals = safeScore;
  let remainingAssists = safeScore;

  const reconciled: Record<string, PlayerMatchLineupStatus> = {};
  for (const id of orderedPlayerIds) {
    const st = statusById[id];
    if (!st) continue;
    const allowedGoals = Math.min(st.goals, remainingGoals);
    remainingGoals -= allowedGoals;
    const allowedAssists = Math.min(st.assists, remainingAssists);
    remainingAssists -= allowedAssists;

    reconciled[id] =
      allowedGoals === st.goals && allowedAssists === st.assists
        ? st
        : { ...st, goals: allowedGoals, assists: allowedAssists };
  }
  return reconciled;
}

export function applyLineupEntryMeta(
  player: Player,
  entry?: ApiLineupPlayer,
  isUpcoming = false
): Player {
  if (!entry) return player;
  if (isUpcoming) {
    return {
      ...player,
      isCaptain: entry.isCaptain ?? player.isCaptain,
      subInMinute: undefined,
      subOutMinute: undefined,
      yellowCards: 0,
      redCards: 0,
    };
  }
  return {
    ...player,
    ...(entry.isCaptain !== undefined ? { isCaptain: entry.isCaptain } : {}),
    ...(entry.subInMinute !== undefined
      ? { subInMinute: entry.subInMinute }
      : {}),
    ...(entry.subOutMinute !== undefined
      ? { subOutMinute: entry.subOutMinute }
      : {}),
    ...(entry.yellowCards !== undefined
      ? { yellowCards: entry.yellowCards }
      : {}),
    ...(entry.redCards !== undefined ? { redCards: entry.redCards } : {}),
    ...(typeof entry.rating === "number"
      ? { stats: { ...player.stats, rating: entry.rating } }
      : {}),
  };
}

export {
  PINNED_TODAY_FIXTURE_IDS,
  mergePinnedFixturesForToday,
} from "./matchSync.ts";

