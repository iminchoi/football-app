import type {
  ApiLineupPlayer,
  ApiMatchEvent,
  Match,
  MatchStatus,
  Position,
} from "../../types/index.ts";
import {
  fanOutTeamEventsToPlayers,
  type GoalContext,
  type MatchParticipant,
} from "../priceEngine.ts";
import { diffScoreSnapshotsToTeamEvents } from "./scoreDiff.ts";
import type {
  MatchDataProvider,
  ProviderEvaluationResult,
  ScoreDerivedTeamEvent,
  ScoreSnapshot,
} from "./types.ts";

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
export const API_FOOTBALL_TIMEOUT_MS = 8000;

/**
 * Differential cache TTLs to protect the free plan (100 calls/day):
 * - Live fixtures / live events: 35 seconds (within 30-45s window)
 * - Upcoming or finished fixtures: 7 minutes (within 5-10m window)
 * - Confirmed lineups / finished events: 30 minutes
 */
export const CACHE_TTL_MS = {
  LIVE_FIXTURES: 35_000,
  STATIC_FIXTURES: 420_000,
  LIVE_EVENTS: 35_000,
  PRE_LINEUPS: 300_000,
  LOCKED_LINEUPS_OR_FT_EVENTS: 1_800_000,
} as const;

export const API_FOOTBALL_AVAILABLE_EVENT_TYPES = [
  "TEAM_GOAL",
  "TEAM_CONCEDED",
  "CLEAN_SHEET_45",
  "CLEAN_SHEET_75",
  "GOAL",
  "ASSIST",
  "YELLOW_CARD",
  "RED_CARD",
  "SUB_IN",
  "LINEUP_CONFIRMED",
] as const;

export interface ApiFootballRawFixtureItem {
  fixture?: {
    id?: number;
    date?: string;
    status?: {
      short?: string;
      long?: string;
      elapsed?: number | null;
    };
  };
  league?: {
    id?: number;
    name?: string;
    country?: string;
    logo?: string;
  };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
  score?: {
    halftime?: { home?: number | null; away?: number | null };
    fulltime?: { home?: number | null; away?: number | null };
  };
  events?: ApiFootballRawEvent[];
  lineups?: ApiFootballRawLineup[];
}

export interface ApiFootballRawEvent {
  time?: { elapsed?: number | null; extra?: number | null };
  team?: { id?: number; name?: string };
  player?: { id?: number | null; name?: string | null };
  assist?: { id?: number | null; name?: string | null };
  type?: string;
  detail?: string;
  comments?: string | null;
}

export interface ApiFootballRawLineupPlayer {
  player?: {
    id?: number;
    name?: string;
    number?: number;
    pos?: string;
    grid?: string | null;
  };
}

export interface ApiFootballRawLineup {
  team?: { id?: number; name?: string };
  coach?: { id?: number; name?: string };
  formation?: string;
  startXI?: ApiFootballRawLineupPlayer[];
  substitutes?: ApiFootballRawLineupPlayer[];
}

interface CacheRecord<T> {
  value: T;
  expiresAt: number;
  updatedAt: number;
}

const MAJOR_LEAGUE_ID_MAP: Record<
  number,
  { leagueId: string; name: string; country: string; order: number; isInternational?: boolean }
> = {
  1: { leagueId: "wc", name: "FIFA 월드컵", country: "국제 (A매치)", order: 0, isInternational: true },
  4: { leagueId: "ec", name: "UEFA 유로 챔피언십", country: "유럽 (A매치)", order: 0, isInternational: true },
  5: { leagueId: "nl", name: "UEFA 네이션스리그", country: "유럽 (A매치)", order: 0, isInternational: true },
  9: { leagueId: "ca", name: "코파 아메리카", country: "남미 (A매치)", order: 0, isInternational: true },
  10: { leagueId: "amatch", name: "A매치 국가대표 친선전", country: "국제 (A매치)", order: 0, isInternational: true },
  32: { leagueId: "wc", name: "FIFA 월드컵 유럽 예선", country: "유럽 (A매치)", order: 0, isInternational: true },
  29: { leagueId: "wc", name: "FIFA 월드컵 아시아 예선", country: "아시아 (A매치)", order: 0, isInternational: true },
  39: { leagueId: "pl-2021", name: "프리미어리그", country: "잉글랜드", order: 1 },
  2: { leagueId: "cl", name: "UEFA 챔피언스리그", country: "유럽", order: 2 },
  140: { leagueId: "pd", name: "라리가", country: "스페인", order: 3 },
  78: { leagueId: "bl1", name: "분데스리가", country: "독일", order: 4 },
  135: { leagueId: "sa", name: "세리에 A", country: "이탈리아", order: 5 },
  61: { leagueId: "fl1", name: "리그 1", country: "프랑스", order: 6 },
  88: { leagueId: "ded", name: "에레디비시", country: "네덜란드", order: 7 },
  94: { leagueId: "ppl", name: "프리메이라리가", country: "포르투갈", order: 8 },
  40: { leagueId: "elc", name: "챔피언십", country: "잉글랜드", order: 9 },
};

const TEAM_COLORS = [
  "#132257",
  "#EF0107",
  "#6CABDD",
  "#C8102E",
  "#034694",
  "#DA291C",
  "#004170",
  "#A50044",
  "#DC052D",
  "#010E80",
];

function colorForTeamId(id?: number | string): string {
  const num =
    typeof id === "number"
      ? id
      : String(id || "team")
          .split("")
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return TEAM_COLORS[Math.abs(num) % TEAM_COLORS.length];
}

function toShortTla(name?: string): string {
  const clean = String(name || "CLB").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words[0].length <= 3) {
    return (words[0] + words[1].slice(0, 2)).slice(0, 3).toUpperCase();
  }
  return clean.replace(/[^A-Za-z0-9가-힣]/g, "").slice(0, 3).toUpperCase() || "CLB";
}

function formatKstKickoff(utcDateStr?: string): string {
  if (!utcDateStr) return "00:00";
  try {
    const dt = new Date(utcDateStr);
    if (Number.isNaN(dt.getTime())) return "00:00";
    return dt.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "00:00";
  }
}

export function mapApiFootballStatus(
  rawShort?: string,
  elapsed?: number | null
): {
  status: MatchStatus;
  rawStatus: string;
  phase: "PRE" | "1H" | "HT" | "2H" | "FT";
  minute?: number;
} {
  const code = String(rawShort || "NS").trim().toUpperCase();

  if (code === "FT" || code === "AET" || code === "PEN" || code === "AWD" || code === "WO") {
    return { status: "FT", rawStatus: "FINISHED", phase: "FT", minute: 90 };
  }
  if (code === "HT" || code === "BT") {
    return { status: "LIVE", rawStatus: "HT", phase: "HT", minute: 45 };
  }
  if (code === "1H") {
    const min = Math.max(1, Math.min(45, Math.round(elapsed ?? 25)));
    return { status: "LIVE", rawStatus: "1H", phase: "1H", minute: min };
  }
  if (code === "2H" || code === "ET" || code === "P" || code === "LIVE") {
    const min = Math.max(46, Math.min(95, Math.round(elapsed ?? 65)));
    return { status: "LIVE", rawStatus: "2H", phase: "2H", minute: min };
  }
  return { status: "UPCOMING", rawStatus: "SCHEDULED", phase: "PRE", minute: undefined };
}

function mapPosCode(
  rawPos: string | undefined,
  counts: { df: number; mf: number; fw: number }
): Position {
  const code = String(rawPos || "").trim().toUpperCase();
  if (code === "G" || code === "GK") return "GK";
  if (code === "D" || code === "DF") {
    const cycle: Position[] = ["LB", "CB", "CB", "RB"];
    const pos = cycle[counts.df % cycle.length];
    counts.df += 1;
    return pos;
  }
  if (code === "F" || code === "FW") {
    const cycle: Position[] = ["LW", "ST", "RW"];
    const pos = cycle[counts.fw % cycle.length];
    counts.fw += 1;
    return pos;
  }
  const cycle: Position[] = ["DM", "CM", "CAM"];
  const pos = cycle[counts.mf % cycle.length];
  counts.mf += 1;
  return pos;
}

export function normalizeApiFootballLineupList(
  rawList: ApiFootballRawLineupPlayer[] | undefined,
  teamName: string,
  isInternational: boolean
): ApiLineupPlayer[] | undefined {
  if (!Array.isArray(rawList) || rawList.length === 0) return undefined;
  const counts = { df: 0, mf: 0, fw: 0 };

  return rawList.map((item, idx) => {
    const p = item.player;
    const rawName = String(p?.name || `선수 ${idx + 1}`).trim();
    const externalId = p?.id !== undefined ? String(p.id) : `${teamName}-${idx}`;
    const position = mapPosCode(p?.pos, counts);

    return {
      id: `af-p-${externalId}`,
      externalId,
      name: rawName,
      position,
      ...(typeof p?.number === "number" ? { shirtNumber: p.number } : {}),
      team: teamName,
      nationalTeam: isInternational ? teamName : "",
    };
  });
}

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

export function normalizeApiFootballEvents(
  rawEvents: ApiFootballRawEvent[] | undefined,
  matchId: string,
  homeTeamId?: number,
  homeTeamName?: string,
  awayTeamName?: string
): {
  apiEvents: ApiMatchEvent[];
  teamEvents: ScoreDerivedTeamEvent[];
} {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return { apiEvents: [], teamEvents: [] };
  }

  const apiEvents: ApiMatchEvent[] = [];
  const teamEvents: ScoreDerivedTeamEvent[] = [];
  let runningHome = 0;
  let runningAway = 0;

  const sorted = [...rawEvents].sort(
    (a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0)
  );

  sorted.forEach((ev, idx) => {
    const elapsed = Math.max(1, Math.min(95, Math.round(ev.time?.elapsed ?? 45)));
    const typeUpper = String(ev.type || "").trim().toUpperCase();
    const detailUpper = String(ev.detail || "").trim().toUpperCase();
    const isHome =
      (homeTeamId !== undefined && ev.team?.id === homeTeamId) ||
      (homeTeamName !== undefined &&
        ev.team?.name?.trim().toLowerCase() === homeTeamName.trim().toLowerCase());
    const teamSide: "HOME" | "AWAY" = isHome ? "HOME" : "AWAY";
    const teamLabel = teamSide === "HOME" ? homeTeamName : awayTeamName;

    const playerId =
      ev.player?.id !== undefined && ev.player?.id !== null
        ? `af-p-${ev.player.id}`
        : undefined;
    const playerName = String(ev.player?.name || "").trim();

    if (typeUpper === "GOAL") {
      if (detailUpper.includes("MISSED PENALTY")) return;

      const scoringSide: "HOME" | "AWAY" = detailUpper.includes("OWN GOAL")
        ? teamSide === "HOME"
          ? "AWAY"
          : "HOME"
        : teamSide;
      const goalContext = inferGoalContext(scoringSide, runningHome, runningAway);
      if (scoringSide === "HOME") runningHome += 1;
      else runningAway += 1;
      const goalIndex = scoringSide === "HOME" ? runningHome : runningAway;

      if (!detailUpper.includes("OWN GOAL") && playerName) {
        const goalEvId = `${matchId}-af-goal-${elapsed}-${playerId ?? idx}`;
        apiEvents.push({
          id: goalEvId,
          minute: elapsed,
          type: "GOAL",
          playerId,
          playerName,
          teamName: teamLabel,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
        });
        teamEvents.push({
          id: goalEvId,
          matchId,
          minute: elapsed,
          teamSide: scoringSide,
          scoringSide,
          goalIndex,
          kind: "GOAL",
          actorPlayerId: playerId,
          goalContext,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
          description: `${playerName} 득점`,
        });
      } else {
        teamEvents.push({
          id: `${matchId}-af-tgoal-${elapsed}-${idx}`,
          matchId,
          minute: elapsed,
          teamSide: scoringSide,
          scoringSide,
          goalIndex,
          kind: "TEAM_GOAL",
          goalContext,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
          description: "팀 득점",
        });
        teamEvents.push({
          id: `${matchId}-af-tconc-${elapsed}-${idx}`,
          matchId,
          minute: elapsed,
          teamSide: scoringSide === "HOME" ? "AWAY" : "HOME",
          scoringSide,
          goalIndex,
          kind: "TEAM_CONCEDED",
          goalContext,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
          description: "팀 실점",
        });
      }

      const assistName = String(ev.assist?.name || "").trim();
      const assistId =
        ev.assist?.id !== undefined && ev.assist?.id !== null
          ? `af-p-${ev.assist.id}`
          : undefined;
      if (!detailUpper.includes("OWN GOAL") && assistName) {
        const assistEvId = `${matchId}-af-assist-${elapsed}-${assistId ?? idx}`;
        apiEvents.push({
          id: assistEvId,
          minute: elapsed,
          type: "ASSIST",
          playerId: assistId,
          playerName: assistName,
          teamName: teamLabel,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
        });
        teamEvents.push({
          id: assistEvId,
          matchId,
          minute: elapsed,
          teamSide: scoringSide,
          scoringSide,
          goalIndex,
          kind: "ASSIST",
          actorPlayerId: assistId,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
          description: `${assistName} 도움`,
        });
      }
      return;
    }

    if (typeUpper === "CARD" && playerName) {
      const isRed =
        detailUpper.includes("RED") || detailUpper.includes("SECOND YELLOW");
      const cardKind = isRed ? "RED_CARD" : "YELLOW_CARD";
      const cardEvId = `${matchId}-af-${cardKind.toLowerCase()}-${elapsed}-${playerId ?? idx}`;
      apiEvents.push({
        id: cardEvId,
        minute: elapsed,
        type: cardKind,
        playerId,
        playerName,
        teamName: teamLabel,
        source: "REAL",
        estimated: false,
        metadata: { estimated: false },
      });
      teamEvents.push({
        id: cardEvId,
        matchId,
        minute: elapsed,
        teamSide,
        kind: cardKind,
        actorPlayerId: playerId,
        source: "REAL",
        estimated: false,
        metadata: { estimated: false },
        description: isRed ? `${playerName} 퇴장` : `${playerName} 경고`,
      });
      return;
    }

    if (typeUpper === "SUBST" && playerName) {
      const subEvId = `${matchId}-af-sub-${elapsed}-${playerId ?? idx}`;
      apiEvents.push({
        id: subEvId,
        minute: elapsed,
        type: "SUB_OUT",
        playerId,
        playerName,
        teamName: teamLabel,
        source: "REAL",
        estimated: false,
        metadata: { estimated: false },
      });
    }
  });

  return { apiEvents, teamEvents };
}

export function normalizeApiFootballFixture(
  item: ApiFootballRawFixtureItem
): Match {
  const fixtureId = item.fixture?.id ?? 0;
  const matchId = `af-${fixtureId}`;
  const leagueNum = item.league?.id ?? 0;
  const mappedLeague = MAJOR_LEAGUE_ID_MAP[leagueNum];
  const isInternational = Boolean(
    mappedLeague?.isInternational ||
      item.league?.name?.toLowerCase().includes("world cup") ||
      item.league?.name?.toLowerCase().includes("euro") ||
      item.league?.name?.toLowerCase().includes("nations league") ||
      item.league?.name?.toLowerCase().includes("friendlies")
  );

  const mappedStatus = mapApiFootballStatus(
    item.fixture?.status?.short,
    item.fixture?.status?.elapsed
  );

  const homeTeamIdNum = item.teams?.home?.id;
  const awayTeamIdNum = item.teams?.away?.id;
  const homeTeamName = item.teams?.home?.name?.trim() || "홈팀";
  const awayTeamName = item.teams?.away?.name?.trim() || "원정팀";
  const homeTla = toShortTla(homeTeamName);
  const awayTla = toShortTla(awayTeamName);

  const homeScore =
    mappedStatus.status === "UPCOMING"
      ? undefined
      : item.goals?.home ?? item.score?.fulltime?.home ?? 0;
  const awayScore =
    mappedStatus.status === "UPCOMING"
      ? undefined
      : item.goals?.away ?? item.score?.fulltime?.away ?? 0;

  const rawHomeLineup = item.lineups?.find(
    (l) =>
      (homeTeamIdNum !== undefined && l.team?.id === homeTeamIdNum) ||
      l.team?.name?.trim().toLowerCase() === homeTeamName.toLowerCase()
  );
  const rawAwayLineup = item.lineups?.find(
    (l) =>
      (awayTeamIdNum !== undefined && l.team?.id === awayTeamIdNum) ||
      l.team?.name?.trim().toLowerCase() === awayTeamName.toLowerCase()
  );

  const homeLineup = normalizeApiFootballLineupList(
    rawHomeLineup?.startXI,
    homeTeamName,
    isInternational
  );
  const homeBench = normalizeApiFootballLineupList(
    rawHomeLineup?.substitutes,
    homeTeamName,
    isInternational
  );
  const awayLineup = normalizeApiFootballLineupList(
    rawAwayLineup?.startXI,
    awayTeamName,
    isInternational
  );
  const awayBench = normalizeApiFootballLineupList(
    rawAwayLineup?.substitutes,
    awayTeamName,
    isInternational
  );

  const usesDummyLineup =
    (!homeLineup || homeLineup.length === 0) &&
    (!awayLineup || awayLineup.length === 0);

  const { apiEvents } = normalizeApiFootballEvents(
    item.events,
    matchId,
    homeTeamIdNum,
    homeTeamName,
    awayTeamName
  );

  const kickoffTime =
    mappedStatus.status === "FT"
      ? "종료"
      : formatKstKickoff(item.fixture?.date);

  return {
    id: matchId,
    utcDate: item.fixture?.date,
    leagueId: mappedLeague?.leagueId ?? `af-league-${leagueNum}`,
    leagueName: mappedLeague?.name ?? item.league?.name ?? "유럽 리그",
    leagueCountry: mappedLeague?.country ?? item.league?.country ?? "국제",
    leagueEmblem: item.league?.logo || undefined,
    isInternational,
    status: mappedStatus.status,
    rawStatus: mappedStatus.rawStatus,
    minute: mappedStatus.minute,
    kickoffTime,
    providerMode: "DEEP_DATA",
    usesDummyLineup,
    ...(rawHomeLineup?.coach?.name
      ? { homeManager: rawHomeLineup.coach.name }
      : {}),
    ...(rawAwayLineup?.coach?.name
      ? { awayManager: rawAwayLineup.coach.name }
      : {}),
    homeTeam: {
      id: homeTla.toLowerCase(),
      name: homeTeamName,
      shortName: homeTla,
      color: colorForTeamId(homeTeamIdNum ?? homeTla),
      crest: item.teams?.home?.logo || undefined,
      score: homeScore,
      formation: rawHomeLineup?.formation || "4-3-3",
      ...(homeLineup ? { lineup: homeLineup } : {}),
      ...(homeBench ? { bench: homeBench } : {}),
    },
    awayTeam: {
      id: awayTla.toLowerCase(),
      name: awayTeamName,
      shortName: awayTla,
      color: colorForTeamId(awayTeamIdNum ?? awayTla),
      crest: item.teams?.away?.logo || undefined,
      score: awayScore,
      formation: rawAwayLineup?.formation || "4-2-3-1",
      ...(awayLineup ? { lineup: awayLineup } : {}),
      ...(awayBench ? { bench: awayBench } : {}),
    },
    highlightText:
      mappedStatus.status === "LIVE"
        ? "실시간 경기 진행 중 · API-Football 실데이터 시세 반영"
        : mappedStatus.status === "FT"
        ? `경기 종료 (${homeScore ?? 0} : ${awayScore ?? 0})`
        : `킥오프 ${kickoffTime} (KST)`,
    ...(apiEvents.length > 0 ? { events: apiEvents } : {}),
  };
}

/**
 * Real-data provider backed by API-Football v3 (`v3.football.api-sports.io`) with
 * differential server-side memory caching, 8s timeout, and stale-snapshot / fallback protection.
 */
export class ApiFootballProvider implements MatchDataProvider {
  readonly name = "ApiFootballProvider";
  readonly mode = "DEEP_DATA" as const;
  readonly availableEventTypes = API_FOOTBALL_AVAILABLE_EVENT_TYPES;
  readonly isSimulated = false;
  readonly usesDummyLineupFallback = false;

  private static readonly fixturesByDateCache = new Map<
    string,
    CacheRecord<Match[]>
  >();
  private static readonly lineupsByFixtureCache = new Map<
    number,
    CacheRecord<ApiFootballRawLineup[]>
  >();
  private static readonly eventsByFixtureCache = new Map<
    number,
    CacheRecord<ApiFootballRawEvent[]>
  >();

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly nowFn: () => number;

  constructor(options?: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    nowFn?: () => number;
  }) {
    this.apiKey = (options?.apiKey ?? process.env.API_FOOTBALL_KEY ?? "").trim();
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.nowFn = options?.nowFn ?? (() => Date.now());
  }

  static isConfigured(rawKey = process.env.API_FOOTBALL_KEY): boolean {
    const clean = (rawKey ?? "").trim();
    return clean.length >= 16 && /^[a-zA-Z0-9]+$/.test(clean);
  }

  static clearCachesForTesting(): void {
    ApiFootballProvider.fixturesByDateCache.clear();
    ApiFootballProvider.lineupsByFixtureCache.clear();
    ApiFootballProvider.eventsByFixtureCache.clear();
  }

  private async requestJson<T>(endpointWithQuery: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_FOOTBALL_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(
        `${API_FOOTBALL_BASE_URL}${endpointWithQuery}`,
        {
          method: "GET",
          headers: {
            "x-apisports-key": this.apiKey,
          },
          signal: controller.signal,
        }
      );

      if (res.status === 429) {
        throw new Error("API_FOOTBALL_RATE_LIMIT_429");
      }
      if (!res.ok) {
        throw new Error(`API_FOOTBALL_HTTP_${res.status}`);
      }

      const body = (await res.json()) as {
        errors?: Record<string, unknown> | unknown[];
        response?: T;
      };

      if (
        body.errors &&
        ((Array.isArray(body.errors) && body.errors.length > 0) ||
          (!Array.isArray(body.errors) && Object.keys(body.errors).length > 0))
      ) {
        throw new Error(
          `API_FOOTBALL_API_ERROR:${JSON.stringify(body.errors)}`
        );
      }

      return (body.response ?? ([] as unknown as T)) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchFixtureLineupsCached(
    fixtureId: number,
    status: MatchStatus
  ): Promise<ApiFootballRawLineup[]> {
    const now = this.nowFn();
    const cached = ApiFootballProvider.lineupsByFixtureCache.get(fixtureId);
    if (cached && now < cached.expiresAt) {
      return cached.value;
    }
    try {
      const lineups = await this.requestJson<ApiFootballRawLineup[]>(
        `/fixtures/lineups?fixture=${fixtureId}`
      );
      const ttl =
        status === "UPCOMING"
          ? CACHE_TTL_MS.PRE_LINEUPS
          : CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS;
      ApiFootballProvider.lineupsByFixtureCache.set(fixtureId, {
        value: lineups,
        expiresAt: now + ttl,
        updatedAt: now,
      });
      return lineups;
    } catch {
      return cached?.value ?? [];
    }
  }

  private async fetchFixtureEventsCached(
    fixtureId: number,
    status: MatchStatus
  ): Promise<ApiFootballRawEvent[]> {
    if (status === "UPCOMING") return [];
    const now = this.nowFn();
    const cached = ApiFootballProvider.eventsByFixtureCache.get(fixtureId);
    if (cached && now < cached.expiresAt) {
      return cached.value;
    }
    try {
      const events = await this.requestJson<ApiFootballRawEvent[]>(
        `/fixtures/events?fixture=${fixtureId}`
      );
      const ttl =
        status === "LIVE"
          ? CACHE_TTL_MS.LIVE_EVENTS
          : CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS;
      ApiFootballProvider.eventsByFixtureCache.set(fixtureId, {
        value: events,
        expiresAt: now + ttl,
        updatedAt: now,
      });
      return events;
    } catch {
      return cached?.value ?? [];
    }
  }

  /**
   * Fetch and normalize matches for `targetDate` (YYYY-MM-DD) with differential TTL caching.
   * On 429 or timeout, returns the last cached snapshot if available (`staleFallback: true`).
   */
  async fetchMatchesForDate(
    targetDate: string,
    options?: { enrichTopDetailsCount?: number }
  ): Promise<{
    matches: Match[];
    fromCache: boolean;
    staleFallback: boolean;
  }> {
    const now = this.nowFn();
    const cached = ApiFootballProvider.fixturesByDateCache.get(targetDate);
    if (cached && now < cached.expiresAt) {
      return {
        matches: cached.value,
        fromCache: true,
        staleFallback: false,
      };
    }

    if (!ApiFootballProvider.isConfigured(this.apiKey)) {
      if (cached) {
        return { matches: cached.value, fromCache: true, staleFallback: true };
      }
      throw new Error("API_FOOTBALL_KEY_MISSING_OR_INVALID");
    }

    try {
      const rawItems = await this.requestJson<ApiFootballRawFixtureItem[]>(
        `/fixtures?date=${encodeURIComponent(targetDate)}&timezone=Asia/Seoul`
      );

      const majorFiltered = rawItems.filter((item) => {
        const lid = item.league?.id;
        return lid !== undefined && MAJOR_LEAGUE_ID_MAP[lid] !== undefined;
      });
      const selectedRaw =
        majorFiltered.length > 0 ? majorFiltered : rawItems.slice(0, 20);

      selectedRaw.sort((a, b) => {
        const orderA = MAJOR_LEAGUE_ID_MAP[a.league?.id ?? 0]?.order ?? 99;
        const orderB = MAJOR_LEAGUE_ID_MAP[b.league?.id ?? 0]?.order ?? 99;
        return orderA - orderB;
      });

      const enrichLimit = options?.enrichTopDetailsCount ?? 4;
      let enrichedCount = 0;

      const normalized: Match[] = [];
      for (const item of selectedRaw) {
        const fId = item.fixture?.id;
        const st = mapApiFootballStatus(
          item.fixture?.status?.short,
          item.fixture?.status?.elapsed
        ).status;

        let lineups = item.lineups;
        let events = item.events;

        if (fId && enrichedCount < enrichLimit && st !== "UPCOMING") {
          enrichedCount += 1;
          if (!lineups || lineups.length === 0) {
            lineups = await this.fetchFixtureLineupsCached(fId, st);
          }
          if (!events || events.length === 0) {
            events = await this.fetchFixtureEventsCached(fId, st);
          }
        }

        normalized.push(
          normalizeApiFootballFixture({
            ...item,
            ...(lineups && lineups.length > 0 ? { lineups } : {}),
            ...(events && events.length > 0 ? { events } : {}),
          })
        );
      }

      const hasLive = normalized.some((m) => m.status === "LIVE");
      const ttl = hasLive
        ? CACHE_TTL_MS.LIVE_FIXTURES
        : CACHE_TTL_MS.STATIC_FIXTURES;

      ApiFootballProvider.fixturesByDateCache.set(targetDate, {
        value: normalized,
        expiresAt: now + ttl,
        updatedAt: now,
      });

      return {
        matches: normalized,
        fromCache: false,
        staleFallback: false,
      };
    } catch (err) {
      if (cached) {
        return {
          matches: cached.value,
          fromCache: true,
          staleFallback: true,
        };
      }
      throw err;
    }
  }

  async evaluateSnapshot(
    prev: ScoreSnapshot | null,
    curr: ScoreSnapshot,
    existingTeamEvents: ScoreDerivedTeamEvent[] = [],
    participants: MatchParticipant[] = []
  ): Promise<ProviderEvaluationResult> {
    const scoreDiffEvents = diffScoreSnapshotsToTeamEvents(
      prev,
      curr,
      existingTeamEvents
    );
    const hasRealGoalEvents = existingTeamEvents.some(
      (e) => e.kind === "GOAL" && e.source === "REAL"
    );

    const combinedEvents = hasRealGoalEvents
      ? [
          ...existingTeamEvents.filter(
            (e) => e.kind !== "CLEAN_SHEET_45" && e.kind !== "CLEAN_SHEET_75"
          ),
          ...scoreDiffEvents.filter(
            (e) => e.kind === "CLEAN_SHEET_45" || e.kind === "CLEAN_SHEET_75"
          ),
        ].sort((a, b) => a.minute - b.minute)
      : scoreDiffEvents;

    const playerEvents = fanOutTeamEventsToPlayers(
      participants,
      combinedEvents
    );

    return {
      providerMode: this.mode,
      teamEvents: combinedEvents,
      playerEvents,
      usesDummyLineupFallback: false,
      hasSimulatedEvents: false,
    };
  }
}
