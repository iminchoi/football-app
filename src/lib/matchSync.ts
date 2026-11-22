import {
  buildActiveMatchContext,
  type ActiveMatchContext,
  type ApiLineupPlayer,
  type Match,
  type MatchStatus,
  type Player,
  type TeamInfo,
} from "../types/index.ts";

export const PINNED_TODAY_FIXTURE_IDS = ["m-new-ars"] as const;

export type MatchClockPhase = "PRE" | "1H" | "HT" | "2H" | "FT";

export interface ResolvedMatchClock {
  status: MatchStatus;
  phase: MatchClockPhase;
  minute: number;
  kickoffTime: string;
  isLive: boolean;
  isHalfTime: boolean;
  isFinished: boolean;
  isUpcoming: boolean;
  /** Compact pill label: "PRE" | "1H 38'" | "HT" | "2H 72'" | "FT" */
  shortLabel: string;
  /** Schedule card & lineup modal label: kickoffTime | "전반 38'" | "하프타임 (HT)" | "후반 72'" | "경기 종료 (FT)" */
  cardLabel: string;
  /** Chart tab label: "경기 예정 (PRE)" | "LIVE 1H 38'" | "LIVE HT" | "LIVE 2H 72'" | "당일 경기 (FT)" */
  chartLabel: string;
}

export interface ResolvedMatchScore {
  homeScore: number;
  awayScore: number;
  hasScore: boolean;
  /** "vs" for PRE, "${homeScore} : ${awayScore}" for LIVE/FT */
  display: string;
}

const CANONICAL_TEAM_ALIAS_MAP: Record<string, string> = {
  // Premier League
  new: "NEW",
  newcastle: "NEW",
  "newcastle united": "NEW",
  "newcastle utd": "NEW",
  뉴캐슬: "NEW",
  "뉴캐슬 유나이티드": "NEW",

  ars: "ARS",
  arsenal: "ARS",
  아스날: "ARS",
  아스널: "ARS",

  tot: "TOT",
  spurs: "TOT",
  tottenham: "TOT",
  "tottenham hotspur": "TOT",
  토트넘: "TOT",
  "토트넘 홋스퍼": "TOT",

  mci: "MCI",
  "man city": "MCI",
  "manchester city": "MCI",
  맨시티: "MCI",
  "맨체스터 시티": "MCI",

  liv: "LIV",
  liverpool: "LIV",
  리버풀: "LIV",

  che: "CHE",
  chelsea: "CHE",
  첼시: "CHE",

  mun: "MUN",
  "man utd": "MUN",
  "man united": "MUN",
  "manchester united": "MUN",
  맨유: "MUN",
  "맨체스터 유나이티드": "MUN",

  // European clubs
  rma: "RMA",
  "real madrid": "RMA",
  "레알 마드리드": "RMA",

  bay: "BAY",
  bayern: "BAY",
  "bayern munich": "BAY",
  "bayern munchen": "BAY",
  "바이에른 뮌헨": "BAY",

  psg: "PSG",
  "paris sg": "PSG",
  "paris saint-germain": "PSG",
  "paris saint germain": "PSG",
  "파리 생제르맹": "PSG",

  bar: "BAR",
  barca: "BAR",
  barcelona: "BAR",
  바르셀로나: "BAR",

  int: "INT",
  inter: "INT",
  "inter milan": "INT",
  internazionale: "INT",
  "internazionale milano": "INT",
  인테르: "INT",
  "인테르 밀란": "INT",

  juv: "JUV",
  juventus: "JUV",
  유벤투스: "JUV",

  // National teams
  kor: "KOR",
  "south korea": "KOR",
  "korea republic": "KOR",
  "republic of korea": "KOR",
  대한민국: "KOR",
  한국: "KOR",

  jpn: "JPN",
  japan: "JPN",
  일본: "JPN",

  eng: "ENG",
  england: "ENG",
  잉글랜드: "ENG",

  esp: "ESP",
  spain: "ESP",
  스페인: "ESP",

  por: "POR",
  prt: "POR",
  portugal: "POR",
  포르투갈: "POR",

  nor: "NOR",
  norway: "NOR",
  노르웨이: "NOR",

  fra: "FRA",
  france: "FRA",
  프랑스: "FRA",

  ger: "GER",
  deu: "GER",
  germany: "GER",
  독일: "GER",

  bra: "BRA",
  brazil: "BRA",
  브라질: "BRA",

  arg: "ARG",
  argentina: "ARG",
  아르헨티나: "ARG",

  ita: "ITA",
  italy: "ITA",
  이탈리아: "ITA",

  ned: "NED",
  nld: "NED",
  netherlands: "NED",
  네덜란드: "NED",

  bel: "BEL",
  belgium: "BEL",
  벨기에: "BEL",
};

function cleanTeamToken(raw?: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stripClubSuffixes(token: string): string {
  return token
    .replace(/^(fc|afc|cf|sc|ac|bc|ssc|as)\s+/i, "")
    .replace(/\s+(fc|afc|cf|sc|ac|bc)$/i, "")
    .trim();
}

export function canonicalizeTeamKey(
  team?: Pick<TeamInfo, "id" | "name" | "shortName"> | null
): string {
  if (!team) return "";
  // Check full/stripped club name before shortName/id so shared TLAs (e.g. "FCB" for
  // FC Barcelona vs FC Bayern Munich) always disambiguate cleanly.
  const candidates = [
    cleanTeamToken(team.name),
    stripClubSuffixes(cleanTeamToken(team.name)),
    cleanTeamToken(team.shortName),
    cleanTeamToken(team.id),
  ].filter(Boolean);

  for (const token of candidates) {
    const mapped = CANONICAL_TEAM_ALIAS_MAP[token];
    if (mapped) return mapped;
  }

  const shortToken = cleanTeamToken(team.shortName);
  if (/^[a-z0-9]{2,4}$/.test(shortToken)) return shortToken.toUpperCase();

  const idToken = cleanTeamToken(team.id);
  if (/^[a-z0-9]{2,6}$/.test(idToken)) return idToken.toUpperCase();

  const strippedName = stripClubSuffixes(cleanTeamToken(team.name));
  return (
    strippedName.replace(/[^a-z0-9가-힣]+/g, "-").toUpperCase() || "UNKNOWN"
  );
}

export function getCanonicalTeamPairKey(
  match: Pick<Match, "homeTeam" | "awayTeam">
): string {
  return `${canonicalizeTeamKey(match.homeTeam)}::${canonicalizeTeamKey(
    match.awayTeam
  )}`;
}

export function toLocalDateStr(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toKstDateStr(utcDateStr?: string): string | null {
  if (!utcDateStr) return null;
  const dt = new Date(utcDateStr);
  if (Number.isNaN(dt.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function toUtcDateStr(utcDateStr?: string): string | null {
  if (!utcDateStr) return null;
  const slice = utcDateStr.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function getMatchDateCandidates(match: Match): string[] {
  const dates: string[] = [];
  const utc = toUtcDateStr(match.utcDate);
  const kst = toKstDateStr(match.utcDate);
  const dt = match.utcDate ? new Date(match.utcDate) : null;
  const local = dt && !Number.isNaN(dt.getTime()) ? toLocalDateStr(dt) : null;
  if (utc) dates.push(utc);
  if (kst && !dates.includes(kst)) dates.push(kst);
  if (local && !dates.includes(local)) dates.push(local);
  return dates;
}

export function isApiBackedMatch(match: Match): boolean {
  return match.id.startsWith("fd-") || Boolean(match.utcDate);
}

/**
 * Determine whether two Match objects represent the exact same fixture
 * (matching by ID or canonical team pair + compatible date/fixture identity).
 */
export function isSameMatchFixture(
  a: Match,
  b: Match,
  isTodayOrDateStr?: boolean | string
): boolean {
  if (a.id === b.id) return true;
  if (getCanonicalTeamPairKey(a) !== getCanonicalTeamPairKey(b)) return false;

  const contextDateStr =
    typeof isTodayOrDateStr === "string" ? isTodayOrDateStr : undefined;
  const isToday = isTodayOrDateStr === true || Boolean(contextDateStr);

  const aDates = getMatchDateCandidates(a);
  const bDates = getMatchDateCandidates(b);

  if (aDates.length > 0 && bDates.length > 0) {
    if (aDates.some((d) => bDates.includes(d))) return true;
    if (
      contextDateStr &&
      aDates.includes(contextDateStr) &&
      bDates.includes(contextDateStr)
    ) {
      return true;
    }
    return false;
  }

  if (aDates.length > 0 && bDates.length === 0) {
    if (b.dateKey && b.dateKey !== "TODAY") return false;
    if (contextDateStr) return aDates.includes(contextDateStr);
    return isToday || !b.dateKey;
  }

  if (bDates.length > 0 && aDates.length === 0) {
    if (a.dateKey && a.dateKey !== "TODAY") return false;
    if (contextDateStr) return bDates.includes(contextDateStr);
    return isToday || !a.dateKey;
  }

  if (a.dateKey && b.dateKey) {
    return a.dateKey === b.dateKey;
  }

  return true;
}

function stripLineupMatchEvents(
  list?: ApiLineupPlayer[]
): ApiLineupPlayer[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.map((entry) => ({
    ...(entry.id !== undefined ? { id: entry.id } : {}),
    ...(entry.externalId !== undefined ? { externalId: entry.externalId } : {}),
    name: entry.name,
    ...(entry.position !== undefined ? { position: entry.position } : {}),
    ...(entry.shirtNumber !== undefined
      ? { shirtNumber: entry.shirtNumber }
      : {}),
    ...(entry.team !== undefined ? { team: entry.team } : {}),
    ...(entry.nationalTeam !== undefined
      ? { nationalTeam: entry.nationalTeam }
      : {}),
    ...(entry.age !== undefined ? { age: entry.age } : {}),
    ...(entry.isCaptain !== undefined ? { isCaptain: entry.isCaptain } : {}),
    ...(entry.rating !== undefined ? { rating: entry.rating } : {}),
  }));
}

/**
 * Enrich an authoritative primary match record (e.g., live API match) with
 * structural metadata from a matching fixture record without overwriting live
 * clock, status, score, or polluting `SCORE_ONLY` data with dummy replay events.
 */
export function enrichMatchFromFixture(primary: Match, fixture: Match): Match {
  const isPrimaryScoreOnly = primary.providerMode === "SCORE_ONLY";
  const isolateFixtureEvents =
    isPrimaryScoreOnly ||
    resolveMatchClock(primary).isUpcoming ||
    (isApiBackedMatch(primary) && !isApiBackedMatch(fixture));

  const homeManager =
    primary.homeManager?.trim() ||
    primary.homeTeam.manager?.trim() ||
    fixture.homeManager?.trim() ||
    fixture.homeTeam.manager?.trim() ||
    undefined;
  const awayManager =
    primary.awayManager?.trim() ||
    primary.awayTeam.manager?.trim() ||
    fixture.awayManager?.trim() ||
    fixture.awayTeam.manager?.trim() ||
    undefined;

  const mergeTeamLineup = (
    primaryList?: ApiLineupPlayer[],
    fixtureList?: ApiLineupPlayer[]
  ): ApiLineupPlayer[] | undefined => {
    if (Array.isArray(primaryList) && primaryList.length > 0) {
      return primaryList;
    }
    if (!Array.isArray(fixtureList) || fixtureList.length === 0) {
      return primaryList;
    }
    return isolateFixtureEvents
      ? stripLineupMatchEvents(fixtureList)
      : fixtureList;
  };

  const homeLineup = mergeTeamLineup(
    primary.homeTeam.lineup,
    fixture.homeTeam.lineup
  );
  const homeBench = mergeTeamLineup(
    primary.homeTeam.bench,
    fixture.homeTeam.bench
  );
  const awayLineup = mergeTeamLineup(
    primary.awayTeam.lineup,
    fixture.awayTeam.lineup
  );
  const awayBench = mergeTeamLineup(
    primary.awayTeam.bench,
    fixture.awayTeam.bench
  );

  // Keep live SCORE_ONLY, UPCOMING, and API-backed matches isolated from static fixture events
  const mergedEvents = isolateFixtureEvents
    ? primary.events
    : Array.isArray(primary.events) && primary.events.length > 0
    ? primary.events
    : fixture.events;

  const hasEnrichedLineups =
    Boolean(homeLineup && homeLineup.length > 0) ||
    Boolean(awayLineup && awayLineup.length > 0);

  return {
    ...primary,
    ...(primary.utcDate ?? fixture.utcDate
      ? { utcDate: primary.utcDate ?? fixture.utcDate }
      : {}),
    ...(primary.leagueEmblem ?? fixture.leagueEmblem
      ? { leagueEmblem: primary.leagueEmblem ?? fixture.leagueEmblem }
      : {}),
    ...(primary.usesDummyLineup !== undefined
      ? { usesDummyLineup: hasEnrichedLineups ? false : primary.usesDummyLineup }
      : {}),
    ...(homeManager ? { homeManager } : {}),
    ...(awayManager ? { awayManager } : {}),
    homeTeam: {
      ...primary.homeTeam,
      ...(primary.homeTeam.crest ?? fixture.homeTeam.crest
        ? { crest: primary.homeTeam.crest ?? fixture.homeTeam.crest }
        : {}),
      formation:
        primary.usesDummyLineup && fixture.homeTeam.formation
          ? fixture.homeTeam.formation
          : primary.homeTeam.formation ?? fixture.homeTeam.formation,
      ...(homeManager ? { manager: homeManager } : {}),
      ...(homeLineup ? { lineup: homeLineup } : {}),
      ...(homeBench ? { bench: homeBench } : {}),
    },
    awayTeam: {
      ...primary.awayTeam,
      ...(primary.awayTeam.crest ?? fixture.awayTeam.crest
        ? { crest: primary.awayTeam.crest ?? fixture.awayTeam.crest }
        : {}),
      formation:
        primary.usesDummyLineup && fixture.awayTeam.formation
          ? fixture.awayTeam.formation
          : primary.awayTeam.formation ?? fixture.awayTeam.formation,
      ...(awayManager ? { manager: awayManager } : {}),
      ...(awayLineup ? { lineup: awayLineup } : {}),
      ...(awayBench ? { bench: awayBench } : {}),
    },
    ...(mergedEvents ? { events: mergedEvents } : {}),
  };
}

/**
 * Deduplicate matches by exact ID or canonical team pair + date identity.
 * API-backed matches take precedence as primary while static metadata is
 * merged from secondary fixture records.
 */
export function deduplicateMatches(
  matches: Match[],
  isTodayOrDateStr?: boolean | string
): Match[] {
  const result: Match[] = [];

  for (const candidate of matches) {
    const existingIdx = result.findIndex((existing) =>
      isSameMatchFixture(existing, candidate, isTodayOrDateStr)
    );
    if (existingIdx === -1) {
      result.push(candidate);
      continue;
    }

    const existing = result[existingIdx];
    const candidatePreferred =
      isApiBackedMatch(candidate) && !isApiBackedMatch(existing);
    result[existingIdx] = candidatePreferred
      ? enrichMatchFromFixture(candidate, existing)
      : enrichMatchFromFixture(existing, candidate);
  }

  return result;
}

/**
 * Guarantee pinned today-only fixtures (such as `m-new-ars` Newcastle vs Arsenal)
 * merge into an existing matching fixture when present (preventing duplicate
 * match cards for the same game), or stay cleanly separated when no matching
 * fixture exists in the live/API list.
 */
export function mergePinnedFixturesForToday(
  fetchedMatches: Match[],
  fixturePool: Match[],
  isToday: boolean,
  todayDateStr?: string
): Match[] {
  const deduped = deduplicateMatches(
    fetchedMatches,
    isToday ? todayDateStr ?? true : false
  );
  if (!isToday) return deduped;

  const plApiSample = deduped.find((m) => m.leagueId === "pl-2021");
  const result = [...deduped];
  const pinnedToInsert: Match[] = [];

  for (const pinnedId of PINNED_TODAY_FIXTURE_IDS) {
    const fixture = fixturePool.find((m) => m.id === pinnedId);
    if (!fixture) continue;

    const existingIdx = result.findIndex((existing) =>
      isSameMatchFixture(existing, fixture, todayDateStr ?? true)
    );

    if (existingIdx !== -1) {
      result[existingIdx] = enrichMatchFromFixture(
        result[existingIdx],
        fixture
      );
      continue;
    }

    pinnedToInsert.push(
      plApiSample
        ? {
            ...fixture,
            leagueId: "pl-2021",
            ...(plApiSample.leagueEmblem
              ? { leagueEmblem: plApiSample.leagueEmblem }
              : {}),
          }
        : fixture
    );
  }

  if (pinnedToInsert.length === 0) return result;
  return [...pinnedToInsert, ...result];
}

/**
 * Force every match dated before today to FT. Demo/A-Match fallbacks reuse the same
 * LIVE fixtures for any requested date, so their date is the requested date; real API
 * matches use their own kickoff date (`utcDate`).
 */
export function finalizePastMatches(
  list: Match[],
  requestedDateStr: string,
  todayStr: string,
  useKickoffDate: boolean
): Match[] {
  return list.map((m) => {
    const candidates = useKickoffDate ? getMatchDateCandidates(m) : [];
    const isStrictlyPast =
      candidates.length > 0
        ? candidates.every((d) => d < todayStr)
        : requestedDateStr < todayStr;
    if (!isStrictlyPast || m.status === "FT") return m;
    return {
      ...m,
      status: "FT",
      rawStatus: "FINISHED",
      minute: 90,
      kickoffTime: "종료",
      highlightText: `경기 종료 (${m.homeTeam.score ?? 0} : ${
        m.awayTeam.score ?? 0
      })`,
    };
  });
}

/**
 * Force every match dated after today to UPCOMING (PRE) with scores/minutes cleared
 * so fallback fixtures or future dates never appear as LIVE or FT.
 */
export function normalizeFutureMatches(
  list: Match[],
  requestedDateStr: string,
  todayStr: string,
  useKickoffDate: boolean
): Match[] {
  return list.map((m) => {
    const candidates = useKickoffDate ? getMatchDateCandidates(m) : [];
    const isStrictlyFuture =
      candidates.length > 0
        ? candidates.every((d) => d > todayStr)
        : requestedDateStr > todayStr;
    if (!isStrictlyFuture) return m;
    const clock = resolveMatchClock(m);
    const homeLineup = stripLineupMatchEvents(m.homeTeam.lineup);
    const homeBench = stripLineupMatchEvents(m.homeTeam.bench);
    const awayLineup = stripLineupMatchEvents(m.awayTeam.lineup);
    const awayBench = stripLineupMatchEvents(m.awayTeam.bench);
    if (
      clock.isUpcoming &&
      m.minute === undefined &&
      m.homeTeam.score === undefined &&
      m.awayTeam.score === undefined &&
      m.events === undefined &&
      !m.homeTeam.lineup &&
      !m.awayTeam.lineup
    ) {
      return m;
    }
    const nextKickoff =
      m.kickoffTime && m.kickoffTime !== "종료" ? m.kickoffTime : "예정";
    return {
      ...m,
      status: "UPCOMING",
      rawStatus: "SCHEDULED",
      minute: undefined,
      kickoffTime: nextKickoff,
      homeTeam: {
        ...m.homeTeam,
        score: undefined,
        ...(homeLineup ? { lineup: homeLineup } : {}),
        ...(homeBench ? { bench: homeBench } : {}),
      },
      awayTeam: {
        ...m.awayTeam,
        score: undefined,
        ...(awayLineup ? { lineup: awayLineup } : {}),
        ...(awayBench ? { bench: awayBench } : {}),
      },
      events: undefined,
      highlightText: `킥오프 ${nextKickoff} (예정)`,
    };
  });
}

/**
 * Single match-merge path shared by MatchesTabView and useTradeStore.fetchTodayMatches.
 */
export function resolveFetchedMatchesForDate(params: {
  source?: string;
  matches: Match[] | null;
  fallbackMatches: Match[];
  fixturePool: Match[];
  requestedDateStr: string;
  todayStr: string;
}): Match[] {
  const {
    source,
    matches,
    fallbackMatches,
    fixturePool,
    requestedDateStr,
    todayStr,
  } = params;
  const isToday = requestedDateStr === todayStr;

  if (source === "FOOTBALL_DATA_API") {
    const finalized = normalizeFutureMatches(
      finalizePastMatches(
        Array.isArray(matches) ? matches : [],
        requestedDateStr,
        todayStr,
        true
      ),
      requestedDateStr,
      todayStr,
      true
    );
    return mergePinnedFixturesForToday(
      finalized,
      fixturePool,
      isToday,
      requestedDateStr
    );
  }

  if (source === "AMATCH_FALLBACK") {
    const finalized = normalizeFutureMatches(
      finalizePastMatches(
        Array.isArray(matches) ? matches : fallbackMatches,
        requestedDateStr,
        todayStr,
        false
      ),
      requestedDateStr,
      todayStr,
      false
    );
    return mergePinnedFixturesForToday(
      finalized,
      fixturePool,
      isToday,
      requestedDateStr
    );
  }

  const diffDays = Math.round(
    (parseLocalDateStr(requestedDateStr).getTime() -
      parseLocalDateStr(todayStr).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const targetKey =
    diffDays <= -1
      ? "YESTERDAY"
      : diffDays === 0
      ? "TODAY"
      : diffDays === 1
      ? "TOMORROW"
      : "WEEKEND";

  const baseFallback =
    Array.isArray(matches) && matches.length > 0 ? matches : fallbackMatches;
  const filteredMock = baseFallback.filter((m) => m.dateKey === targetKey);
  const resolvedFallback = normalizeFutureMatches(
    finalizePastMatches(
      filteredMock.length > 0 ? filteredMock : baseFallback,
      requestedDateStr,
      todayStr,
      false
    ),
    requestedDateStr,
    todayStr,
    false
  );

  return mergePinnedFixturesForToday(
    resolvedFallback,
    fixturePool,
    isToday,
    requestedDateStr
  );
}

/**
 * Overlay live store match clock/score onto a display match card while keeping
 * finished (FT) and date-scoped non-API UPCOMING cards locked, and never letting
 * a dummy store match overwrite a live API `SCORE_ONLY` match's score or clock.
 */
export function resolveSyncedMatch(
  match: Match,
  storeMatches: Match[],
  todayDateStr: string = toLocalDateStr(new Date())
): Match {
  const matchClock = resolveMatchClock(match);
  if (matchClock.isFinished) {
    return match;
  }

  const exact = storeMatches.find((s) => s.id === match.id);
  const canonical =
    exact ??
    storeMatches.find(
      (s) =>
        isSameMatchFixture(match, s, todayDateStr) &&
        (!isApiBackedMatch(match) || isApiBackedMatch(s))
    );

  if (!canonical) return match;

  if (
    !isApiBackedMatch(match) &&
    matchClock.isUpcoming &&
    !resolveMatchClock(canonical).isUpcoming
  ) {
    return match;
  }

  return {
    ...canonical,
    leagueId: match.leagueId,
    ...(match.leagueEmblem
      ? { leagueEmblem: match.leagueEmblem }
      : canonical.leagueEmblem
      ? { leagueEmblem: canonical.leagueEmblem }
      : {}),
    homeTeam: {
      ...canonical.homeTeam,
      ...(match.homeTeam.crest && !canonical.homeTeam.crest
        ? { crest: match.homeTeam.crest }
        : {}),
    },
    awayTeam: {
      ...canonical.awayTeam,
      ...(match.awayTeam.crest && !canonical.awayTeam.crest
        ? { crest: match.awayTeam.crest }
        : {}),
    },
  };
}

function buildMatchSnapshotFromContext(
  ctx: ActiveMatchContext,
  template?: Match
): Match {
  const status: MatchStatus =
    ctx.status === "FT" ? "FT" : ctx.status === "PRE" ? "UPCOMING" : "LIVE";
  const rawStatus =
    ctx.rawStatus ??
    (status === "FT"
      ? "FINISHED"
      : status === "UPCOMING"
      ? "SCHEDULED"
      : "IN_PLAY");

  if (template) {
    return {
      ...template,
      status,
      rawStatus,
      minute: status === "FT" ? ctx.minute ?? 90 : ctx.minute ?? template.minute,
      kickoffTime: ctx.kickoffTime || template.kickoffTime,
      homeTeam: {
        ...template.homeTeam,
        score: ctx.homeScore,
      },
      awayTeam: {
        ...template.awayTeam,
        score: ctx.awayScore,
      },
    };
  }

  return {
    id: ctx.matchId,
    leagueId: "other",
    leagueName: ctx.competition,
    leagueCountry: "",
    status,
    rawStatus,
    minute: status === "FT" ? ctx.minute ?? 90 : ctx.minute,
    kickoffTime: ctx.kickoffTime,
    homeTeam: {
      id: ctx.homeTeam.toLowerCase(),
      name: ctx.homeTeam,
      shortName: ctx.homeTeam,
      color: "#111827",
      score: ctx.homeScore,
    },
    awayTeam: {
      id: ctx.awayTeam.toLowerCase(),
      name: ctx.awayTeam,
      shortName: ctx.awayTeam,
      color: "#111827",
      score: ctx.awayScore,
    },
  };
}

/**
 * Resolve the live store Match corresponding to an ActiveMatchContext.
 * Preserves finalized past-date FT contexts and date-scoped PRE contexts
 * even if the store holds a live copy for the same fallback fixture ID.
 */
export function resolveSyncedMatchFromContext(
  activeMatchContext: ActiveMatchContext | null | undefined,
  storeMatches: Match[]
): Match | undefined {
  if (!activeMatchContext) return undefined;

  const byId = storeMatches.find((m) => m.id === activeMatchContext.matchId);
  if (byId) {
    const byIdClock = resolveMatchClock(byId);
    if (activeMatchContext.status === "FT" && !byIdClock.isFinished) {
      return buildMatchSnapshotFromContext(activeMatchContext, byId);
    }
    if (
      activeMatchContext.status === "PRE" &&
      !isApiBackedMatch(byId) &&
      !byIdClock.isUpcoming
    ) {
      return buildMatchSnapshotFromContext(activeMatchContext, byId);
    }
    return byId;
  }

  if (
    activeMatchContext.status === "FT" ||
    activeMatchContext.status === "PRE"
  ) {
    return buildMatchSnapshotFromContext(activeMatchContext);
  }

  const targetHome = canonicalizeTeamKey({
    id: activeMatchContext.homeTeam,
    name: activeMatchContext.homeTeam,
    shortName: activeMatchContext.homeTeam,
  });
  const targetAway = canonicalizeTeamKey({
    id: activeMatchContext.awayTeam,
    name: activeMatchContext.awayTeam,
    shortName: activeMatchContext.awayTeam,
  });

  const pairMatches = (m: Match) =>
    canonicalizeTeamKey(m.homeTeam) === targetHome &&
    canonicalizeTeamKey(m.awayTeam) === targetAway;

  return (
    storeMatches.find((m) => resolveMatchClock(m).isLive && pairMatches(m)) ??
    storeMatches.find(pairMatches)
  );
}

/**
 * Resolve the single authoritative live Match object for a player across
 * chart, header, and order views.
 */
export function resolveMatchForPlayerView(params: {
  player: Player;
  storeMatches: Match[];
  activeMatchContext?: ActiveMatchContext | null;
  belongsToMatch?: (player: Player, match: Match) => boolean;
}): Match | undefined {
  const { player, storeMatches, activeMatchContext, belongsToMatch } = params;

  const matcher =
    belongsToMatch ??
    ((p: Player, m: Match) => {
      const pKey = canonicalizeTeamKey({
        id: p.teamId,
        name: p.teamName,
        shortName: p.teamShort,
      });
      if (!pKey || pKey === "UNKNOWN") return false;
      return (
        canonicalizeTeamKey(m.homeTeam) === pKey ||
        canonicalizeTeamKey(m.awayTeam) === pKey
      );
    });

  const direct = storeMatches.find((m) => m.id === player.matchId);

  if (activeMatchContext) {
    const byCtx = resolveSyncedMatchFromContext(
      activeMatchContext,
      storeMatches
    );
    // The player's own fixture (`player.matchId`) drives its price ticks, so a
    // context pointing at a different fixture of the same team must not replace
    // it; otherwise quote, clock, and chart would describe different matches.
    if (
      byCtx &&
      (player.matchId === byCtx.id ||
        (matcher(player, byCtx) &&
          (!direct || isSameMatchFixture(direct, byCtx))))
    ) {
      return byCtx;
    }
  }

  if (direct) return direct;

  const liveMatch = storeMatches.find(
    (m) => resolveMatchClock(m).isLive && matcher(player, m)
  );
  if (liveMatch) return liveMatch;

  return storeMatches.find((m) => matcher(player, m));
}

function formatClockMinute(minute: number): string {
  const safe = Math.max(0, Math.min(95, Math.round(minute)));
  if (safe > 90) return `90+${safe - 90}'`;
  return `${safe}'`;
}

/**
 * Single source of truth for match clock (PRE / 1H / HT / 2H / FT) across
 * schedule cards, lineup/pitch view, market overview, charts, and header.
 * When `match` is provided, its own fields are strictly authoritative;
 * `fallbackContext` is only consulted when `match` is absent.
 */
export function resolveMatchClock(
  match?: Match | null,
  fallbackContext?: ActiveMatchContext | null
): ResolvedMatchClock {
  const rawStatus = (
    match ? match.rawStatus ?? "" : fallbackContext?.rawStatus ?? ""
  )
    .trim()
    .toUpperCase();

  const isFinished = match
    ? match.status === "FT" ||
      rawStatus === "FINISHED" ||
      rawStatus === "AWARDED"
    : fallbackContext?.status === "FT" ||
      rawStatus === "FINISHED" ||
      rawStatus === "AWARDED";

  const isUpcoming =
    !isFinished &&
    (match
      ? match.status === "UPCOMING" ||
        rawStatus === "TIMED" ||
        rawStatus === "SCHEDULED" ||
        rawStatus === "POSTPONED"
      : fallbackContext?.status === "PRE" ||
        rawStatus === "TIMED" ||
        rawStatus === "SCHEDULED" ||
        rawStatus === "POSTPONED");

  const kickoffTime = match
    ? match.kickoffTime || "예정"
    : fallbackContext?.kickoffTime || "예정";

  if (isFinished) {
    return {
      status: "FT",
      phase: "FT",
      minute: 90,
      kickoffTime: "종료",
      isLive: false,
      isHalfTime: false,
      isFinished: true,
      isUpcoming: false,
      shortLabel: "FT",
      cardLabel: "경기 종료 (FT)",
      chartLabel: "당일 경기 (FT)",
    };
  }

  if (isUpcoming) {
    return {
      status: "UPCOMING",
      phase: "PRE",
      minute: 0,
      kickoffTime,
      isLive: false,
      isHalfTime: false,
      isFinished: false,
      isUpcoming: true,
      shortLabel: "PRE",
      cardLabel: kickoffTime,
      chartLabel: "경기 예정 (PRE)",
    };
  }

  const isPausedHalfTime =
    rawStatus === "PAUSED" ||
    rawStatus === "HT" ||
    rawStatus === "HALF_TIME";

  if (isPausedHalfTime) {
    return {
      status: "LIVE",
      phase: "HT",
      minute: 45,
      kickoffTime,
      isLive: true,
      isHalfTime: true,
      isFinished: false,
      isUpcoming: false,
      shortLabel: "HT",
      cardLabel: "하프타임 (HT)",
      chartLabel: "LIVE HT",
    };
  }

  const rawMin = match ? match.minute ?? 45 : fallbackContext?.minute ?? 45;
  const minute = Math.max(1, Math.min(95, Math.round(rawMin)));
  const phase: MatchClockPhase = minute <= 45 ? "1H" : "2H";
  const minText = formatClockMinute(minute);

  return {
    status: "LIVE",
    phase,
    minute,
    kickoffTime,
    isLive: true,
    isHalfTime: false,
    isFinished: false,
    isUpcoming: false,
    shortLabel: `${phase} ${minText}`,
    cardLabel: phase === "1H" ? `전반 ${minText}` : `후반 ${minText}`,
    chartLabel: `LIVE ${phase} ${minText}`,
  };
}

/**
 * Single source of truth for scoreboard (`homeScore : awayScore` or `vs`).
 */
export function resolveMatchScore(
  match?: Match | null,
  fallbackContext?: ActiveMatchContext | null
): ResolvedMatchScore {
  const clock = resolveMatchClock(match, fallbackContext);
  const homeScore = match
    ? match.homeTeam?.score ?? 0
    : fallbackContext?.homeScore ?? 0;
  const awayScore = match
    ? match.awayTeam?.score ?? 0
    : fallbackContext?.awayScore ?? 0;

  return {
    homeScore,
    awayScore,
    hasScore: !clock.isUpcoming,
    display: clock.isUpcoming ? "vs" : `${homeScore} : ${awayScore}`,
  };
}

/**
 * Sync an existing ActiveMatchContext against the latest store match list.
 */
export function syncActiveMatchContext(
  currentContext: ActiveMatchContext | null,
  storeMatches: Match[],
  replacedIdMap?: Map<string, string>
): ActiveMatchContext | null {
  if (!currentContext) return null;
  const mappedId =
    replacedIdMap?.get(currentContext.matchId) ?? currentContext.matchId;
  const synced = resolveSyncedMatchFromContext(
    mappedId === currentContext.matchId
      ? currentContext
      : { ...currentContext, matchId: mappedId },
    storeMatches
  );
  return synced ? buildActiveMatchContext(synced) : currentContext;
}
