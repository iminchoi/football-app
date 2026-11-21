import type {
  ApiLineupPlayer,
  ApiMatchEvent,
  Match,
  Player,
} from "../types/index.ts";
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

function normalizeId(raw?: string | number): string {
  return raw !== undefined ? String(raw).trim() : "";
}

function normalizeName(raw?: string): string {
  return (raw || "").trim().toLowerCase();
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
  return (
    match.status === "UPCOMING" ||
    match.rawStatus === "TIMED" ||
    match.rawStatus === "SCHEDULED"
  );
}

/**
 * Resolve substitution minutes and card counts for a player node or bench row
 * from lineup metadata, match events, player SSOT events, price history, and
 * optional provider/replay/test PlayerEvent arrays without double-counting.
 */
export function resolvePlayerMatchStatus(params: {
  player: Pick<
    Player,
    | "id"
    | "name"
    | "englishName"
    | "matchId"
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
}): PlayerMatchLineupStatus {
  const { player, match, providerPlayerEvents } = params;
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
  const goalMinutes = new Set<number>();
  const assistMinutes = new Set<number>();

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
  const matchEvents: ApiMatchEvent[] = Array.isArray(match?.events)
    ? match.events
    : [];
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
      goalMinutes.add(minute);
    } else if (ev.type === "ASSIST") {
      assistMinutes.add(minute);
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
        goalMinutes.add(minute);
      } else if (pev.type === "ASSIST") {
        assistMinutes.add(minute);
      }
    }
  }

  // 3) Player SSOT events & priceHistory markers (only when player belongs to this match or no match filter applies)
  const sameMatchAsPlayer = !match || player.matchId === match.id;
  if (sameMatchAsPlayer) {
    if (Array.isArray(player.events)) {
      for (const ev of player.events) {
        const minute = Math.max(1, Math.min(95, Math.round(ev.minute)));
        if (ev.type === "YELLOW_CARD") yellowMinutes.add(minute);
        else if (ev.type === "RED_CARD") redMinutes.add(minute);
        else if (ev.type === "GOAL") goalMinutes.add(minute);
        else if (ev.type === "ASSIST") assistMinutes.add(minute);
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
        else if (ev.type === "GOAL") goalMinutes.add(minute);
        else if (ev.type === "ASSIST") assistMinutes.add(minute);
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

  return {
    subInMinute,
    subOutMinute,
    yellowCards: Math.max(explicitYellows, yellowMinutes.size),
    redCards: Math.max(explicitReds, redMinutes.size),
    goals: sameMatchAsPlayer
      ? Math.max(player.stats?.goals ?? 0, goalMinutes.size)
      : goalMinutes.size,
    assists: sameMatchAsPlayer
      ? Math.max(player.stats?.assists ?? 0, assistMinutes.size)
      : assistMinutes.size,
    isCaptain,
  };
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
