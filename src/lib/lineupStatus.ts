import type {
  ApiLineupPlayer,
  ApiMatchEvent,
  Match,
  Player,
} from "../types/index.ts";
import { canonicalizeTeamKey, resolveMatchClock } from "./matchSync.ts";
import {
  doesPlayerNameMatch,
  findKnownPlayerNameEntry,
} from "./playerDisplayName.ts";
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

function isValidEventMinute(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= 1;
}

function isPositiveCount(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val > 0;
}

function isVerifiedRealEvent(ev?: {
  source?: string;
  estimated?: boolean;
  metadata?: { estimated?: boolean };
}): boolean {
  if (!ev) return false;
  if (ev.source === "SIMULATED") return false;
  if (ev.estimated === true || ev.metadata?.estimated === true) return false;
  return true;
}

function extractNumericApiId(id: string): string | null {
  const m = /^(?:api-p-|af-p-)?(\d+)$/.exec(id);
  return m ? m[1] : null;
}

/**
 * Return true when two player IDs belong to the same authoritative ID namespace
 * and unambiguously identify different players (preventing alias/surname collisions).
 */
export function hasConflictingAuthoritativeIds(
  playerId?: string | number,
  candidateId?: string | number
): boolean {
  const a = normalizeId(playerId);
  const b = normalizeId(candidateId);
  if (!a || !b) return false;
  if (
    a === b ||
    a === `api-p-${b}` ||
    `api-p-${a}` === b ||
    a === `af-p-${b}` ||
    `af-p-${a}` === b
  ) {
    return false;
  }

  const numA = extractNumericApiId(a);
  const numB = extractNumericApiId(b);
  if (numA && numB) {
    return numA !== numB;
  }

  const isExplicitApiA = a.startsWith("api-p-") && !a.startsWith("api-p-ext-");
  const isExplicitApiB = b.startsWith("api-p-") && !b.startsWith("api-p-ext-");
  if (isExplicitApiA && isExplicitApiB && !numA && !numB) {
    return a !== b;
  }

  if (a.startsWith("p-") && b.startsWith("p-")) {
    const entryA = findKnownPlayerNameEntry({ id: a });
    const entryB = findKnownPlayerNameEntry({ id: b });
    if (entryA && entryB && entryA === entryB) {
      return false;
    }
    return true;
  }

  return false;
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
      `api-p-${player.id}` === idStr ||
      player.id === `af-p-${idStr}` ||
      `af-p-${player.id}` === idStr
    ) {
      return true;
    }
    if (hasConflictingAuthoritativeIds(player.id, idStr)) {
      return false;
    }
  }
  const nameLower = normalizeName(candidateName);
  if (nameLower) {
    if (normalizeName(player.name) === nameLower) return true;
    if (player.englishName && normalizeName(player.englishName) === nameLower) {
      return true;
    }
    if (doesPlayerNameMatch(player, candidateName)) {
      return true;
    }
  }
  return false;
}

export function findLineupEntryForPlayer(
  player: Pick<Player, "id" | "name" | "englishName">,
  match?: Match | null,
  teamSide?: "HOME" | "AWAY"
): ApiLineupPlayer | undefined {
  if (!match) return undefined;
  const pools: Array<ApiLineupPlayer[] | undefined> =
    teamSide === "HOME"
      ? [match.homeTeam?.lineup, match.homeTeam?.bench]
      : teamSide === "AWAY"
      ? [match.awayTeam?.lineup, match.awayTeam?.bench]
      : [
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

function isEventForOppositeTeam(
  eventTeamName: string | undefined,
  match: Match | null | undefined,
  teamSide: "HOME" | "AWAY" | undefined
): boolean {
  if (!eventTeamName || !match || !teamSide) return false;
  const evKey = canonicalizeTeamKey({ id: "", name: eventTeamName, shortName: "" });
  if (!evKey || evKey === "UNKNOWN") return false;
  const ownTeam = teamSide === "HOME" ? match.homeTeam : match.awayTeam;
  const oppTeam = teamSide === "HOME" ? match.awayTeam : match.homeTeam;
  const ownKey = canonicalizeTeamKey(ownTeam);
  const oppKey = canonicalizeTeamKey(oppTeam);
  return Boolean(oppKey && evKey === oppKey && evKey !== ownKey);
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
  const entry =
    params.lineupEntry ?? findLineupEntryForPlayer(player, match, teamSide);
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

  const hasMatchEventsProp = Array.isArray(match?.events);
  const matchEvents: ApiMatchEvent[] = hasMatchEventsProp
    ? (match?.events as ApiMatchEvent[])
    : [];
  const isScoreOnlyMode = match?.providerMode === "SCORE_ONLY";
  const isDummyLineup = Boolean(match?.usesDummyLineup);
  const allowCardAndSubEvents = !isScoreOnlyMode && !isDummyLineup;
  const allowVerifiedEntryMeta = Boolean(entry) && allowCardAndSubEvents;

  let subInMinute: number | undefined =
    allowVerifiedEntryMeta && isValidEventMinute(entry?.subInMinute)
      ? Math.max(1, Math.min(95, Math.round(entry!.subInMinute)))
      : undefined;

  let subOutMinute: number | undefined =
    allowVerifiedEntryMeta && isValidEventMinute(entry?.subOutMinute)
      ? Math.max(1, Math.min(95, Math.round(entry!.subOutMinute)))
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

  // 1) Match-level events (live API, fixture replay, curated match events)
  for (const ev of matchEvents) {
    if (!isValidEventMinute(ev.minute)) continue;
    if (isEventForOppositeTeam(ev.teamName, match, teamSide)) continue;
    const minute = Math.max(1, Math.min(95, Math.round(ev.minute)));
    const isRealCardOrSub = allowCardAndSubEvents && isVerifiedRealEvent(ev);

    if (ev.type === "SUB") {
      if (!isRealCardOrSub) continue;
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
      if (isRealCardOrSub) recordSubIn(minute);
    } else if (ev.type === "SUB_OUT") {
      if (isRealCardOrSub) recordSubOut(minute);
    } else if (ev.type === "YELLOW_CARD") {
      if (isRealCardOrSub) yellowMinutes.add(minute);
    } else if (ev.type === "RED_CARD") {
      if (isRealCardOrSub) redMinutes.add(minute);
    } else if (ev.type === "GOAL") {
      explicitGoalMinutes.add(minute);
    } else if (ev.type === "ASSIST") {
      explicitAssistMinutes.add(minute);
    }
  }

  // 2) Provider / Replay / Test PlayerEvent[] (preserves PlayerEvent.source)
  if (Array.isArray(providerPlayerEvents)) {
    for (const pev of providerPlayerEvents) {
      if (!isValidEventMinute(pev.minute)) continue;
      if (!doesIdentityMatchPlayer(player, pev.playerId)) continue;
      const minute = Math.max(1, Math.min(95, Math.round(pev.minute)));
      const isRealCardOrSub =
        allowCardAndSubEvents && isVerifiedRealEvent(pev);

      if (pev.type === "SUB_IN") {
        if (isRealCardOrSub) recordSubIn(minute);
      } else if (pev.type === "SUB_OUT") {
        if (isRealCardOrSub) recordSubOut(minute);
      } else if (pev.type === "YELLOW_CARD") {
        if (isRealCardOrSub) yellowMinutes.add(minute);
      } else if (pev.type === "RED_CARD") {
        if (isRealCardOrSub) redMinutes.add(minute);
      } else if (pev.type === "GOAL") {
        explicitGoalMinutes.add(minute);
      } else if (pev.type === "ASSIST") {
        explicitAssistMinutes.add(minute);
      }
    }
  }

  // 3) Player SSOT events & priceHistory markers
  // Only read player-level fallback when:
  // - player belongs to this exact match (never cross-match, never synthetic pitch-*)
  // - not a ScoreOnly or dummy-lineup match (no verified individual event data)
  // - match.events was not explicitly provided (when match.events exists, it is the SSOT)
  const sameMatchAsPlayer =
    !player.id.startsWith("pitch-") && (!match || player.matchId === match.id);

  if (sameMatchAsPlayer && allowCardAndSubEvents && !hasMatchEventsProp) {
    if (Array.isArray(player.events)) {
      for (const ev of player.events) {
        if (!isValidEventMinute(ev.minute)) continue;
        const minute = Math.max(1, Math.min(95, Math.round(ev.minute)));
        const isReal = isVerifiedRealEvent(ev);
        if (ev.type === "YELLOW_CARD") {
          if (isReal) yellowMinutes.add(minute);
        } else if (ev.type === "RED_CARD") {
          if (isReal) redMinutes.add(minute);
        } else if (ev.type === "GOAL") {
          fallbackGoalMinutes.add(minute);
        } else if (ev.type === "ASSIST") {
          fallbackAssistMinutes.add(minute);
        }
      }
    }

    if (Array.isArray(player.priceHistory)) {
      for (const pt of player.priceHistory) {
        const ev = pt.event;
        if (!ev || !isValidEventMinute(pt.minute)) continue;
        const minute = Math.max(1, Math.min(95, Math.round(pt.minute)));
        const isReal = isVerifiedRealEvent(ev);
        if (ev.type === "SUB_IN") {
          if (isReal) recordSubIn(minute);
        } else if (ev.type === "SUB_OUT") {
          if (isReal) recordSubOut(minute);
        } else if (ev.type === "YELLOW_CARD") {
          if (isReal) yellowMinutes.add(minute);
        } else if (ev.type === "RED_CARD") {
          if (isReal) redMinutes.add(minute);
        } else if (ev.type === "GOAL") {
          fallbackGoalMinutes.add(minute);
        } else if (ev.type === "ASSIST") {
          fallbackAssistMinutes.add(minute);
        }
      }
    }
  }

  const explicitYellows =
    allowVerifiedEntryMeta && isPositiveCount(entry?.yellowCards)
      ? Math.floor(entry!.yellowCards)
      : 0;
  const explicitReds =
    allowVerifiedEntryMeta && isPositiveCount(entry?.redCards)
      ? Math.floor(entry!.redCards)
      : 0;

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
  stripMatchEvents = false
): Player {
  if (!entry) return player;
  if (stripMatchEvents) {
    return {
      ...player,
      ...(entry.grid ? { grid: entry.grid } : {}),
      isCaptain: entry.isCaptain ?? player.isCaptain,
      subInMinute: undefined,
      subOutMinute: undefined,
      yellowCards: 0,
      redCards: 0,
      stats: {
        ...player.stats,
        yellowCards: 0,
        redCards: 0,
      },
    };
  }
  const mergedStats: Player["stats"] = {
    ...player.stats,
    ...(typeof entry.rating === "number" ? { rating: entry.rating } : {}),
    ...(typeof entry.minutesPlayed === "number"
      ? { minutesPlayed: entry.minutesPlayed }
      : {}),
    ...(typeof entry.goals === "number" ? { goals: entry.goals } : {}),
    ...(typeof entry.assists === "number" ? { assists: entry.assists } : {}),
    ...(typeof entry.shotsTotal === "number"
      ? { shotsTotal: entry.shotsTotal }
      : {}),
    ...(typeof entry.shotsOnTarget === "number"
      ? { shotsOnTarget: entry.shotsOnTarget }
      : {}),
    ...(typeof entry.passesTotal === "number"
      ? { passesTotal: entry.passesTotal }
      : {}),
    ...(typeof entry.passAccuracy === "number"
      ? { passAccuracy: entry.passAccuracy }
      : {}),
    ...(typeof entry.keyPasses === "number" ? { keyPasses: entry.keyPasses } : {}),
    ...(typeof entry.tackles === "number" ? { tackles: entry.tackles } : {}),
    ...(typeof entry.interceptions === "number"
      ? { interceptions: entry.interceptions }
      : {}),
    ...(typeof entry.blocks === "number" ? { blocks: entry.blocks } : {}),
    ...(typeof entry.dribblesAttempted === "number"
      ? { dribblesAttempted: entry.dribblesAttempted }
      : {}),
    ...(typeof entry.dribblesSuccess === "number"
      ? { dribblesSuccess: entry.dribblesSuccess }
      : {}),
    ...(typeof entry.duelsTotal === "number"
      ? { duelsTotal: entry.duelsTotal }
      : {}),
    ...(typeof entry.duelsWon === "number" ? { duelsWon: entry.duelsWon } : {}),
    ...(typeof entry.saves === "number" ? { saves: entry.saves } : {}),
    ...(isPositiveCount(entry.yellowCards)
      ? { yellowCards: Math.floor(entry.yellowCards) }
      : {}),
    ...(isPositiveCount(entry.redCards)
      ? { redCards: Math.floor(entry.redCards) }
      : {}),
  };

  return {
    ...player,
    ...(entry.grid ? { grid: entry.grid } : {}),
    ...(entry.isCaptain !== undefined ? { isCaptain: entry.isCaptain } : {}),
    ...(isValidEventMinute(entry.subInMinute)
      ? { subInMinute: Math.max(1, Math.min(95, Math.round(entry.subInMinute))) }
      : {}),
    ...(isValidEventMinute(entry.subOutMinute)
      ? { subOutMinute: Math.max(1, Math.min(95, Math.round(entry.subOutMinute))) }
      : {}),
    ...(isPositiveCount(entry.yellowCards)
      ? { yellowCards: Math.floor(entry.yellowCards) }
      : {}),
    ...(isPositiveCount(entry.redCards)
      ? { redCards: Math.floor(entry.redCards) }
      : {}),
    stats: mergedStats,
  };
}

export {
  PINNED_TODAY_FIXTURE_IDS,
  mergePinnedFixturesForToday,
} from "./matchSync.ts";

