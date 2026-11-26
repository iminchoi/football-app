import {
  getPositionLine,
  type Match,
  type Player,
  type PositionLine,
} from "../types/index.ts";
import { canonicalizeTeamKey, resolveMatchClock } from "./matchSync.ts";
import { matchesPlayerSearchQuery } from "./playerDisplayName.ts";
import { resolvePlayerQuote, type PlayerQuote } from "./playerQuote.ts";

export type MarketPositionFilter = "ALL" | PositionLine;
export type MarketLeagueFilter =
  | "ALL"
  | "EPL"
  | "LALIGA"
  | "BUNDESLIGA"
  | "SERIEA"
  | "LIGUE1"
  | "AMATCH";
export type MarketSortMode = "GAINERS" | "LOSERS" | "PRICE" | "RATING";

export const DEFAULT_MARKET_PAGE_SIZE = 30;

export const MAJOR_LEAGUE_IDS = new Set<string>([
  "epl",
  "pl",
  "pl-2021",
  "cl",
  "pd",
  "laliga",
  "bl1",
  "bundesliga",
  "sa",
  "seriea",
  "fl1",
  "ligue1",
  "ded",
  "ppl",
  "elc",
  "amatch",
  "wc",
  "ec",
  "nl",
  "ca",
]);

const MAJOR_CANONICAL_TEAM_KEYS = new Set<string>([
  // EPL
  "ARS", "NEW", "TOT", "MCI", "LIV", "CHE", "MUN", "WOL", "BHA", "CRY", "AVL", "WHU", "EVE", "BRE", "FUL", "NFO", "BOU", "IPS", "LEI", "SOU", "LEE", "BUR", "SUN",
  // La Liga
  "RMA", "BAR", "ATM", "RSO", "ATH", "VIL", "BET", "SEV", "VAL", "GIR",
  // Bundesliga
  "BAY", "LEV", "BVB", "RBL", "STU", "SGE", "M05", "BMG", "SCF", "WOB",
  // Serie A
  "INT", "JUV", "MIL", "NAP", "ATA", "ROM", "LAZ", "FIO", "BOL", "PAR",
  // Ligue 1
  "PSG", "MON", "OM", "OL", "LIL", "NIC", "REN", "LEN", "REI",
  // International
  "KOR", "JPN", "ENG", "ESP", "NOR", "POR", "FRA", "GER", "BRA", "ARG", "NED", "ITA",
]);

const EPL_CLUB_NAMES = new Set([
  "토트넘 홋스퍼", "아스널", "아스날", "Arsenal", "뉴캐슬", "뉴캐슬 유나이티드", "Newcastle", "Newcastle United",
  "맨체스터 시티", "Manchester City", "리버풀", "Liverpool", "첼시", "Chelsea",
  "맨체스터 유나이티드", "Manchester United", "울버햄튼", "Wolves", "브라이튼", "Brighton",
  "크리스탈 팰리스", "Crystal Palace", "스토크 시티", "Aston Villa", "West Ham", "Everton",
  "Brentford", "Fulham", "Nottingham Forest", "Bournemouth", "Tottenham",
]);
const LALIGA_CLUB_NAMES = new Set([
  "레알 마드리드", "Real Madrid", "FC 바르셀로나", "Barcelona", "아틀레티코 마드리드", "Atletico Madrid",
  "레알 소시에다드", "Real Sociedad", "아틀레틱 빌바오", "Athletic Club", "Villarreal", "Sevilla", "Real Betis", "Valencia",
]);
const BUNDESLIGA_CLUB_NAMES = new Set([
  "바이에른 뮌헨", "Bayern Munich", "레버쿠젠", "Bayer Leverkusen", "도르트문트", "Borussia Dortmund",
  "마인츠", "슈투트가르트", "VfB Stuttgart", "묀헨글라트바흐", "라이프치히", "RB Leipzig", "프라이부르크", "Eintracht Frankfurt",
]);
const SERIEA_CLUB_NAMES = new Set([
  "인테르 밀란", "Inter", "유벤투스", "Juventus", "AC 밀란", "AC Milan", "나폴리", "Napoli", "파르마", "Atalanta", "AS Roma", "Lazio",
]);
const LIGUE1_CLUB_NAMES = new Set([
  "파리 생제르맹", "Paris Saint Germain", "PSG", "AS 모나코", "Monaco", "스타드 랭스", "마르세유", "Marseille", "Lyon", "Lille",
]);

function resolveLinkedMatch(
  player: Player,
  matches: readonly Match[],
  belongsToMatch?: (p: Player, m?: Match | null) => boolean
): Match | undefined {
  const direct = matches.find((m) => m.id === player.matchId);
  if (direct) return direct;
  if (belongsToMatch) {
    return matches.find((m) => belongsToMatch(player, m));
  }
  return undefined;
}

/**
 * Determine whether a player belongs to a major tracked competition/club rather than
 * an incidental minor-league API fixture (e.g. Eliteserien "Viking", Malaysia "Sabah FA").
 */
export function isMajorLeaguePlayer(
  player: Player,
  matches: readonly Match[],
  belongsToMatch?: (p: Player, m?: Match | null) => boolean
): boolean {
  const linked = resolveLinkedMatch(player, matches, belongsToMatch);
  if (linked) {
    const lid = (linked.leagueId || "").trim().toLowerCase();
    if (MAJOR_LEAGUE_IDS.has(lid) || Boolean(linked.isInternational)) {
      return true;
    }
    // Explicitly tagged minor API league (e.g. `af-league-103`) -> exclude unless club itself is major
    if (lid.startsWith("af-league-")) {
      const teamKey = canonicalizeTeamKey({
        id: player.teamId,
        name: player.teamName,
        shortName: player.teamShort,
      });
      return MAJOR_CANONICAL_TEAM_KEYS.has(teamKey);
    }
  }

  // Curated core players (`p-...`) are always major-league/international tracked assets
  if (player.id.startsWith("p-")) {
    return true;
  }

  const club = (player.teamName || "").trim();
  if (
    EPL_CLUB_NAMES.has(club) ||
    LALIGA_CLUB_NAMES.has(club) ||
    BUNDESLIGA_CLUB_NAMES.has(club) ||
    SERIEA_CLUB_NAMES.has(club) ||
    LIGUE1_CLUB_NAMES.has(club)
  ) {
    return true;
  }

  const teamKey = canonicalizeTeamKey({
    id: player.teamId,
    name: player.teamName,
    shortName: player.teamShort,
  });
  return MAJOR_CANONICAL_TEAM_KEYS.has(teamKey);
}

export function doesPlayerMatchMarketLeague(
  player: Player,
  league: MarketLeagueFilter,
  matches: readonly Match[],
  belongsToMatch?: (p: Player, m?: Match | null) => boolean,
  isNationalTeamMatchFn?: (m?: Match | null) => boolean
): boolean {
  if (league === "ALL") return true;
  const playerMatch = resolveLinkedMatch(player, matches, belongsToMatch);
  const lid = (playerMatch?.leagueId || "").toLowerCase();
  const club = (player.teamName || "").trim();

  if (league === "AMATCH") {
    return (
      Boolean(player.nationalTeam && player.nationalTeam !== "기타") &&
      (Boolean(isNationalTeamMatchFn?.(playerMatch)) ||
        Boolean(playerMatch?.isInternational) ||
        ["대한민국", "일본", "잉글랜드", "스페인", "노르웨이", "포르투갈"].includes(
          player.nationalTeam
        ))
    );
  }
  if (league === "EPL") {
    return lid === "epl" || lid === "pl" || lid === "pl-2021" || EPL_CLUB_NAMES.has(club);
  }
  if (league === "LALIGA") {
    return lid === "laliga" || lid === "pd" || LALIGA_CLUB_NAMES.has(club);
  }
  if (league === "BUNDESLIGA") {
    return lid === "bundesliga" || lid === "bl1" || BUNDESLIGA_CLUB_NAMES.has(club);
  }
  if (league === "SERIEA") {
    return lid === "seriea" || lid === "sa" || SERIEA_CLUB_NAMES.has(club);
  }
  if (league === "LIGUE1") {
    return lid === "ligue1" || lid === "fl1" || LIGUE1_CLUB_NAMES.has(club);
  }
  return true;
}

export interface MarketRankingResult {
  items: Player[];
  totalAllCount: number;
  minorExcludedCount: number;
}

/**
 * Filter and sort the Market tab player list:
 * - Searching (`searchQuery` non-empty) searches across ALL players (including minor leagues).
 * - Default browsing hides incidental minor-league API clutter unless `includeMinorLeagues` is enabled
 *   (user watchlist/held players are always kept visible).
 * - Sorts major/active players cleanly under the selected `sortMode`.
 */
export function buildMarketRankingList(params: {
  players: readonly Player[];
  matches: readonly Match[];
  quoteByPlayerId: ReadonlyMap<string, PlayerQuote>;
  searchQuery: string;
  posFilter: MarketPositionFilter;
  leagueFilter: MarketLeagueFilter;
  sortMode: MarketSortMode;
  onlySurge5: boolean;
  onlyWonderkid: boolean;
  onlyWatchlist: boolean;
  watchlist: readonly string[];
  heldPlayerIds?: ReadonlySet<string>;
  includeMinorLeagues?: boolean;
  belongsToMatch?: (p: Player, m?: Match | null) => boolean;
  isNationalTeamMatchFn?: (m?: Match | null) => boolean;
}): MarketRankingResult {
  const q = params.searchQuery.trim();
  const isSearching = q.length > 0;
  const includeMinor = Boolean(params.includeMinorLeagues) || isSearching || params.onlyWatchlist;

  let minorExcludedCount = 0;
  const majorFlags = new Map<string, boolean>();
  const liveFlags = new Map<string, boolean>();

  for (const p of params.players) {
    const isMajor = isMajorLeaguePlayer(p, params.matches, params.belongsToMatch);
    majorFlags.set(p.id, isMajor);
    const linked = resolveLinkedMatch(p, params.matches, params.belongsToMatch);
    const isLive = linked ? resolveMatchClock(linked).isLive : false;
    liveFlags.set(p.id, isLive);
  }

  const filtered = params.players.filter((p) => {
    if (isSearching && !matchesPlayerSearchQuery(p, q)) {
      return false;
    }
    if (params.posFilter !== "ALL" && getPositionLine(p.position) !== params.posFilter) {
      return false;
    }
    if (
      !doesPlayerMatchMarketLeague(
        p,
        params.leagueFilter,
        params.matches,
        params.belongsToMatch,
        params.isNationalTeamMatchFn
      )
    ) {
      return false;
    }

    const quote = params.quoteByPlayerId.get(p.id) ?? resolvePlayerQuote(p, "LIVE");
    if (params.onlySurge5 && quote.changePct < 5) {
      return false;
    }
    if (
      params.onlyWonderkid &&
      p.tier !== "C" &&
      (p.basePrice ?? p.initialPrice) >= 5000
    ) {
      return false;
    }
    const isWatched = params.watchlist.includes(p.id);
    if (params.onlyWatchlist && !isWatched) {
      return false;
    }

    const isMajor = majorFlags.get(p.id) ?? false;
    const isHeld = Boolean(params.heldPlayerIds?.has(p.id));
    if (!includeMinor && params.leagueFilter === "ALL" && !isMajor && !isWatched && !isHeld) {
      minorExcludedCount += 1;
      return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    // When minor leagues are included alongside major leagues (without active search), prioritize major/active assets first
    if (!isSearching && params.includeMinorLeagues) {
      const majDiff = (majorFlags.get(b.id) ? 1 : 0) - (majorFlags.get(a.id) ? 1 : 0);
      if (majDiff !== 0) return majDiff;
    }

    const quoteA = params.quoteByPlayerId.get(a.id) ?? resolvePlayerQuote(a, "LIVE");
    const quoteB = params.quoteByPlayerId.get(b.id) ?? resolvePlayerQuote(b, "LIVE");

    if (params.sortMode === "GAINERS") {
      const diff = quoteB.changePct - quoteA.changePct;
      if (diff !== 0) return diff;
      const liveDiff = (liveFlags.get(b.id) ? 1 : 0) - (liveFlags.get(a.id) ? 1 : 0);
      if (liveDiff !== 0) return liveDiff;
      return (quoteB.volume ?? 0) - (quoteA.volume ?? 0);
    }
    if (params.sortMode === "LOSERS") {
      const diff = quoteA.changePct - quoteB.changePct;
      if (diff !== 0) return diff;
      return (quoteB.volume ?? 0) - (quoteA.volume ?? 0);
    }
    if (params.sortMode === "PRICE") {
      return quoteB.currentPrice - quoteA.currentPrice;
    }
    const ratingDiff = b.stats.rating - a.stats.rating;
    if (ratingDiff !== 0) return ratingDiff;
    return quoteB.changePct - quoteA.changePct;
  });

  return {
    items: sorted,
    totalAllCount: params.players.length,
    minorExcludedCount,
  };
}

export interface PaginatedMarketPlayers {
  visibleItems: Player[];
  totalCount: number;
  hasMore: boolean;
  remainingCount: number;
  nextVisibleCount: number;
}

export function paginateMarketPlayers(
  items: readonly Player[],
  visibleCount: number,
  pageSize = DEFAULT_MARKET_PAGE_SIZE
): PaginatedMarketPlayers {
  const safeLimit = Math.max(pageSize, visibleCount);
  const visibleItems = items.slice(0, safeLimit);
  const totalCount = items.length;
  const remainingCount = Math.max(0, totalCount - visibleItems.length);
  return {
    visibleItems,
    totalCount,
    hasMore: remainingCount > 0,
    remainingCount,
    nextVisibleCount: Math.min(totalCount, safeLimit + pageSize),
  };
}

export type HotSpotlightCategory =
  | "TOP_GAINER"
  | "TOP_VOLUME"
  | "TOP_RATING"
  | "TOP_ATTACK"
  | "TOP_BLUECHIP"
  | "MOMENTUM";

export interface HotSpotlightItem {
  player: Player;
  quote: PlayerQuote;
  category: HotSpotlightCategory;
  reasonLabel: string;
  tone: "emerald" | "sky" | "amber" | "violet" | "slate";
}

/**
 * Dynamically select up to 6 distinct Hot Player Spotlight cards from live data
 * (major-league/active players prioritized) with explicit quantitative evidence labels:
 * 1. Top Gainer (수익률 1위)
 * 2. Top Volume (거래량 1위)
 * 3. Top Match Rating (평점 1위)
 * 4. Top Attack Points — Goals/Assists (공격P 선두)
 * 5. Highest Market Cap / Blue-Chip Price (최고가 우량주)
 * 6. Top Runner-Up Momentum (급등 상위 / 거래 상위)
 */
export function selectHotSpotlightPlayers(params: {
  players: readonly Player[];
  matches: readonly Match[];
  quoteByPlayerId: ReadonlyMap<string, PlayerQuote>;
  count?: number;
  belongsToMatch?: (p: Player, m?: Match | null) => boolean;
}): HotSpotlightItem[] {
  const targetCount = Math.max(1, params.count ?? 6);
  if (params.players.length === 0) return [];

  const majorPool = params.players.filter((p) =>
    isMajorLeaguePlayer(p, params.matches, params.belongsToMatch)
  );
  const pool = majorPool.length >= targetCount ? majorPool : [...params.players];

  const enriched = pool.map((player) => {
    const quote =
      params.quoteByPlayerId.get(player.id) ?? resolvePlayerQuote(player, "LIVE");
    const volume = Math.max(0, quote.volume ?? player.volume ?? 0);
    const goals = player.stats?.goals ?? 0;
    const assists = player.stats?.assists ?? 0;
    const attackScore = goals * 2 + assists;
    const rating = player.stats?.rating ?? 0;
    const marketCap = quote.currentPrice * Math.max(1, player.totalShares ?? 1000);
    return { player, quote, volume, goals, assists, attackScore, rating, marketCap };
  });

  const picked = new Set<string>();
  const result: HotSpotlightItem[] = [];

  const pickBest = (
    candidates: typeof enriched,
    sortFn: (a: (typeof enriched)[number], b: (typeof enriched)[number]) => number,
    predicate: (item: (typeof enriched)[number]) => boolean,
    buildItem: (item: (typeof enriched)[number]) => HotSpotlightItem
  ): boolean => {
    const eligible = candidates
      .filter((c) => !picked.has(c.player.id) && predicate(c))
      .sort(sortFn);
    const winner = eligible[0];
    if (!winner) return false;
    picked.add(winner.player.id);
    result.push(buildItem(winner));
    return true;
  };

  // Slot 1: Top Gainer (수익률 1위)
  pickBest(
    enriched,
    (a, b) => b.quote.changePct - a.quote.changePct || b.volume - a.volume,
    (c) => c.quote.changePct > 0,
    (c) => ({
      player: c.player,
      quote: c.quote,
      category: "TOP_GAINER",
      reasonLabel: `수익률 1위 +${c.quote.changePct.toFixed(1)}%`,
      tone: "emerald",
    })
  );

  // Slot 2: Top Volume (거래량 1위)
  pickBest(
    enriched,
    (a, b) => b.volume - a.volume || b.quote.changePct - a.quote.changePct,
    (c) => c.volume > 0,
    (c) => ({
      player: c.player,
      quote: c.quote,
      category: "TOP_VOLUME",
      reasonLabel: `거래량 1위 · ${c.volume.toLocaleString()}`,
      tone: "sky",
    })
  );

  // Slot 3: Top Match Rating (평점 1위)
  pickBest(
    enriched,
    (a, b) => b.rating - a.rating || b.attackScore - a.attackScore,
    (c) => c.rating > 0,
    (c) => ({
      player: c.player,
      quote: c.quote,
      category: "TOP_RATING",
      reasonLabel: `평점 1위 ★${c.rating.toFixed(1)}`,
      tone: "amber",
    })
  );

  // Slot 4: Top Attack Points (득점/도움 선두)
  pickBest(
    enriched,
    (a, b) =>
      b.attackScore - a.attackScore ||
      b.goals - a.goals ||
      b.rating - a.rating,
    (c) => c.attackScore > 0,
    (c) => {
      const parts: string[] = [];
      if (c.goals > 0) parts.push(`${c.goals}골`);
      if (c.assists > 0) parts.push(`${c.assists}도움`);
      return {
        player: c.player,
        quote: c.quote,
        category: "TOP_ATTACK",
        reasonLabel: `공격P · ${parts.join(" ")}`,
        tone: "violet",
      };
    }
  );

  // Slot 5: Highest Price Blue-Chip (최고가 우량주)
  pickBest(
    enriched,
    (a, b) =>
      b.quote.currentPrice - a.quote.currentPrice || b.marketCap - a.marketCap,
    () => true,
    (c) => ({
      player: c.player,
      quote: c.quote,
      category: "TOP_BLUECHIP",
      reasonLabel: `최고가 · ${c.quote.currentPrice.toLocaleString()}P`,
      tone: "slate",
    })
  );

  // Slot 6+ (fill up to targetCount): Runner-Up Momentum Gainer -> Volume -> Rating fallback
  while (result.length < targetCount) {
    const added =
      pickBest(
        enriched,
        (a, b) => b.quote.changePct - a.quote.changePct || b.volume - a.volume,
        (c) => c.quote.changePct > 0,
        (c) => ({
          player: c.player,
          quote: c.quote,
          category: "MOMENTUM",
          reasonLabel: `급등 상위 +${c.quote.changePct.toFixed(1)}%`,
          tone: "emerald",
        })
      ) ||
      pickBest(
        enriched,
        (a, b) => b.volume - a.volume || b.rating - a.rating,
        () => true,
        (c) => ({
          player: c.player,
          quote: c.quote,
          category: "MOMENTUM",
          reasonLabel:
            c.volume > 0
              ? `거래 상위 · ${c.volume.toLocaleString()}`
              : `평점 ★${c.rating.toFixed(1)}`,
          tone: "sky",
        })
      );
    if (!added) break;
  }

  return result.slice(0, targetCount);
}
