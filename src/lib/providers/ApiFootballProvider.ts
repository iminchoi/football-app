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
import {
  clearDefaultFixtureCacheRepositoryForTesting,
  deriveDateMatchesStatus,
  deriveSingleFixtureStatus,
  getDefaultFixtureCacheRepository,
  type FixtureCacheRepository,
} from "../repositories/fixtureCacheRepository.ts";
import type {
  MatchDataProvider,
  ProviderEvaluationResult,
  ScoreDerivedTeamEvent,
  ScoreSnapshot,
} from "./types.ts";

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
export const API_FOOTBALL_TIMEOUT_MS = 8000;
export const API_FOOTBALL_BATCH_IDS_LIMIT = 20;
export const API_FOOTBALL_SINGLE_ID_EAGER_LIMIT = 5;

export type ApiFootballErrorCode =
  | "PLAN_WINDOW"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UPSTREAM_ERROR";

export class ApiFootballError extends Error {
  readonly code: ApiFootballErrorCode;
  readonly userMessage: string;

  constructor(
    code: ApiFootballErrorCode,
    userMessage: string,
    internalMessage?: string
  ) {
    super(internalMessage ?? userMessage);
    this.name = "ApiFootballError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

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
  players?: ApiFootballRawPlayerStatsTeam[];
}

export interface ApiFootballRawPlayerStatsTeam {
  team?: { id?: number; name?: string };
  players?: Array<{
    player?: { id?: number; name?: string };
    statistics?: Array<{
      games?: {
        minutes?: number | null;
        number?: number | null;
        position?: string | null;
        rating?: string | number | null;
        captain?: boolean | null;
        substitute?: boolean | null;
      };
      shots?: {
        total?: number | null;
        on?: number | null;
      };
      goals?: {
        total?: number | null;
        conceded?: number | null;
        assists?: number | null;
        saves?: number | null;
      };
      passes?: {
        total?: number | null;
        key?: number | null;
        accuracy?: string | number | null;
      };
      tackles?: {
        total?: number | null;
        blocks?: number | null;
        interceptions?: number | null;
      };
      duels?: {
        total?: number | null;
        won?: number | null;
      };
      dribbles?: {
        attempts?: number | null;
        success?: number | null;
        past?: number | null;
      };
      cards?: {
        yellow?: number | null;
        red?: number | null;
      };
    }>;
  }>;
}

interface ParsedApiFootballPlayerStats {
  rating?: number;
  isCaptain?: boolean;
  minutesPlayed?: number;
  goals?: number;
  assists?: number;
  shotsTotal?: number;
  shotsOnTarget?: number;
  passesTotal?: number;
  passAccuracy?: number;
  keyPasses?: number;
  tackles?: number;
  interceptions?: number;
  blocks?: number;
  dribblesAttempted?: number;
  dribblesSuccess?: number;
  duelsTotal?: number;
  duelsWon?: number;
  saves?: number;
  yellowCards?: number;
  redCards?: number;
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

function parseNonNegativeInt(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
    return Math.round(val);
  }
  if (typeof val === "string" && val.trim() !== "") {
    const num = Number(val.trim());
    if (Number.isFinite(num) && num >= 0) return Math.round(num);
  }
  return undefined;
}

function parsePassAccuracyPercent(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.max(0, Math.min(100, Math.round(val)));
  }
  if (typeof val === "string") {
    const cleaned = val.trim().replace(/%$/, "").trim();
    if (!cleaned) return undefined;
    const num = Number(cleaned);
    if (Number.isFinite(num)) {
      return Math.max(0, Math.min(100, Math.round(num)));
    }
  }
  return undefined;
}

export function parseApiFootballGrid(
  rawGrid?: string | null
): { row: number; col: number; normalized: string } | null {
  if (typeof rawGrid !== "string") return null;
  const match = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(rawGrid);
  if (!match) return null;
  const row = Number(match[1]);
  const col = Number(match[2]);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || col < 1) {
    return null;
  }
  return { row, col, normalized: `${row}:${col}` };
}

/**
 * Derive a detailed position from API-Football `grid` ("row:col").
 * API-Football convention: row 1 = GK -> maxRow = strikers; col 1 = left flank (LB/LAM/LW) -> col N = right flank (RB/RAM/RW).
 */
function derivePositionFromGrid(
  rawPos: string | undefined,
  row: number,
  col: number,
  rowSize: number,
  maxGridRow: number
): Position {
  const code = String(rawPos || "").trim().toUpperCase();
  if (row === 1 || code === "G" || code === "GK") return "GK";

  // Row 2: Defensive line (col 1 = LB on pitch left, col rowSize = RB on pitch right)
  if (row === 2) {
    if (rowSize >= 4) {
      if (col === 1) return "LB";
      if (col === rowSize) return "RB";
      return "CB";
    }
    if (rowSize === 2) {
      return col === 1 ? "LB" : "RB";
    }
    return "CB";
  }

  // Highest row (row >= 3): Front attacking line (col 1 = LW left, col rowSize = RW right)
  if (maxGridRow >= 3 && row >= maxGridRow) {
    if (rowSize >= 3) {
      if (col === 1) return "LW";
      if (col === rowSize) return "RW";
      return "ST";
    }
    return "ST";
  }

  // 5-row formations (e.g. 4-2-3-1, 4-1-4-1, 3-4-2-1): separate 2nd line (row 4 AM) from 3rd line (row 3 DM/CM)
  if (maxGridRow >= 5) {
    if (row === maxGridRow - 1) {
      if (rowSize === 1) return "CAM";
      if (rowSize === 2) return col === 1 ? "LAM" : "RAM";
      if (rowSize === 3) {
        if (col === 1) return "LAM";
        if (col === 3) return "RAM";
        return "CAM";
      }
      if (col === 1) return "LAM";
      if (col === rowSize) return "RAM";
      return "CM";
    }
    if (row === 3) {
      if (rowSize <= 2) return "DM";
      if (col === 1 || col === rowSize) return "CM";
      return "DM";
    }
  }

  // 4-row formations (e.g. 4-3-3, 4-4-2, 3-5-2): row 3 is central midfield
  if (row === 3) {
    if (rowSize === 1) return "DM";
    if (rowSize === 2) return "CM";
    if (rowSize === 3) return col === 2 ? "DM" : "CM";
    if (col === 1) return "LAM";
    if (col === rowSize) return "RAM";
    return "CM";
  }

  return "CM";
}

function mapPosCode(
  rawPos: string | undefined,
  counts: { df: number; mf: number; fw: number },
  rawGrid?: string | null,
  maxGridRow = 4,
  rowSizes?: ReadonlyMap<number, number>
): Position {
  const parsedGrid = parseApiFootballGrid(rawGrid);
  if (parsedGrid) {
    const rowSize = rowSizes?.get(parsedGrid.row) ?? 1;
    return derivePositionFromGrid(
      rawPos,
      parsedGrid.row,
      parsedGrid.col,
      rowSize,
      maxGridRow
    );
  }

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
  isInternational: boolean,
  playerStatsById?: ReadonlyMap<number, ParsedApiFootballPlayerStats>
): ApiLineupPlayer[] | undefined {
  if (!Array.isArray(rawList) || rawList.length === 0) return undefined;
  const counts = { df: 0, mf: 0, fw: 0 };
  const rowSizes = new Map<number, number>();
  let maxGridRow = 0;
  for (const item of rawList) {
    const parsed = parseApiFootballGrid(item.player?.grid);
    if (!parsed) continue;
    rowSizes.set(parsed.row, (rowSizes.get(parsed.row) ?? 0) + 1);
    if (parsed.row > maxGridRow) maxGridRow = parsed.row;
  }
  if (maxGridRow === 0) maxGridRow = 4;

  return rawList.map((item, idx) => {
    const p = item.player;
    const rawName = String(p?.name || `선수 ${idx + 1}`).trim();
    const numericId = typeof p?.id === "number" ? p.id : undefined;
    const externalId = numericId !== undefined ? String(numericId) : `${teamName}-${idx}`;
    const parsedGrid = parseApiFootballGrid(p?.grid);
    const position = mapPosCode(p?.pos, counts, p?.grid, maxGridRow, rowSizes);
    const statMeta = numericId !== undefined ? playerStatsById?.get(numericId) : undefined;

    return {
      id: `af-p-${externalId}`,
      externalId,
      name: rawName,
      position,
      ...(parsedGrid ? { grid: parsedGrid.normalized } : {}),
      ...(typeof p?.number === "number" ? { shirtNumber: p.number } : {}),
      ...(statMeta?.rating !== undefined ? { rating: statMeta.rating } : {}),
      ...(statMeta?.isCaptain ? { isCaptain: true } : {}),
      ...(statMeta?.minutesPlayed !== undefined ? { minutesPlayed: statMeta.minutesPlayed } : {}),
      ...(statMeta?.goals !== undefined ? { goals: statMeta.goals } : {}),
      ...(statMeta?.assists !== undefined ? { assists: statMeta.assists } : {}),
      ...(statMeta?.shotsTotal !== undefined ? { shotsTotal: statMeta.shotsTotal } : {}),
      ...(statMeta?.shotsOnTarget !== undefined ? { shotsOnTarget: statMeta.shotsOnTarget } : {}),
      ...(statMeta?.passesTotal !== undefined ? { passesTotal: statMeta.passesTotal } : {}),
      ...(statMeta?.passAccuracy !== undefined ? { passAccuracy: statMeta.passAccuracy } : {}),
      ...(statMeta?.keyPasses !== undefined ? { keyPasses: statMeta.keyPasses } : {}),
      ...(statMeta?.tackles !== undefined ? { tackles: statMeta.tackles } : {}),
      ...(statMeta?.interceptions !== undefined ? { interceptions: statMeta.interceptions } : {}),
      ...(statMeta?.blocks !== undefined ? { blocks: statMeta.blocks } : {}),
      ...(statMeta?.dribblesAttempted !== undefined
        ? { dribblesAttempted: statMeta.dribblesAttempted }
        : {}),
      ...(statMeta?.dribblesSuccess !== undefined
        ? { dribblesSuccess: statMeta.dribblesSuccess }
        : {}),
      ...(statMeta?.duelsTotal !== undefined ? { duelsTotal: statMeta.duelsTotal } : {}),
      ...(statMeta?.duelsWon !== undefined ? { duelsWon: statMeta.duelsWon } : {}),
      ...(statMeta?.saves !== undefined ? { saves: statMeta.saves } : {}),
      ...(statMeta?.yellowCards !== undefined && statMeta.yellowCards > 0
        ? { yellowCards: statMeta.yellowCards }
        : {}),
      ...(statMeta?.redCards !== undefined && statMeta.redCards > 0
        ? { redCards: statMeta.redCards }
        : {}),
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

  const sorted = [...rawEvents].sort((a, b) => {
    const aMin = (a.time?.elapsed ?? 0) + (a.time?.extra ?? 0) * 0.01;
    const bMin = (b.time?.elapsed ?? 0) + (b.time?.extra ?? 0) * 0.01;
    return aMin - bMin;
  });

  sorted.forEach((ev, idx) => {
    const baseElapsed = ev.time?.elapsed ?? 45;
    const extraMin =
      typeof ev.time?.extra === "number" && ev.time.extra > 0 ? ev.time.extra : 0;
    const rawMinute = baseElapsed >= 90 ? baseElapsed + extraMin : baseElapsed;
    const elapsed = Math.max(1, Math.min(95, Math.round(rawMinute)));
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

    if (typeUpper === "SUBST") {
      const subInName = String(ev.assist?.name || "").trim();
      const subInId =
        ev.assist?.id !== undefined && ev.assist?.id !== null
          ? `af-p-${ev.assist.id}`
          : undefined;

      if (playerName) {
        const subOutEvId = `${matchId}-af-subout-${elapsed}-${playerId ?? idx}`;
        apiEvents.push({
          id: subOutEvId,
          minute: elapsed,
          type: "SUB_OUT",
          playerId,
          playerName,
          ...(playerId ? { playerOutId: playerId } : {}),
          playerOutName: playerName,
          ...(subInId ? { playerInId: subInId } : {}),
          ...(subInName ? { playerInName: subInName } : {}),
          teamName: teamLabel,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
        });
      }

      if (subInName) {
        const subInEvId = `${matchId}-af-subin-${elapsed}-${subInId ?? idx}`;
        apiEvents.push({
          id: subInEvId,
          minute: elapsed,
          type: "SUB_IN",
          playerId: subInId,
          playerName: subInName,
          ...(playerId ? { playerOutId: playerId } : {}),
          ...(playerName ? { playerOutName: playerName } : {}),
          ...(subInId ? { playerInId: subInId } : {}),
          playerInName: subInName,
          teamName: teamLabel,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
        });
        teamEvents.push({
          id: subInEvId,
          matchId,
          minute: elapsed,
          teamSide,
          kind: "SUB_IN",
          actorPlayerId: subInId,
          source: "REAL",
          estimated: false,
          metadata: { estimated: false },
          description: `${subInName} 교체 투입`,
        });
      }
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

  const playerStatsById = new Map<number, ParsedApiFootballPlayerStats>();
  if (Array.isArray(item.players)) {
    for (const teamBlock of item.players) {
      for (const entry of teamBlock.players ?? []) {
        const pid = entry.player?.id;
        if (typeof pid !== "number") continue;
        const stat = entry.statistics?.[0];
        if (!stat) continue;

        const games = stat.games;
        const rawRating = games?.rating;
        const parsedRating =
          typeof rawRating === "number"
            ? rawRating
            : typeof rawRating === "string" && rawRating.trim() !== ""
            ? Number(rawRating)
            : NaN;
        const rating =
          Number.isFinite(parsedRating) && parsedRating > 0
            ? Number(parsedRating.toFixed(1))
            : undefined;
        const isCaptain = Boolean(games?.captain);
        const minutesPlayed = parseNonNegativeInt(games?.minutes);
        const goals = parseNonNegativeInt(stat.goals?.total);
        const assists = parseNonNegativeInt(stat.goals?.assists);
        const saves = parseNonNegativeInt(stat.goals?.saves);
        const shotsTotal = parseNonNegativeInt(stat.shots?.total);
        const shotsOnTarget = parseNonNegativeInt(stat.shots?.on);
        const passesTotal = parseNonNegativeInt(stat.passes?.total);
        const keyPasses = parseNonNegativeInt(stat.passes?.key);
        const passAccuracy = parsePassAccuracyPercent(stat.passes?.accuracy);
        const tackles = parseNonNegativeInt(stat.tackles?.total);
        const blocks = parseNonNegativeInt(stat.tackles?.blocks);
        const interceptions = parseNonNegativeInt(stat.tackles?.interceptions);
        const duelsTotal = parseNonNegativeInt(stat.duels?.total);
        const duelsWon = parseNonNegativeInt(stat.duels?.won);
        const dribblesAttempted = parseNonNegativeInt(stat.dribbles?.attempts);
        const dribblesSuccess = parseNonNegativeInt(stat.dribbles?.success);
        const yellowCards = parseNonNegativeInt(stat.cards?.yellow);
        const redCards = parseNonNegativeInt(stat.cards?.red);

        const parsed: ParsedApiFootballPlayerStats = {
          ...(rating !== undefined ? { rating } : {}),
          ...(isCaptain ? { isCaptain: true } : {}),
          ...(minutesPlayed !== undefined ? { minutesPlayed } : {}),
          ...(goals !== undefined ? { goals } : {}),
          ...(assists !== undefined ? { assists } : {}),
          ...(saves !== undefined ? { saves } : {}),
          ...(shotsTotal !== undefined ? { shotsTotal } : {}),
          ...(shotsOnTarget !== undefined ? { shotsOnTarget } : {}),
          ...(passesTotal !== undefined ? { passesTotal } : {}),
          ...(keyPasses !== undefined ? { keyPasses } : {}),
          ...(passAccuracy !== undefined ? { passAccuracy } : {}),
          ...(tackles !== undefined ? { tackles } : {}),
          ...(blocks !== undefined ? { blocks } : {}),
          ...(interceptions !== undefined ? { interceptions } : {}),
          ...(duelsTotal !== undefined ? { duelsTotal } : {}),
          ...(duelsWon !== undefined ? { duelsWon } : {}),
          ...(dribblesAttempted !== undefined ? { dribblesAttempted } : {}),
          ...(dribblesSuccess !== undefined ? { dribblesSuccess } : {}),
          ...(yellowCards !== undefined && yellowCards > 0 ? { yellowCards } : {}),
          ...(redCards !== undefined && redCards > 0 ? { redCards } : {}),
        };

        if (Object.keys(parsed).length > 0) {
          playerStatsById.set(pid, parsed);
        }
      }
    }
  }

  let rawHomeLineup = item.lineups?.find(
    (l) =>
      (homeTeamIdNum !== undefined && l.team?.id === homeTeamIdNum) ||
      l.team?.name?.trim().toLowerCase() === homeTeamName.toLowerCase()
  );
  let rawAwayLineup = item.lineups?.find(
    (l) =>
      (awayTeamIdNum !== undefined && l.team?.id === awayTeamIdNum) ||
      l.team?.name?.trim().toLowerCase() === awayTeamName.toLowerCase()
  );
  if (Array.isArray(item.lineups) && item.lineups.length === 2) {
    if (!rawHomeLineup && rawAwayLineup) {
      rawHomeLineup = item.lineups.find((l) => l !== rawAwayLineup);
    } else if (!rawAwayLineup && rawHomeLineup) {
      rawAwayLineup = item.lineups.find((l) => l !== rawHomeLineup);
    } else if (!rawHomeLineup && !rawAwayLineup) {
      rawHomeLineup = item.lineups[0];
      rawAwayLineup = item.lineups[1];
    }
  }

  const homeLineup = normalizeApiFootballLineupList(
    rawHomeLineup?.startXI,
    homeTeamName,
    isInternational,
    playerStatsById
  );
  const homeBench = normalizeApiFootballLineupList(
    rawHomeLineup?.substitutes,
    homeTeamName,
    isInternational,
    playerStatsById
  );
  const awayLineup = normalizeApiFootballLineupList(
    rawAwayLineup?.startXI,
    awayTeamName,
    isInternational,
    playerStatsById
  );
  const awayBench = normalizeApiFootballLineupList(
    rawAwayLineup?.substitutes,
    awayTeamName,
    isInternational,
    playerStatsById
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
      ...(rawHomeLineup?.coach?.name ? { manager: rawHomeLineup.coach.name } : {}),
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
      ...(rawAwayLineup?.coach?.name ? { manager: rawAwayLineup.coach.name } : {}),
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
  private static readonly fixtureDetailCache = new Map<
    number,
    CacheRecord<Match>
  >();
  private static readonly planWindowErrorCache = new Map<
    string,
    CacheRecord<ApiFootballError>
  >();
  private static readonly lineupsByFixtureCache = new Map<
    number,
    CacheRecord<ApiFootballRawLineup[]>
  >();
  private static readonly eventsByFixtureCache = new Map<
    number,
    CacheRecord<ApiFootballRawEvent[]>
  >();
  private static readonly playersByFixtureCache = new Map<
    number,
    CacheRecord<ApiFootballRawPlayerStatsTeam[]>
  >();
  private static batchIdsSupported: boolean | null = null;

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly nowFn: () => number;
  private readonly cacheRepo: FixtureCacheRepository;

  constructor(options?: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    nowFn?: () => number;
    cacheRepo?: FixtureCacheRepository;
  }) {
    this.apiKey = (options?.apiKey ?? process.env.API_FOOTBALL_KEY ?? "").trim();
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.nowFn = options?.nowFn ?? (() => Date.now());
    this.cacheRepo = options?.cacheRepo ?? getDefaultFixtureCacheRepository();
  }

  static isConfigured(rawKey = process.env.API_FOOTBALL_KEY): boolean {
    const clean = (rawKey ?? "").trim();
    return clean.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(clean);
  }

  static clearCachesForTesting(): void {
    ApiFootballProvider.fixturesByDateCache.clear();
    ApiFootballProvider.fixtureDetailCache.clear();
    ApiFootballProvider.planWindowErrorCache.clear();
    ApiFootballProvider.lineupsByFixtureCache.clear();
    ApiFootballProvider.eventsByFixtureCache.clear();
    ApiFootballProvider.playersByFixtureCache.clear();
    ApiFootballProvider.batchIdsSupported = null;
    clearDefaultFixtureCacheRepositoryForTesting();
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
        throw new ApiFootballError(
          "RATE_LIMIT",
          "API-Football 일일/분당 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
          "API_FOOTBALL_RATE_LIMIT_429"
        );
      }
      if (!res.ok) {
        throw new ApiFootballError(
          "UPSTREAM_ERROR",
          `API-Football 서버 응답 오류(HTTP ${res.status})가 발생했습니다.`,
          `API_FOOTBALL_HTTP_${res.status}`
        );
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
        const rawErrText = JSON.stringify(body.errors);
        const lowerErr = rawErrText.toLowerCase();
        const errObj = !Array.isArray(body.errors) ? body.errors : null;

        if (
          (errObj && "plan" in errObj) ||
          lowerErr.includes("free plans do not have access") ||
          lowerErr.includes("free plan")
        ) {
          throw new ApiFootballError(
            "PLAN_WINDOW",
            "API-Football 무료 플랜 조회 가능 기간(오늘 기준 3일) 밖의 날짜입니다. 데모/폴백 일정을 표시합니다.",
            `API_FOOTBALL_PLAN_WINDOW:${rawErrText}`
          );
        }

        if (
          (errObj && ("requests" in errObj || "rateLimit" in errObj)) ||
          lowerErr.includes("request limit") ||
          lowerErr.includes("too many requests")
        ) {
          throw new ApiFootballError(
            "RATE_LIMIT",
            "API-Football 일일/분당 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
            `API_FOOTBALL_RATE_LIMIT:${rawErrText}`
          );
        }

        throw new ApiFootballError(
          "UPSTREAM_ERROR",
          "API-Football 데이터 조회 중 일시적인 오류가 발생했습니다.",
          `API_FOOTBALL_API_ERROR:${rawErrText}`
        );
      }

      return (body.response ?? ([] as unknown as T)) as T;
    } catch (err) {
      if (err instanceof ApiFootballError) {
        throw err;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new ApiFootballError(
          "TIMEOUT",
          "API-Football 응답 시간이 초과되었습니다(8초).",
          "API_FOOTBALL_TIMEOUT"
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private storeFixtureDetailCaches(
    item: ApiFootballRawFixtureItem,
    fallbackStatus?: MatchStatus
  ): {
    lineups: ApiFootballRawLineup[];
    events?: ApiFootballRawEvent[];
    players?: ApiFootballRawPlayerStatsTeam[];
    normalized: Match;
  } | null {
    const fId = item.fixture?.id;
    if (!fId) return null;

    const now = this.nowFn();
    const status =
      fallbackStatus ??
      mapApiFootballStatus(
        item.fixture?.status?.short,
        item.fixture?.status?.elapsed
      ).status;

    const lineups = Array.isArray(item.lineups) ? item.lineups : [];
    const lineupTtl =
      status === "UPCOMING"
        ? CACHE_TTL_MS.PRE_LINEUPS
        : CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS;
    ApiFootballProvider.lineupsByFixtureCache.set(fId, {
      value: lineups,
      expiresAt: now + lineupTtl,
      updatedAt: now,
    });

    let events: ApiFootballRawEvent[] | undefined;
    if (status !== "UPCOMING") {
      events = Array.isArray(item.events) ? item.events : [];
      const eventTtl =
        status === "LIVE"
          ? CACHE_TTL_MS.LIVE_EVENTS
          : CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS;
      ApiFootballProvider.eventsByFixtureCache.set(fId, {
        value: events,
        expiresAt: now + eventTtl,
        updatedAt: now,
      });
    }

    const players = Array.isArray(item.players) ? item.players : undefined;
    if (players && players.length > 0) {
      ApiFootballProvider.playersByFixtureCache.set(fId, {
        value: players,
        expiresAt: now + CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS,
        updatedAt: now,
      });
    }

    const normalized = normalizeApiFootballFixture({
      ...item,
      ...(lineups.length > 0 ? { lineups } : {}),
      ...(events && events.length > 0 ? { events } : {}),
      ...(players && players.length > 0 ? { players } : {}),
    });

    const detailTtl =
      status === "LIVE"
        ? CACHE_TTL_MS.LIVE_EVENTS
        : status === "UPCOMING"
        ? CACHE_TTL_MS.PRE_LINEUPS
        : CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS;
    ApiFootballProvider.fixtureDetailCache.set(fId, {
      value: normalized,
      expiresAt: now + detailTtl,
      updatedAt: now,
    });

    // Patch any cached date list containing this fixture so subsequent date reads stay enriched
    for (const [dateKey, rec] of ApiFootballProvider.fixturesByDateCache.entries()) {
      const idx = rec.value.findIndex((m) => m.id === normalized.id);
      if (idx !== -1) {
        const nextList = [...rec.value];
        nextList[idx] = normalized;
        ApiFootballProvider.fixturesByDateCache.set(dateKey, {
          ...rec,
          value: nextList,
        });
      }
    }

    return { lineups, events, players, normalized };
  }

  private getFixtureDetailDbTtlMs(status: MatchStatus): number | null {
    if (status === "FT") return null; // Permanent retention in DB cache
    if (status === "LIVE") return CACHE_TTL_MS.LIVE_EVENTS;
    return CACHE_TTL_MS.PRE_LINEUPS;
  }

  private async persistFixtureDetailToRepo(
    fixtureId: number,
    normalized: Match,
    now: number,
    patchDateLists = false
  ): Promise<void> {
    await this.cacheRepo.setFixtureDetail({
      fixtureId,
      match: normalized,
      status: deriveSingleFixtureStatus(normalized),
      fetchedAtMs: now,
      ttlMs: this.getFixtureDetailDbTtlMs(normalized.status),
    });
    if (patchDateLists) {
      await this.cacheRepo.patchFixtureInCachedDates(normalized);
    }
  }

  /**
   * Fetch full detail (lineups, bench, formation, coach, events, player ratings)
   * for a single fixture with 3-tier lookup:
   * 1) in-memory cache -> 2) DB cache (`fixtures_cache`) -> 3) external API (`/fixtures?id={fixtureId}`).
   */
  async fetchFixtureDetail(
    fixtureId: number
  ): Promise<{ match: Match | null; fromCache: boolean }> {
    const now = this.nowFn();
    const cached = ApiFootballProvider.fixtureDetailCache.get(fixtureId);
    if (cached && now < cached.expiresAt) {
      return { match: cached.value, fromCache: true };
    }

    const dbCached = await this.cacheRepo.getFixtureDetail(fixtureId, now);
    if (dbCached) {
      ApiFootballProvider.fixtureDetailCache.set(fixtureId, {
        value: dbCached.match,
        expiresAt:
          dbCached.expiresAtMs ?? now + CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS,
        updatedAt: dbCached.fetchedAtMs,
      });
      return { match: dbCached.match, fromCache: true };
    }

    if (!ApiFootballProvider.isConfigured(this.apiKey)) {
      if (cached) {
        return { match: cached.value, fromCache: true };
      }
      const staleDb = await this.cacheRepo.getStaleFixtureDetail(fixtureId);
      return { match: staleDb?.match ?? null, fromCache: Boolean(staleDb) };
    }

    try {
      const items = await this.requestJson<ApiFootballRawFixtureItem[]>(
        `/fixtures?id=${encodeURIComponent(String(fixtureId))}`
      );
      const raw = items[0];
      if (!raw) {
        if (cached) {
          return { match: cached.value, fromCache: true };
        }
        const staleDb = await this.cacheRepo.getStaleFixtureDetail(fixtureId);
        return { match: staleDb?.match ?? null, fromCache: Boolean(staleDb) };
      }
      const stored = this.storeFixtureDetailCaches(raw);
      if (stored) {
        await this.persistFixtureDetailToRepo(
          fixtureId,
          stored.normalized,
          now,
          true
        );
      }
      return { match: stored?.normalized ?? null, fromCache: false };
    } catch (err) {
      if (cached) {
        return { match: cached.value, fromCache: true };
      }
      const staleDb = await this.cacheRepo.getStaleFixtureDetail(fixtureId);
      if (staleDb) {
        return { match: staleDb.match, fromCache: true };
      }
      throw err;
    }
  }

  private async fetchFixtureDetailsBatch(
    items: Array<{ fixtureId: number; status: MatchStatus }>,
    singleIdCap: number
  ): Promise<
    Map<
      number,
      {
        lineups?: ApiFootballRawLineup[];
        events?: ApiFootballRawEvent[];
        players?: ApiFootballRawPlayerStatsTeam[];
      }
    >
  > {
    const result = new Map<
      number,
      {
        lineups?: ApiFootballRawLineup[];
        events?: ApiFootballRawEvent[];
        players?: ApiFootballRawPlayerStatsTeam[];
      }
    >();
    if (items.length === 0) return result;

    const now = this.nowFn();
    const statusById = new Map<number, MatchStatus>();
    for (const entry of items) {
      statusById.set(entry.fixtureId, entry.status);
    }

    let needSingleFallback =
      items.length === 1 || ApiFootballProvider.batchIdsSupported === false;

    if (!needSingleFallback) {
      for (let i = 0; i < items.length; i += API_FOOTBALL_BATCH_IDS_LIMIT) {
        const chunk = items.slice(i, i + API_FOOTBALL_BATCH_IDS_LIMIT);
        const idsParam = chunk.map((c) => c.fixtureId).join("-");
        try {
          const detailed = await this.requestJson<ApiFootballRawFixtureItem[]>(
            `/fixtures?ids=${idsParam}`
          );
          if (detailed.length > 0) {
            ApiFootballProvider.batchIdsSupported = true;
          }
          for (const item of detailed) {
            const fId = item.fixture?.id;
            if (!fId) continue;
            const stored = this.storeFixtureDetailCaches(item, statusById.get(fId));
            if (stored) {
              await this.persistFixtureDetailToRepo(fId, stored.normalized, now);
              result.set(fId, {
                lineups: stored.lineups,
                events: stored.events,
                players: stored.players,
              });
            }
          }
        } catch (err) {
          if (err instanceof ApiFootballError && err.code === "PLAN_WINDOW") {
            // Free Plan blocks the `ids` batch parameter; immediately switch to `/fixtures?id={id}`.
            ApiFootballProvider.batchIdsSupported = false;
            needSingleFallback = true;
            break;
          }
          // On transient batch error / 429, fall back to cached lineups/events below.
        }
      }
    }

    if (needSingleFallback) {
      const remaining = items
        .filter((entry) => !result.has(entry.fixtureId))
        .slice(0, Math.max(0, singleIdCap));
      for (const entry of remaining) {
        try {
          const singleItems = await this.requestJson<ApiFootballRawFixtureItem[]>(
            `/fixtures?id=${entry.fixtureId}`
          );
          const item = singleItems[0];
          if (!item) continue;
          const stored = this.storeFixtureDetailCaches(item, entry.status);
          if (stored) {
            await this.persistFixtureDetailToRepo(
              entry.fixtureId,
              stored.normalized,
              now
            );
            result.set(entry.fixtureId, {
              lineups: stored.lineups,
              events: stored.events,
              players: stored.players,
            });
          }
        } catch (err) {
          if (err instanceof ApiFootballError && err.code === "RATE_LIMIT") {
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Alias for `fetchMatchesForDate` matching the `FixtureCacheRepository` naming contract.
   */
  async getMatchesByDate(
    targetDate: string,
    options?: { enrichTopDetailsCount?: number }
  ): Promise<{
    matches: Match[];
    fromCache: boolean;
    staleFallback: boolean;
  }> {
    return this.fetchMatchesForDate(targetDate, options);
  }

  /**
   * Fetch and normalize matches for `targetDate` (YYYY-MM-DD) with 3-tier caching:
   * 1) in-memory cache -> 2) DB cache (`fixtures_cache`, permanent for FT) -> 3) external API.
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

    const dbCached = await this.cacheRepo.getMatchesByDate(targetDate, now);
    if (dbCached) {
      ApiFootballProvider.fixturesByDateCache.set(targetDate, {
        value: dbCached.matches,
        expiresAt:
          dbCached.expiresAtMs ?? now + CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS,
        updatedAt: dbCached.fetchedAtMs,
      });
      return {
        matches: dbCached.matches,
        fromCache: true,
        staleFallback: false,
      };
    }

    const cachedPlanErr =
      ApiFootballProvider.planWindowErrorCache.get(targetDate);
    if (!cached && cachedPlanErr && now < cachedPlanErr.expiresAt) {
      throw cachedPlanErr.value;
    }

    if (!ApiFootballProvider.isConfigured(this.apiKey)) {
      if (cached) {
        return { matches: cached.value, fromCache: true, staleFallback: true };
      }
      const staleDb = await this.cacheRepo.getStaleMatchesByDate(targetDate);
      if (staleDb) {
        return {
          matches: staleDb.matches,
          fromCache: true,
          staleFallback: true,
        };
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

      const explicitEnrichLimit = options?.enrichTopDetailsCount;
      const shouldEnrichDetails = explicitEnrichLimit !== 0;

      const dbReusedDetails = new Map<number, Match>();
      const itemsNeedingDetails: Array<{ fixtureId: number; status: MatchStatus }> = [];
      if (shouldEnrichDetails) {
        const prioritizedCandidates: Array<{
          fixtureId: number;
          status: MatchStatus;
          priority: number;
        }> = [];
        for (const item of selectedRaw) {
          const fId = item.fixture?.id;
          if (!fId) continue;
          const st = mapApiFootballStatus(
            item.fixture?.status?.short,
            item.fixture?.status?.elapsed
          ).status;

          const hasInlineLineups =
            Array.isArray(item.lineups) && item.lineups.length > 0;
          const hasInlineEvents =
            Array.isArray(item.events) && item.events.length > 0;
          const cachedLineups = ApiFootballProvider.lineupsByFixtureCache.get(fId);
          const cachedEvents = ApiFootballProvider.eventsByFixtureCache.get(fId);

          const lineupsFresh =
            hasInlineLineups || (cachedLineups !== undefined && now < cachedLineups.expiresAt);
          const eventsFresh =
            st === "UPCOMING" ||
            hasInlineEvents ||
            (cachedEvents !== undefined && now < cachedEvents.expiresAt);

          if (!lineupsFresh || !eventsFresh) {
            const dbDetail = await this.cacheRepo.getFixtureDetail(fId, now);
            const expectedCacheStatus =
              st === "FT" ? "FT" : st === "LIVE" ? "LIVE" : "PRE";
            if (dbDetail && dbDetail.status === expectedCacheStatus) {
              dbReusedDetails.set(fId, dbDetail.match);
              ApiFootballProvider.fixtureDetailCache.set(fId, {
                value: dbDetail.match,
                expiresAt:
                  dbDetail.expiresAtMs ??
                  now + CACHE_TTL_MS.LOCKED_LINEUPS_OR_FT_EVENTS,
                updatedAt: dbDetail.fetchedAtMs,
              });
              continue;
            }
            prioritizedCandidates.push({
              fixtureId: fId,
              status: st,
              priority: st === "LIVE" ? 0 : st === "FT" ? 1 : 2,
            });
          }
        }
        prioritizedCandidates.sort((a, b) => a.priority - b.priority);
        const bounded =
          explicitEnrichLimit !== undefined && explicitEnrichLimit > 0
            ? prioritizedCandidates.slice(0, explicitEnrichLimit)
            : prioritizedCandidates;
        for (const c of bounded) {
          itemsNeedingDetails.push({ fixtureId: c.fixtureId, status: c.status });
        }
      }

      const singleIdCap =
        explicitEnrichLimit !== undefined && explicitEnrichLimit > 0
          ? explicitEnrichLimit
          : API_FOOTBALL_SINGLE_ID_EAGER_LIMIT;

      const fetchedDetailsMap =
        itemsNeedingDetails.length > 0
          ? await this.fetchFixtureDetailsBatch(itemsNeedingDetails, singleIdCap)
          : new Map<
              number,
              {
                lineups?: ApiFootballRawLineup[];
                events?: ApiFootballRawEvent[];
                players?: ApiFootballRawPlayerStatsTeam[];
              }
            >();

      const normalized: Match[] = [];
      for (const item of selectedRaw) {
        const fId = item.fixture?.id;
        if (fId && dbReusedDetails.has(fId)) {
          normalized.push(dbReusedDetails.get(fId)!);
          continue;
        }

        let lineups = item.lineups;
        let events = item.events;
        let players = item.players;
        const hadInlineDetail =
          (Array.isArray(item.lineups) && item.lineups.length > 0) ||
          (Array.isArray(item.events) && item.events.length > 0) ||
          (Array.isArray(item.players) && item.players.length > 0);

        if (fId) {
          const detail = fetchedDetailsMap.get(fId);
          if ((!lineups || lineups.length === 0) && detail?.lineups?.length) {
            lineups = detail.lineups;
          } else if (!lineups || lineups.length === 0) {
            const cachedLineups = ApiFootballProvider.lineupsByFixtureCache.get(fId);
            if (cachedLineups?.value.length) {
              lineups = cachedLineups.value;
            }
          }

          if ((!events || events.length === 0) && detail?.events?.length) {
            events = detail.events;
          } else if (!events || events.length === 0) {
            const cachedEvents = ApiFootballProvider.eventsByFixtureCache.get(fId);
            if (cachedEvents?.value.length) {
              events = cachedEvents.value;
            }
          }

          if ((!players || players.length === 0) && detail?.players?.length) {
            players = detail.players;
          } else if (!players || players.length === 0) {
            const cachedPlayers = ApiFootballProvider.playersByFixtureCache.get(fId);
            if (cachedPlayers?.value.length) {
              players = cachedPlayers.value;
            }
          }
        }

        const normalizedMatch = normalizeApiFootballFixture({
          ...item,
          ...(lineups && lineups.length > 0 ? { lineups } : {}),
          ...(events && events.length > 0 ? { events } : {}),
          ...(players && players.length > 0 ? { players } : {}),
        });

        if (fId && hadInlineDetail && !fetchedDetailsMap.has(fId)) {
          await this.persistFixtureDetailToRepo(fId, normalizedMatch, now);
        }

        normalized.push(normalizedMatch);
      }

      const hasLive = normalized.some((m) => m.status === "LIVE");
      const ttl = hasLive
        ? CACHE_TTL_MS.LIVE_FIXTURES
        : CACHE_TTL_MS.STATIC_FIXTURES;
      const dateStatus = deriveDateMatchesStatus(normalized);
      const dbDateTtlMs =
        dateStatus === "FT" && explicitEnrichLimit !== 0 ? null : ttl;

      ApiFootballProvider.planWindowErrorCache.delete(targetDate);
      ApiFootballProvider.fixturesByDateCache.set(targetDate, {
        value: normalized,
        expiresAt: now + ttl,
        updatedAt: now,
      });
      await this.cacheRepo.setMatchesByDate({
        date: targetDate,
        matches: normalized,
        status: dateStatus,
        fetchedAtMs: now,
        ttlMs: dbDateTtlMs,
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
      const staleDb = await this.cacheRepo.getStaleMatchesByDate(targetDate);
      if (staleDb) {
        return {
          matches: staleDb.matches,
          fromCache: true,
          staleFallback: true,
        };
      }
      if (err instanceof ApiFootballError && err.code === "PLAN_WINDOW") {
        ApiFootballProvider.planWindowErrorCache.set(targetDate, {
          value: err,
          expiresAt: now + CACHE_TTL_MS.STATIC_FIXTURES,
          updatedAt: now,
        });
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
