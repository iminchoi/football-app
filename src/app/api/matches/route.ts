import { NextRequest, NextResponse } from "next/server";
import {
  ApiLineupPlayer,
  ApiMatchEvent,
  Match,
  MatchStatus,
  Position,
  normalizeDetailedPosition,
} from "@/types";
import {
  INITIAL_MATCHES,
  NATIONAL_TEAM_DUMMY_MATCHES,
} from "@/data/dummyData";
import { deduplicateMatches } from "@/lib/matchSync";
import {
  ApiFootballError,
  ApiFootballProvider,
  getActiveMatchDataProvider,
} from "@/lib/providers";

const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4/matches";

// Upper bound for each upstream call so a stalled provider cannot hang the route.
const UPSTREAM_TIMEOUT_MS = 8000;

const INTERNATIONAL_COMPETITION_CODES = new Set([
  "WC",
  "EC",
  "UNL",
  "NL",
  "CA",
  "AMATCH",
]);

const INTERNATIONAL_COMPETITION_IDS = new Set([
  "2000", // FIFA World Cup
  "2018", // UEFA European Championship
  "2154", // UEFA Nations League
  "2080", // Copa America
]);

// Supported major club leagues + international (A-Match) competitions by code and numeric ID
const TARGET_COMPETITION_CODES = new Set([
  "WC",  // FIFA World Cup / Qualifiers (2000)
  "EC",  // UEFA European Championship (2018)
  "UNL", // UEFA Nations League (2154)
  "NL",  // Nations League alias
  "CLI", // Copa Libertadores / International
  "CA",  // Copa America (2080)
  "PL",  // Premier League (2021)
  "PD",  // La Liga (2014)
  "BL1", // Bundesliga (2002)
  "SA",  // Serie A (2019)
  "FL1", // Ligue 1 (2015)
  "CL",  // UEFA Champions League (2001)
  "DED", // Eredivisie (2003)
  "PPL", // Primeira Liga (2017)
  "ELC", // Championship (2016)
]);

const TARGET_COMPETITION_IDS = new Set([
  "2000", // FIFA World Cup
  "2018", // UEFA European Championship
  "2154", // UEFA Nations League
  "2080", // Copa America
  "2021", // Premier League
  "2014", // La Liga
  "2002", // Bundesliga
  "2019", // Serie A
  "2015", // Ligue 1
  "2001", // UEFA Champions League
  "2003", // Eredivisie
  "2017", // Primeira Liga
  "2016", // Championship
]);

const LEAGUE_KO_MAP: Record<string, { name: string; country: string; order: number }> = {
  WC: { name: "FIFA 월드컵 / 예선", country: "국제 (A매치)", order: 0 },
  "2000": { name: "FIFA 월드컵 / 예선", country: "국제 (A매치)", order: 0 },
  EC: { name: "UEFA 유로 챔피언십", country: "유럽 (A매치)", order: 0 },
  "2018": { name: "UEFA 유로 챔피언십", country: "유럽 (A매치)", order: 0 },
  UNL: { name: "UEFA 네이션스리그", country: "유럽 (A매치)", order: 0 },
  NL: { name: "UEFA 네이션스리그", country: "유럽 (A매치)", order: 0 },
  "2154": { name: "UEFA 네이션스리그", country: "유럽 (A매치)", order: 0 },
  CA: { name: "코파 아메리카", country: "남미 (A매치)", order: 0 },
  "2080": { name: "코파 아메리카", country: "남미 (A매치)", order: 0 },
  PL: { name: "프리미어리그", country: "잉글랜드", order: 1 },
  "2021": { name: "프리미어리그", country: "잉글랜드", order: 1 },
  CL: { name: "UEFA 챔피언스리그", country: "유럽", order: 2 },
  "2001": { name: "UEFA 챔피언스리그", country: "유럽", order: 2 },
  PD: { name: "라리가", country: "스페인", order: 3 },
  "2014": { name: "라리가", country: "스페인", order: 3 },
  BL1: { name: "분데스리가", country: "독일", order: 4 },
  "2002": { name: "분데스리가", country: "독일", order: 4 },
  SA: { name: "세리에 A", country: "이탈리아", order: 5 },
  "2019": { name: "세리에 A", country: "이탈리아", order: 5 },
  FL1: { name: "리그 1", country: "프랑스", order: 6 },
  "2015": { name: "리그 1", country: "프랑스", order: 6 },
  DED: { name: "에레디비시", country: "네덜란드", order: 7 },
  "2003": { name: "에레디비시", country: "네덜란드", order: 7 },
  PPL: { name: "프리메이라리가", country: "포르투갈", order: 8 },
  "2017": { name: "프리메이라리가", country: "포르투갈", order: 8 },
  ELC: { name: "챔피언십", country: "잉글랜드", order: 9 },
  "2016": { name: "챔피언십", country: "잉글랜드", order: 9 },
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

function getColorForId(id: number | string): string {
  const num =
    typeof id === "number"
      ? id
      : id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return TEAM_COLORS[num % TEAM_COLORS.length];
}

function mapApiStatus(rawStatus: string): MatchStatus {
  const upper = rawStatus.trim().toUpperCase();
  if (
    upper === "IN_PLAY" ||
    upper === "PAUSED" ||
    upper === "HT" ||
    upper === "HALF_TIME" ||
    upper === "LIVE"
  ) {
    return "LIVE";
  }
  if (upper === "FINISHED" || upper === "AWARDED") {
    return "FT";
  }
  return "UPCOMING";
}

function normalizeFormationCode(
  rawFormation?: string,
  fallback: "4-3-3" | "4-2-3-1" = "4-3-3",
  preserveNumericDashed = false
): string {
  if (!rawFormation) return fallback;
  const cleaned = rawFormation.trim();
  if (cleaned === "4-2-3-1") return "4-2-3-1";
  if (cleaned === "4-3-3") return "4-3-3";
  if (preserveNumericDashed && /^\d+(?:-\d+){2,3}$/.test(cleaned)) {
    const parts = cleaned.split("-").map(Number);
    if (parts.reduce((sum, n) => sum + n, 0) === 10) {
      return cleaned;
    }
  }
  return fallback;
}

function normalizePosition(
  rawPos?: string,
  dfCounter = 0,
  mfCounter = 0,
  fwCounter = 0
): Position {
  if (!rawPos) return "CM";
  const upper = rawPos.trim().toUpperCase();

  // If rawPos is generic "DF" / "DEFENCE" / "DEFENDER", distribute across LB, CB, CB, RB
  if (upper === "DF" || upper === "DEFENCE" || upper === "DEFENDER") {
    const dfCycle: Position[] = ["LB", "CB", "CB", "RB"];
    return dfCycle[dfCounter % dfCycle.length];
  }
  // If rawPos is generic "MF" / "MIDFIELD" / "MIDFIELDER", distribute across CM, DM, CAM
  if (upper === "MF" || upper === "MIDFIELD" || upper === "MIDFIELDER") {
    const mfCycle: Position[] = ["CM", "DM", "CAM", "LAM", "RAM"];
    return mfCycle[mfCounter % mfCycle.length];
  }
  // If rawPos is generic "FW" / "OFFENCE" / "FORWARD" / "ATTACK", distribute across LW, ST, RW
  if (
    upper === "FW" ||
    upper === "OFFENCE" ||
    upper === "FORWARD" ||
    upper === "ATTACK"
  ) {
    const fwCycle: Position[] = ["LW", "ST", "RW"];
    return fwCycle[fwCounter % fwCycle.length];
  }

  return normalizeDetailedPosition(rawPos);
}

function calculatePlayerAge(dateOfBirth?: string, rawAge?: number): number | undefined {
  if (typeof rawAge === "number" && Number.isFinite(rawAge) && rawAge > 0) {
    return rawAge;
  }
  if (!dateOfBirth) return undefined;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age > 0 ? age : undefined;
}

interface FootballDataLineupPlayerRaw {
  id?: number | string;
  externalId?: string;
  name?: string;
  position?: string;
  shirtNumber?: number;
  team?: string;
  currentTeam?: { name?: string };
  nationalTeam?: string;
  nationality?: string;
  dateOfBirth?: string;
  age?: number;
  isCaptain?: boolean;
  subInMinute?: number;
  subOutMinute?: number;
  yellowCards?: number;
  redCards?: number;
  rating?: number;
}

interface FootballDataTeamRaw {
  id?: number | string;
  name?: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  formation?: string;
  manager?: string;
  coach?: { id?: number | string; name?: string; nationality?: string };
  lineup?: FootballDataLineupPlayerRaw[];
  bench?: FootballDataLineupPlayerRaw[];
}

interface FootballDataEventPersonRaw {
  id?: number | string;
  name?: string;
}

interface FootballDataGoalRaw {
  minute?: number;
  injuryTime?: number | null;
  type?: string;
  team?: { id?: number | string; name?: string };
  scorer?: FootballDataEventPersonRaw;
  assist?: FootballDataEventPersonRaw | null;
}

interface FootballDataBookingRaw {
  minute?: number;
  team?: { id?: number | string; name?: string };
  player?: FootballDataEventPersonRaw;
  card?: string;
}

interface FootballDataSubstitutionRaw {
  minute?: number;
  team?: { id?: number | string; name?: string };
  playerOut?: FootballDataEventPersonRaw;
  playerIn?: FootballDataEventPersonRaw;
}

interface FootballDataMatchRaw {
  id?: number | string;
  utcDate?: string;
  status?: string;
  minute?: number;
  area?: { name?: string };
  competition?: {
    id?: number | string;
    code?: string;
    name?: string;
    emblem?: string;
  };
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
    halfTime?: { home?: number | null; away?: number | null };
  };
  homeTeam?: FootballDataTeamRaw;
  awayTeam?: FootballDataTeamRaw;
  goals?: FootballDataGoalRaw[];
  bookings?: FootballDataBookingRaw[];
  substitutions?: FootballDataSubstitutionRaw[];
}

function normalizeMatchEvents(
  rawMatch: FootballDataMatchRaw,
  matchId: string
): ApiMatchEvent[] | undefined {
  const events: ApiMatchEvent[] = [];

  if (Array.isArray(rawMatch.goals)) {
    rawMatch.goals.forEach((goal, idx) => {
      const minute = Math.min(90, Math.max(1, Number(goal.minute ?? 45)));
      const goalType = String(goal.type || "REGULAR").toUpperCase();
      if (goalType === "OWN") return;

      const scorerName = String(goal.scorer?.name || "").trim();
      if (scorerName) {
        const scorerId =
          goal.scorer?.id !== undefined ? String(goal.scorer.id) : undefined;
        events.push({
          id: `${matchId}-goal-${minute}-${scorerId ?? idx}`,
          minute,
          type: "GOAL",
          playerId: scorerId,
          playerName: scorerName,
          teamName: goal.team?.name,
          source: "REAL",
        });
      }

      const assistName = String(goal.assist?.name || "").trim();
      if (assistName) {
        const assistId =
          goal.assist?.id !== undefined ? String(goal.assist.id) : undefined;
        events.push({
          id: `${matchId}-assist-${minute}-${assistId ?? idx}`,
          minute,
          type: "ASSIST",
          playerId: assistId,
          playerName: assistName,
          teamName: goal.team?.name,
          source: "REAL",
        });
      }
    });
  }

  if (Array.isArray(rawMatch.bookings)) {
    rawMatch.bookings.forEach((booking, idx) => {
      const playerName = String(booking.player?.name || "").trim();
      if (!playerName) return;
      const minute = Math.min(95, Math.max(1, Number(booking.minute ?? 45)));
      const cardUpper = String(booking.card || "YELLOW").toUpperCase();
      const eventType =
        cardUpper.includes("RED") ? "RED_CARD" : "YELLOW_CARD";
      const playerId =
        booking.player?.id !== undefined
          ? String(booking.player.id)
          : undefined;

      events.push({
        id: `${matchId}-${eventType.toLowerCase()}-${minute}-${playerId ?? idx}`,
        minute,
        type: eventType,
        playerId,
        playerName,
        teamName: booking.team?.name,
        source: "REAL",
      });
    });
  }

  if (Array.isArray(rawMatch.substitutions)) {
    rawMatch.substitutions.forEach((sub, idx) => {
      const outName = String(sub.playerOut?.name || "").trim();
      const inName = String(sub.playerIn?.name || "").trim();
      const minute = Math.min(95, Math.max(1, Number(sub.minute ?? 60)));
      if (outName) {
        const outId =
          sub.playerOut?.id !== undefined
            ? String(sub.playerOut.id)
            : undefined;

        events.push({
          id: `${matchId}-subout-${minute}-${outId ?? idx}`,
          minute,
          type: "SUB_OUT",
          playerId: outId,
          playerName: outName,
          teamName: sub.team?.name,
          source: "REAL",
        });
      }
      if (inName) {
        const inId =
          sub.playerIn?.id !== undefined ? String(sub.playerIn.id) : undefined;

        events.push({
          id: `${matchId}-subin-${minute}-${inId ?? idx}`,
          minute,
          type: "SUB_IN",
          playerId: inId,
          playerName: inName,
          teamName: sub.team?.name,
          source: "REAL",
        });
      }
    });
  }

  const hasExplicitEventArrays =
    Array.isArray(rawMatch.goals) ||
    Array.isArray(rawMatch.bookings) ||
    Array.isArray(rawMatch.substitutions);

  return events.length > 0 || hasExplicitEventArrays ? events : undefined;
}

function normalizeLineupPlayers(
  rawList: FootballDataLineupPlayerRaw[] | undefined,
  teamName: string,
  isInternational: boolean
): ApiLineupPlayer[] | undefined {
  if (!Array.isArray(rawList) || rawList.length === 0) return undefined;

  let dfCount = 0;
  let mfCount = 0;
  let fwCount = 0;

  return rawList.map((raw: FootballDataLineupPlayerRaw, idx: number) => {
    const rawId = raw.id ?? raw.externalId;
    const rawName = String(raw.name || `선수 ${idx + 1}`).trim();
    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const rawIdStr = rawId !== undefined ? String(rawId) : "";
    const externalId =
      raw.externalId !== undefined
        ? String(raw.externalId)
        : rawId !== undefined
        ? rawIdStr
        : `ext-${teamName.toLowerCase()}-${slug || idx}`;
    const normalizedId =
      rawId !== undefined &&
      (rawIdStr.startsWith("p-") ||
        rawIdStr.startsWith("af-p-") ||
        rawIdStr.startsWith("api-p-"))
        ? rawIdStr
        : `api-p-${externalId}`;

    const upperRawPos = String(raw.position || "").trim().toUpperCase();
    const position = normalizePosition(raw.position, dfCount, mfCount, fwCount);
    if (
      upperRawPos === "DF" ||
      upperRawPos === "DEFENCE" ||
      upperRawPos === "DEFENDER"
    ) {
      dfCount++;
    } else if (
      upperRawPos === "MF" ||
      upperRawPos === "MIDFIELD" ||
      upperRawPos === "MIDFIELDER"
    ) {
      mfCount++;
    } else if (
      upperRawPos === "FW" ||
      upperRawPos === "OFFENCE" ||
      upperRawPos === "FORWARD" ||
      upperRawPos === "ATTACK"
    ) {
      fwCount++;
    }

    const clubOrTeamName = String(
      raw.team || raw.currentTeam?.name || teamName
    ).trim();
    const nationalTeam = isInternational
      ? teamName
      : String(raw.nationalTeam || raw.nationality || "").trim();
    const age = calculatePlayerAge(raw.dateOfBirth, raw.age);

    return {
      id: normalizedId,
      externalId,
      name: rawName,
      position,
      shirtNumber:
        typeof raw.shirtNumber === "number" ? raw.shirtNumber : undefined,
      team: clubOrTeamName,
      nationalTeam,
      ...(age !== undefined ? { age } : {}),
      ...(raw.isCaptain !== undefined ? { isCaptain: raw.isCaptain } : {}),
      ...(raw.subInMinute !== undefined ? { subInMinute: raw.subInMinute } : {}),
      ...(raw.subOutMinute !== undefined ? { subOutMinute: raw.subOutMinute } : {}),
      ...(raw.yellowCards !== undefined ? { yellowCards: raw.yellowCards } : {}),
      ...(raw.redCards !== undefined ? { redCards: raw.redCards } : {}),
      ...(raw.rating !== undefined ? { rating: raw.rating } : {}),
    };
  });
}

function enrichMatchMetadata(match: Match, defaultInternational = false): Match {
  const isInternational =
    match.isInternational ??
    (defaultInternational ||
      INTERNATIONAL_COMPETITION_CODES.has(match.leagueId.toUpperCase()) ||
      match.leagueCountry.includes("A매치") ||
      match.leagueName.includes("A매치"));

  const preserveFormation = match.providerMode === "DEEP_DATA";
  return {
    ...match,
    isInternational,
    homeTeam: {
      ...match.homeTeam,
      formation: normalizeFormationCode(
        match.homeTeam.formation,
        "4-3-3",
        preserveFormation
      ),
      lineup: normalizeLineupPlayers(
        match.homeTeam.lineup,
        match.homeTeam.name,
        isInternational
      ),
      bench: normalizeLineupPlayers(
        match.homeTeam.bench,
        match.homeTeam.name,
        isInternational
      ),
    },
    awayTeam: {
      ...match.awayTeam,
      formation: normalizeFormationCode(
        match.awayTeam.formation,
        "4-2-3-1",
        preserveFormation
      ),
      lineup: normalizeLineupPlayers(
        match.awayTeam.lineup,
        match.awayTeam.name,
        isInternational
      ),
      bench: normalizeLineupPlayers(
        match.awayTeam.bench,
        match.awayTeam.name,
        isInternational
      ),
    },
  };
}

function formatKstTime(utcDateStr: string): string {
  try {
    const date = new Date(utcDateStr);
    return date.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "00:00";
  }
}

function getKstTodayStr(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date()); // Returns YYYY-MM-DD in KST
}

function isValidDateStr(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && str.length === 10;
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawFixtureIdParam = (searchParams.get("fixtureId") || "").trim();
  const rawDateParam = (searchParams.get("date") || "").trim();

  const rawAfKey = process.env.API_FOOTBALL_KEY?.trim() ?? "";
  const isAfKeyConfigured = ApiFootballProvider.isConfigured(rawAfKey);

  // On-demand single-fixture detail lookup (`/api/matches?fixtureId=af-1557467` or `1557467`)
  if (rawFixtureIdParam) {
    const numericIdMatch = /^(?:af-)?(\d+)$/.exec(rawFixtureIdParam);
    if (!numericIdMatch || !isAfKeyConfigured) {
      return NextResponse.json(
        { source: "API_FOOTBALL", match: null, fromCache: false },
        { status: 200 }
      );
    }
    try {
      const afProvider = new ApiFootballProvider();
      const detail = await afProvider.fetchFixtureDetail(Number(numericIdMatch[1]));
      return NextResponse.json({
        source: "API_FOOTBALL",
        fromCache: detail.fromCache,
        match: detail.match
          ? enrichMatchMetadata(detail.match, Boolean(detail.match.isInternational))
          : null,
      });
    } catch (err: unknown) {
      const message =
        err instanceof ApiFootballError
          ? err.userMessage
          : err instanceof Error
          ? err.message
          : "경기 상세 조회 실패";
      return NextResponse.json(
        { source: "API_FOOTBALL", match: null, message },
        { status: 200 }
      );
    }
  }

  const targetDate = isValidDateStr(rawDateParam)
    ? rawDateParam
    : getKstTodayStr();

  let afErrorMessage: string | null = null;

  // Priority 1: API-Football v3 (`process.env.API_FOOTBALL_KEY`) with server memory cache & fallback
  if (isAfKeyConfigured) {
    try {
      const afProvider = new ApiFootballProvider();
      const afResult = await afProvider.fetchMatchesForDate(targetDate);
      return NextResponse.json({
        source: "API_FOOTBALL",
        date: targetDate,
        count: afResult.matches.length,
        fromCache: afResult.fromCache,
        staleFallback: afResult.staleFallback,
        matches: afResult.matches.map((m) =>
          enrichMatchMetadata(m, Boolean(m.isInternational))
        ),
      });
    } catch (err: unknown) {
      afErrorMessage =
        err instanceof ApiFootballError
          ? err.userMessage
          : err instanceof Error
          ? err.message
          : "API-Football 요청 실패";
      // Fall through cleanly to football-data.org / demo fallback on error
    }
  }

  const rawApiKey = process.env.FOOTBALL_DATA_API_KEY;
  const apiKey = rawApiKey?.trim() ?? "";

  const isValidKey = apiKey.length >= 16 && /^[a-zA-Z0-9]+$/.test(apiKey);

  if (!apiKey || !isValidKey) {
    const fallbackMessage = afErrorMessage
      ? afErrorMessage.endsWith("표시합니다.")
        ? afErrorMessage
        : `API-Football 조회 중 오류가 발생해 데모 경기 데이터를 표시합니다. (${afErrorMessage})`
      : rawAfKey && !isAfKeyConfigured
      ? ".env.local의 API_FOOTBALL_KEY 형식이 유효하지 않아 데모 경기 데이터를 표시합니다."
      : ".env.local에 API_FOOTBALL_KEY가 비어 있어 데모 경기 데이터를 표시합니다.";

    return NextResponse.json({
      source: "MOCK_FALLBACK",
      date: targetDate,
      message: fallbackMessage,
      matches: INITIAL_MATCHES.map((m) => enrichMatchMetadata(m, false)),
    });
  }

  // Fetch window [targetDate - 1, targetDate + 1] so both UTC and KST matches on targetDate are never missed
  const utcDateFrom = shiftDateString(targetDate, -1);
  const utcDateTo = shiftDateString(targetDate, 1);

  const requestUrl = `${FOOTBALL_DATA_BASE_URL}?dateFrom=${utcDateFrom}&dateTo=${utcDateTo}`;
  const plFallbackUrl = `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${utcDateFrom}&dateTo=${utcDateTo}`;

  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": apiKey,
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        {
          source: "API_ERROR_FALLBACK",
          date: targetDate,
          message: `Football-Data API 응답 오류 (Status: ${res.status}). 데모 데이터를 대신 표시합니다.`,
          errorDetail: data,
          matches: INITIAL_MATCHES.map((m) => enrichMatchMetadata(m, false)),
        },
        { status: 200 }
      );
    }

    const rawMatches: FootballDataMatchRaw[] = Array.isArray(data.matches)
      ? (data.matches as FootballDataMatchRaw[])
      : [];

    // Check if Premier League (PL / 2021) is present in rawMatches; if not, also check /v4/competitions/PL/matches
    const hasPlInRaw = rawMatches.some(
      (m) =>
        String(m.competition?.code || "").toUpperCase() === "PL" ||
        String(m.competition?.id || "") === "2021"
    );

    if (!hasPlInRaw) {
      const plRes = await fetch(plFallbackUrl, {
        method: "GET",
        headers: { "X-Auth-Token": apiKey },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      }).catch(() => null);

      if (plRes && plRes.ok) {
        const plData = await plRes.json().catch(() => ({}));
        if (Array.isArray(plData.matches) && plData.matches.length > 0) {
          const existingIds = new Set(rawMatches.map((m) => m.id));
          for (const pm of plData.matches) {
            if (!existingIds.has(pm.id)) {
              rawMatches.push(pm);
            }
          }
        }
      }
    }

    // 1) Filter by date (either UTC date === targetDate OR KST date === targetDate)
    const dateMatched = rawMatches.filter((m) => {
      if (!m.utcDate) return true;
      const utcDay = String(m.utcDate).slice(0, 10);
      let kstDay = utcDay;
      try {
        kstDay = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(m.utcDate));
      } catch {
        // ignore
      }
      return utcDay === targetDate || kstDay === targetDate;
    });

    // 2) Filter by competition code ("PL", etc.) OR competition id ("2021", etc.)
    const majorLeagueMatches = dateMatched.filter((m) => {
      const code = String(m.competition?.code || "").toUpperCase();
      const idStr = String(m.competition?.id || "");
      return (
        TARGET_COMPETITION_CODES.has(code) || TARGET_COMPETITION_IDS.has(idStr)
      );
    });

    const finalRawMatches =
      majorLeagueMatches.length > 0 ? majorLeagueMatches : dateMatched;

    // Sort so A-Match (order 0) and Premier League (PL / 2021, order 1) appear at the top
    finalRawMatches.sort((a, b) => {
      const codeA = String(a.competition?.code || a.competition?.id || "").toUpperCase();
      const codeB = String(b.competition?.code || b.competition?.id || "").toUpperCase();
      const orderA = LEAGUE_KO_MAP[codeA]?.order ?? 99;
      const orderB = LEAGUE_KO_MAP[codeB]?.order ?? 99;
      return orderA - orderB;
    });

    const activeProvider = getActiveMatchDataProvider();

    const normalizedMatches: Match[] = await Promise.all(
      finalRawMatches.map(async (m) => {
        const compCode = String(m.competition?.code || "").toUpperCase();
        const compIdStr = String(m.competition?.id || "");
        const koLeague =
          LEAGUE_KO_MAP[compCode] || LEAGUE_KO_MAP[compIdStr];
        const status = mapApiStatus(String(m.status || ""));

        const isInternational =
          INTERNATIONAL_COMPETITION_CODES.has(compCode) ||
          INTERNATIONAL_COMPETITION_IDS.has(compIdStr) ||
          Boolean(koLeague?.country?.includes("A매치"));

        const homeScore =
          m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? undefined;
        const awayScore =
          m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? undefined;

        const homeTla =
          m.homeTeam?.tla ||
          (m.homeTeam?.shortName || m.homeTeam?.name || "HOM")
            .slice(0, 3)
            .toUpperCase();
        const awayTla =
          m.awayTeam?.tla ||
          (m.awayTeam?.shortName || m.awayTeam?.name || "AWY")
            .slice(0, 3)
            .toUpperCase();

        const homeTeamName = m.homeTeam?.shortName || m.homeTeam?.name || "홈팀";
        const awayTeamName = m.awayTeam?.shortName || m.awayTeam?.name || "원정팀";

        // Normalize leagueId so PL / 2021 always groups cleanly under "pl-2021"
        const normalizedLeagueId =
          compCode === "PL" || compIdStr === "2021"
            ? "pl-2021"
            : String(compCode || compIdStr || "other").toLowerCase();

        const matchId = `fd-${m.id}`;
        const homeLineup = normalizeLineupPlayers(
          m.homeTeam?.lineup,
          homeTeamName,
          isInternational
        );
        const awayLineup = normalizeLineupPlayers(
          m.awayTeam?.lineup,
          awayTeamName,
          isInternational
        );
        const usesDummyLineup =
          (!homeLineup || homeLineup.length === 0) &&
          (!awayLineup || awayLineup.length === 0);

        let matchEvents = normalizeMatchEvents(m, matchId);
        if (
          (!matchEvents || matchEvents.length === 0) &&
          status !== "UPCOMING" &&
          ((homeScore ?? 0) > 0 || (awayScore ?? 0) > 0)
        ) {
          const snapshotEval = await activeProvider.evaluateSnapshot(
            null,
            {
              matchId,
              homeScore: homeScore ?? 0,
              awayScore: awayScore ?? 0,
              status,
              minute: status === "LIVE" ? m.minute ?? 45 : 90,
            }
          );
          if (snapshotEval.teamEvents.length > 0) {
            matchEvents = snapshotEval.teamEvents
              .filter((te) => te.kind === "GOAL" || te.kind === "ASSIST")
              .map((te) => ({
                id: te.id,
                minute: te.minute,
                type: te.kind === "GOAL" ? "GOAL" : "ASSIST",
                playerId: te.actorPlayerId,
                playerName: te.actorPlayerId ?? homeTeamName,
                teamName: te.teamSide === "HOME" ? homeTeamName : awayTeamName,
                source: te.source,
                estimated: te.estimated,
                metadata: te.metadata,
              }));
          }
        }

        const homeManager =
          m.homeTeam?.coach?.name?.trim() ||
          m.homeTeam?.manager?.trim() ||
          undefined;
        const awayManager =
          m.awayTeam?.coach?.name?.trim() ||
          m.awayTeam?.manager?.trim() ||
          undefined;

        return {
          id: matchId,
          utcDate: m.utcDate,
          leagueId: normalizedLeagueId,
          leagueName: koLeague?.name || m.competition?.name || "유럽 리그",
          leagueCountry: koLeague?.country || m.area?.name || "국제",
          leagueEmblem: m.competition?.emblem || undefined,
          isInternational,
          status,
          rawStatus: String(m.status || ""),
          minute:
            status === "FT"
              ? 90
              : status === "LIVE"
              ? ["PAUSED", "HT", "HALF_TIME"].includes(
                  String(m.status || "").trim().toUpperCase()
                )
                ? 45
                : m.minute ?? 45
              : undefined,
          kickoffTime:
            status === "FT" ? "종료" : formatKstTime(m.utcDate || ""),
          providerMode: activeProvider.mode,
          usesDummyLineup,
          ...(homeManager ? { homeManager } : {}),
          ...(awayManager ? { awayManager } : {}),
          homeTeam: {
            id: homeTla.toLowerCase(),
            name: homeTeamName,
            shortName: homeTla,
            color: getColorForId(m.homeTeam?.id || homeTla),
            crest: m.homeTeam?.crest || undefined,
            score: homeScore ?? undefined,
            formation: normalizeFormationCode(m.homeTeam?.formation, "4-3-3"),
            ...(homeManager ? { manager: homeManager } : {}),
            lineup: homeLineup,
            bench: normalizeLineupPlayers(
              m.homeTeam?.bench,
              homeTeamName,
              isInternational
            ),
          },
          awayTeam: {
            id: awayTla.toLowerCase(),
            name: awayTeamName,
            shortName: awayTla,
            color: getColorForId(m.awayTeam?.id || awayTla),
            crest: m.awayTeam?.crest || undefined,
            score: awayScore ?? undefined,
            formation: normalizeFormationCode(m.awayTeam?.formation, "4-2-3-1"),
            ...(awayManager ? { manager: awayManager } : {}),
            lineup: awayLineup,
            bench: normalizeLineupPlayers(
              m.awayTeam?.bench,
              awayTeamName,
              isInternational
            ),
          },
          highlightText:
            status === "LIVE"
              ? "실시간 경기 진행 중 · 선수 시세 실시간 변동"
              : status === "FT"
              ? `경기 종료 (${homeScore ?? 0} : ${awayScore ?? 0})`
              : `킥오프 ${formatKstTime(m.utcDate || "")} (KST)`,
          ...(matchEvents !== undefined ? { events: matchEvents } : {}),
        };
      })
    );

    const dedupedMatches = deduplicateMatches(
      normalizedMatches,
      targetDate === getKstTodayStr() ? targetDate : false
    );

    // Fallback to prepared National Team (A-Match) dummy matches during international breaks when API returns 0 matches
    if (dedupedMatches.length === 0) {
      return NextResponse.json({
        source: "AMATCH_FALLBACK",
        date: targetDate,
        count: NATIONAL_TEAM_DUMMY_MATCHES.length,
        message:
          "클럽 리그 휴식기(A매치 주간)로 주요 국가대표 매치업 및 클럽-대표팀 통합 시세를 표시합니다.",
        matches: NATIONAL_TEAM_DUMMY_MATCHES.map((m) =>
          enrichMatchMetadata(m, true)
        ),
      });
    }

    return NextResponse.json({
      source: "FOOTBALL_DATA_API",
      date: targetDate,
      count: dedupedMatches.length,
      matches: dedupedMatches,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      source: "NETWORK_FALLBACK",
      date: targetDate,
      message: `API 연동 중 네트워크 예외가 발생해 데모 경기를 표시합니다. (${errorMessage})`,
      matches: INITIAL_MATCHES.map((m) => enrichMatchMetadata(m, false)),
    });
  }
}
