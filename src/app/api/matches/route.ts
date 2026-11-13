import { NextRequest, NextResponse } from "next/server";
import {
  ApiLineupPlayer,
  Match,
  MatchStatus,
  Position,
  normalizeDetailedPosition,
} from "@/types";
import {
  INITIAL_MATCHES,
  NATIONAL_TEAM_DUMMY_MATCHES,
} from "@/data/dummyData";

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
  if (rawStatus === "IN_PLAY" || rawStatus === "PAUSED" || rawStatus === "LIVE") {
    return "LIVE";
  }
  if (rawStatus === "FINISHED" || rawStatus === "AWARDED") {
    return "FT";
  }
  return "UPCOMING";
}

function normalizeFormationCode(
  rawFormation?: string,
  fallback: "4-3-3" | "4-2-3-1" = "4-3-3"
): "4-3-3" | "4-2-3-1" {
  if (!rawFormation) return fallback;
  const cleaned = rawFormation.trim();
  if (cleaned === "4-2-3-1") return "4-2-3-1";
  if (cleaned === "4-3-3") return "4-3-3";
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
}

interface FootballDataTeamRaw {
  id?: number | string;
  name?: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  formation?: string;
  lineup?: FootballDataLineupPlayerRaw[];
  bench?: FootballDataLineupPlayerRaw[];
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
    const externalId =
      rawId !== undefined
        ? String(rawId)
        : `ext-${teamName.toLowerCase()}-${slug || idx}`;
    const normalizedId =
      rawId !== undefined && String(rawId).startsWith("p-")
        ? String(rawId)
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

  return {
    ...match,
    isInternational,
    homeTeam: {
      ...match.homeTeam,
      formation: normalizeFormationCode(match.homeTeam.formation, "4-3-3"),
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
      formation: normalizeFormationCode(match.awayTeam.formation, "4-2-3-1"),
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
  const rawDateParam = (searchParams.get("date") || "").trim();

  const targetDate = isValidDateStr(rawDateParam)
    ? rawDateParam
    : getKstTodayStr();

  const rawApiKey = process.env.FOOTBALL_DATA_API_KEY;
  const apiKey = rawApiKey?.trim() ?? "";

  const isValidKey = apiKey.length >= 16 && /^[a-zA-Z0-9]+$/.test(apiKey);

  if (!apiKey || !isValidKey) {
    return NextResponse.json({
      source: "MOCK_FALLBACK",
      date: targetDate,
      message: !apiKey
        ? ".env.local에 FOOTBALL_DATA_API_KEY가 비어 있어 데모 경기 데이터를 표시합니다."
        : ".env.local의 FOOTBALL_DATA_API_KEY 형식이 유효하지 않습니다.",
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

    const normalizedMatches: Match[] = finalRawMatches.map((m) => {
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

      return {
        id: `fd-${m.id}`,
        utcDate: m.utcDate,
        leagueId: normalizedLeagueId,
        leagueName: koLeague?.name || m.competition?.name || "유럽 리그",
        leagueCountry: koLeague?.country || m.area?.name || "국제",
        leagueEmblem: m.competition?.emblem || undefined,
        isInternational,
        status,
        rawStatus: String(m.status || ""),
        minute: status === "LIVE" ? m.minute ?? 45 : undefined,
        kickoffTime:
          status === "FT" ? "종료" : formatKstTime(m.utcDate || ""),
        homeTeam: {
          id: homeTla.toLowerCase(),
          name: homeTeamName,
          shortName: homeTla,
          color: getColorForId(m.homeTeam?.id || homeTla),
          crest: m.homeTeam?.crest || undefined,
          score: homeScore ?? undefined,
          formation: normalizeFormationCode(m.homeTeam?.formation, "4-3-3"),
          lineup: normalizeLineupPlayers(
            m.homeTeam?.lineup,
            homeTeamName,
            isInternational
          ),
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
          lineup: normalizeLineupPlayers(
            m.awayTeam?.lineup,
            awayTeamName,
            isInternational
          ),
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
      };
    });

    // Fallback to prepared National Team (A-Match) dummy matches during international breaks when API returns 0 matches
    if (normalizedMatches.length === 0) {
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
      count: normalizedMatches.length,
      matches: normalizedMatches,
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
