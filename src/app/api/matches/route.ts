import { NextRequest, NextResponse } from "next/server";
import { Match, MatchStatus } from "@/types";
import { INITIAL_MATCHES } from "@/data/dummyData";

const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4/matches";

// Supported major European competitions by code (e.g. "PL") and numeric ID (e.g. "2021")
const TARGET_COMPETITION_CODES = new Set([
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
    console.log(
      `[DEBUG API KEY]: Missing or invalid key (length: ${apiKey.length}). Returning MOCK_FALLBACK for date=${targetDate}`
    );
    return NextResponse.json({
      source: "MOCK_FALLBACK",
      date: targetDate,
      message: !apiKey
        ? ".env.local에 FOOTBALL_DATA_API_KEY가 비어 있어 데모 경기 데이터를 표시합니다."
        : ".env.local의 FOOTBALL_DATA_API_KEY 형식이 유효하지 않습니다.",
      matches: INITIAL_MATCHES,
    });
  }

  // Fetch window [targetDate - 1, targetDate + 1] so both UTC and KST matches on targetDate are never missed
  const utcDateFrom = shiftDateString(targetDate, -1);
  const utcDateTo = shiftDateString(targetDate, 1);

  const requestUrl = `${FOOTBALL_DATA_BASE_URL}?dateFrom=${utcDateFrom}&dateTo=${utcDateTo}`;
  const plFallbackUrl = `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${utcDateFrom}&dateTo=${utcDateTo}`;

  console.log("[DEBUG API URL]:", requestUrl);

  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "X-Auth-Token": apiKey,
      },
      next: { revalidate: 60 },
    });

    console.log("[DEBUG API STATUS]:", res.status, res.statusText);

    const data = await res.json().catch(() => ({}));
    console.log("[DEBUG RAW RES]:", JSON.stringify(data));

    if (!res.ok) {
      return NextResponse.json(
        {
          source: "API_ERROR_FALLBACK",
          date: targetDate,
          message: `Football-Data API 응답 오류 (Status: ${res.status}). 데모 데이터를 대신 표시합니다.`,
          errorDetail: data,
          matches: INITIAL_MATCHES,
        },
        { status: 200 }
      );
    }

    let rawMatches: Array<Record<string, any>> = Array.isArray(data.matches)
      ? data.matches
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
      }).catch(() => null);

      if (plRes && plRes.ok) {
        const plData = await plRes.json().catch(() => ({}));
        if (Array.isArray(plData.matches) && plData.matches.length > 0) {
          console.log(
            `[DEBUG PL DIRECT FETCH]: Added ${plData.matches.length} PL (2021) matches from /competitions/PL/matches`
          );
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

    // Sort so Premier League (PL / 2021) always appears at the top
    finalRawMatches.sort((a, b) => {
      const codeA = String(a.competition?.code || a.competition?.id || "").toUpperCase();
      const codeB = String(b.competition?.code || b.competition?.id || "").toUpperCase();
      const orderA = LEAGUE_KO_MAP[codeA]?.order ?? 99;
      const orderB = LEAGUE_KO_MAP[codeB]?.order ?? 99;
      return orderA - orderB;
    });

    console.log(
      `[DEBUG FILTERED COUNT]: raw=${rawMatches.length}, dateMatched=${dateMatched.length}, final=${finalRawMatches.length} (targetDate=${targetDate})`
    );

    const normalizedMatches: Match[] = finalRawMatches.map((m) => {
      const compCode = String(m.competition?.code || "").toUpperCase();
      const compIdStr = String(m.competition?.id || "");
      const koLeague =
        LEAGUE_KO_MAP[compCode] || LEAGUE_KO_MAP[compIdStr];
      const status = mapApiStatus(m.status);

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
        status,
        rawStatus: String(m.status || ""),
        minute: status === "LIVE" ? m.minute ?? 45 : undefined,
        kickoffTime:
          status === "FT" ? "종료" : formatKstTime(m.utcDate || ""),
        homeTeam: {
          id: homeTla.toLowerCase(),
          name: m.homeTeam?.shortName || m.homeTeam?.name || "홈팀",
          shortName: homeTla,
          color: getColorForId(m.homeTeam?.id || homeTla),
          crest: m.homeTeam?.crest || undefined,
          score: homeScore ?? undefined,
          formation: m.homeTeam?.formation || "4-3-3",
          lineup: Array.isArray(m.homeTeam?.lineup) ? m.homeTeam.lineup : undefined,
          bench: Array.isArray(m.homeTeam?.bench) ? m.homeTeam.bench : undefined,
        },
        awayTeam: {
          id: awayTla.toLowerCase(),
          name: m.awayTeam?.shortName || m.awayTeam?.name || "원정팀",
          shortName: awayTla,
          color: getColorForId(m.awayTeam?.id || awayTla),
          crest: m.awayTeam?.crest || undefined,
          score: awayScore ?? undefined,
          formation: m.awayTeam?.formation || "4-2-3-1",
          lineup: Array.isArray(m.awayTeam?.lineup) ? m.awayTeam.lineup : undefined,
          bench: Array.isArray(m.awayTeam?.bench) ? m.awayTeam.bench : undefined,
        },
        highlightText:
          status === "LIVE"
            ? "실시간 경기 진행 중 · 선수 시세 실시간 변동"
            : status === "FT"
            ? `경기 종료 (${homeScore ?? 0} : ${awayScore ?? 0})`
            : `킥오프 ${formatKstTime(m.utcDate || "")} (KST)`,
      };
    });

    return NextResponse.json({
      source: "FOOTBALL_DATA_API",
      date: targetDate,
      count: normalizedMatches.length,
      matches: normalizedMatches,
    });
  } catch (error: any) {
    console.log(
      `[DEBUG API EXCEPTION] (${targetDate}):`,
      error?.message || error
    );
    return NextResponse.json({
      source: "NETWORK_FALLBACK",
      date: targetDate,
      message: `API 연동 중 네트워크 예외가 발생해 데모 경기를 표시합니다. (${
        error?.message || "Unknown error"
      })`,
      matches: INITIAL_MATCHES,
    });
  }
}
