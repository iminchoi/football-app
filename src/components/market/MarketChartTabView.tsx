"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Star,
  Search,
  RotateCcw,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import {
  useTradeStore,
  doesPlayerBelongToMatch,
  isNationalTeamMatch,
} from "@/store/useTradeStore";
import {
  Match,
  Player,
  PositionLine,
  PricePoint,
  TradeType,
  getPositionLine,
} from "@/types";
import { WEIGHTS } from "@/lib/weights";
import {
  resolveMatchClock,
  resolveMatchForPlayerView,
  resolveMatchScore,
  resolveSyncedMatch,
} from "@/lib/matchSync";
import { resolvePlayerQuote } from "@/lib/playerQuote";
import {
  formatPlayerDisplayName,
  matchesPlayerSearchQuery,
} from "@/lib/playerDisplayName";
import PlayerAvatar from "@/components/PlayerAvatar";

interface MarketChartTabViewProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  selectedPlayerId: string | null;
  onSelectPlayerTrade: (player: Player, type: TradeType) => void;
}

type PositionFilter = "ALL" | PositionLine;
type LeagueFilter =
  | "ALL"
  | "EPL"
  | "LALIGA"
  | "BUNDESLIGA"
  | "SERIEA"
  | "LIGUE1"
  | "AMATCH";
type SortMode = "GAINERS" | "LOSERS" | "PRICE" | "RATING";

const SPOTLIGHT_IDS = [
  "p-son",
  "p-haaland",
  "p-bellingham",
  "p-lee",
  "p-kim",
  "p-mbappe",
];

const EplTeams = new Set([
  "토트넘 홋스퍼",
  "아스널",
  "아스날",
  "Arsenal",
  "뉴캐슬",
  "뉴캐슬 유나이티드",
  "Newcastle",
  "맨체스터 시티",
  "리버풀",
  "첼시",
  "맨체스터 유나이티드",
  "울버햄튼",
  "브라이튼",
  "크리스탈 팰리스",
  "스토크 시티",
]);
const LaLigaTeams = new Set([
  "레알 마드리드",
  "FC 바르셀로나",
  "아틀레티코 마드리드",
  "레알 소시에다드",
  "아틀레틱 빌바오",
]);
const BundesligaTeams = new Set([
  "바이에른 뮌헨",
  "레버쿠젠",
  "도르트문트",
  "마인츠",
  "슈투트가르트",
  "묀헨글라트바흐",
  "라이프치히",
  "프라이부르크",
]);
const SerieATeams = new Set([
  "인테르 밀란",
  "유벤투스",
  "AC 밀란",
  "나폴리",
  "파르마",
]);
const Ligue1Teams = new Set([
  "파리 생제르맹",
  "AS 모나코",
  "스타드 랭스",
  "마르세유",
]);

function buildSparklinePoints(
  history: PricePoint[],
  width = 72,
  height = 24
): string {
  const pts = history.length >= 2 ? history : [{ price: 100 }, { price: 100 }];
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);
  return pts
    .map((pt, idx) => {
      const x = (idx / Math.max(1, pts.length - 1)) * width;
      const y = height - 3 - ((pt.price - min) / range) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function MarketChartTabView({
  searchQuery,
  onSearchQueryChange,
  selectedPlayerId,
  onSelectPlayerTrade,
}: MarketChartTabViewProps) {
  const players = useTradeStore((s) => s.players);
  const matches = useTradeStore((s) => s.matches);
  const todayMatches = useTradeStore((s) => s.todayMatches);
  const isLoadingTodayMatches = useTradeStore((s) => s.isLoadingTodayMatches);
  const hasFetchedTodayMatches = useTradeStore((s) => s.hasFetchedTodayMatches);
  const fetchTodayMatches = useTradeStore((s) => s.fetchTodayMatches);
  const watchlist = useTradeStore((s) => s.watchlist);
  const toggleWatchlist = useTradeStore((s) => s.toggleWatchlist);
  const setActiveTab = useTradeStore((s) => s.setActiveTab);

  useEffect(() => {
    if (!hasFetchedTodayMatches) {
      void fetchTodayMatches();
    }
  }, [hasFetchedTodayMatches, fetchTodayMatches]);

  // 1-Line Slim Quick Filter Bar States
  const [sortMode, setSortMode] = useState<SortMode>("GAINERS");
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [leagueFilter, setLeagueFilter] = useState<LeagueFilter>("ALL");
  const [onlySurge5, setOnlySurge5] = useState<boolean>(false);
  const [onlyWonderkid, setOnlyWonderkid] = useState<boolean>(false);
  const [onlyWatchlist, setOnlyWatchlist] = useState<boolean>(false);

  const spotlightPlayers = useMemo(() => {
    return SPOTLIGHT_IDS.map((id) => players.find((p) => p.id === id)).filter(
      (p): p is Player => Boolean(p)
    );
  }, [players]);

  const todayKeyMatches = useMemo(() => {
    return todayMatches.slice(0, 4).map((m) => resolveSyncedMatch(m, matches));
  }, [todayMatches, matches]);

  const doesPlayerMatchLeague = (
    player: Player,
    league: LeagueFilter
  ): boolean => {
    if (league === "ALL") return true;
    const playerMatch = matches.find(
      (m) => m.id === player.matchId || doesPlayerBelongToMatch(player, m)
    );
    const lid = (playerMatch?.leagueId || "").toLowerCase();
    const club = player.teamName.trim();

    if (league === "AMATCH") {
      return (
        Boolean(player.nationalTeam && player.nationalTeam !== "기타") &&
        (isNationalTeamMatch(playerMatch) ||
          [
            "대한민국",
            "일본",
            "잉글랜드",
            "스페인",
            "노르웨이",
            "포르투갈",
          ].includes(player.nationalTeam))
      );
    }
    if (league === "EPL") {
      return (
        lid === "epl" ||
        lid === "pl" ||
        lid === "pl-2021" ||
        EplTeams.has(club)
      );
    }
    if (league === "LALIGA") {
      return lid === "laliga" || lid === "pd" || LaLigaTeams.has(club);
    }
    if (league === "BUNDESLIGA") {
      return lid === "bundesliga" || lid === "bl1" || BundesligaTeams.has(club);
    }
    if (league === "SERIEA") {
      return lid === "seriea" || lid === "sa" || SerieATeams.has(club);
    }
    if (league === "LIGUE1") {
      return lid === "ligue1" || lid === "fl1" || Ligue1Teams.has(club);
    }
    return true;
  };

  const hasActiveFilter =
    searchQuery.trim() !== "" ||
    posFilter !== "ALL" ||
    leagueFilter !== "ALL" ||
    onlySurge5 ||
    onlyWonderkid ||
    onlyWatchlist;

  const handleResetFilters = () => {
    onSearchQueryChange("");
    setPosFilter("ALL");
    setLeagueFilter("ALL");
    setOnlySurge5(false);
    setOnlyWonderkid(false);
    setOnlyWatchlist(false);
  };

  const resolveMarketQuote = (p: Player) => {
    const matchedGame = resolveMatchForPlayerView({
      player: p,
      storeMatches: matches,
      belongsToMatch: doesPlayerBelongToMatch,
    });
    const status = matchedGame ? resolveMatchClock(matchedGame).status : "LIVE";
    return resolvePlayerQuote(p, status);
  };

  const rankedPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = players.filter((p) => {
      if (q && !matchesPlayerSearchQuery(p, q)) {
        return false;
      }

      if (posFilter !== "ALL" && getPositionLine(p.position) !== posFilter) {
        return false;
      }

      if (!doesPlayerMatchLeague(p, leagueFilter)) {
        return false;
      }

      const pct = resolveMarketQuote(p).changePct;
      if (onlySurge5 && pct < 5) {
        return false;
      }

      if (onlyWonderkid && p.tier !== "C" && (p.basePrice ?? p.initialPrice) >= 5000) {
        return false;
      }

      if (onlyWatchlist && !watchlist.includes(p.id)) {
        return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const quoteA = resolveMarketQuote(a);
      const quoteB = resolveMarketQuote(b);

      if (sortMode === "GAINERS") return quoteB.changePct - quoteA.changePct;
      if (sortMode === "LOSERS") return quoteA.changePct - quoteB.changePct;
      if (sortMode === "PRICE") return quoteB.currentPrice - quoteA.currentPrice;
      return b.stats.rating - a.stats.rating;
    });
  }, [
    players,
    matches,
    searchQuery,
    posFilter,
    leagueFilter,
    onlySurge5,
    onlyWonderkid,
    onlyWatchlist,
    watchlist,
    sortMode,
  ]);

  return (
    <div className="px-4 lg:px-6 pt-5 pb-10 space-y-5">
      {/* 1. Top Spotlight Grid: Left 2/3 Hot 6 Players (3x2) + Right 1/3 Today's Key Matches */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 2/3: 6 Hot Players Responsive Grid */}
        <div className="lg:col-span-8 rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Flame className="h-4 w-4 shrink-0 text-[#00A878]" />
              <h2 className="whitespace-nowrap break-keep text-sm font-extrabold text-gray-900">
                핫 플레이어 스포트라이트
              </h2>
            </div>
            <span className="whitespace-nowrap text-[11px] font-medium text-gray-400">
              카드 클릭 시 즉시 차트 · 주문 패널 연결
            </span>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
            {spotlightPlayers.map((p) => {
              const quote = resolveMarketQuote(p);
              const rawPct = quote.changePct;
              const maxPct = WEIGHTS.CAP_LIMIT * 100;
              const pct = Math.max(-maxPct, Math.min(maxPct, rawPct));
              const isUp = pct > 0;
              const isDown = pct < 0;
              const isSelected = selectedPlayerId === p.id;
              const sparkColor = isUp
                ? "#00A878"
                : isDown
                ? "#F07868"
                : "#A8B2BC";

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPlayerTrade(p, "BUY")}
                  className={`flex min-w-0 flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-left transition hover:border-[#00A878]/60 active:scale-[0.99] ${
                    isSelected
                      ? "border-[#00A878] bg-emerald-50/35"
                      : "border-gray-200/80 bg-[#F7F9F8]"
                  }`}
                >
                  {/* 1단: 좌측 PlayerAvatar + 우측 미니 스파크라인 */}
                  <div className="flex w-full items-center justify-between gap-1.5">
                    <PlayerAvatar player={p} size={30} />
                    <svg
                      width="48"
                      height="20"
                      viewBox="0 0 72 24"
                      className="shrink-0 overflow-visible"
                    >
                      <polyline
                        fill="none"
                        stroke={sparkColor}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={buildSparklinePoints(
                          quote.isPreMatch
                            ? [
                                { minute: 0, price: quote.basePrice },
                                { minute: 0, price: quote.basePrice },
                              ]
                            : p.priceHistory
                        )}
                      />
                    </svg>
                  </div>

                  {/* 2단: 독립 1줄 선수명 + 포지션·팀 약자 */}
                  <div className="mt-2 w-full min-w-0">
                    <p className="truncate whitespace-nowrap text-[13px] sm:text-sm font-bold text-slate-900">
                      {formatPlayerDisplayName(p, "full")}
                    </p>
                    <p className="mt-0.5 whitespace-nowrap text-[11px] font-semibold text-slate-500">
                      {p.position} · {p.teamShort}
                    </p>
                  </div>

                  {/* 3단: 현재가 + 등락률 뱃지 (좁아지면 자연스럽게 wrap) */}
                  <div className="mt-2 flex w-full flex-wrap items-baseline justify-between gap-1">
                    <span className="whitespace-nowrap font-mono text-[13px] sm:text-sm font-black text-gray-900 tabular-nums">
                      {quote.currentPrice.toLocaleString()}P
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold tabular-nums ${
                        isUp
                          ? "bg-[#00A878]/10 text-[#00A878]"
                          : isDown
                          ? "bg-[#F07868]/10 text-[#F07868]"
                          : "bg-gray-200/70 text-[#A8B2BC]"
                      }`}
                    >
                      {isUp ? "+" : ""}
                      {pct.toFixed(2)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 1/3: Today's Key Match Schedule Summary Card */}
        <div className="lg:col-span-4 rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#00A878]" />
              <h2 className="whitespace-nowrap break-keep text-sm font-extrabold text-gray-900">
                오늘의 주요 매치 일정
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("MATCHES")}
              className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-bold text-[#00A878] hover:underline"
            >
              <span>전체 보기</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-2">
            {(isLoadingTodayMatches || !hasFetchedTodayMatches) &&
            todayKeyMatches.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-9 animate-pulse rounded-xl border border-gray-100 bg-[#F7F9F8]"
                  />
                ))}
                <p className="pt-1 text-center text-[11px] font-semibold text-gray-400">
                  경기 일정을 불러오는 중...
                </p>
              </div>
            ) : todayKeyMatches.length === 0 ? (
              <div className="flex h-full min-h-[120px] items-center justify-center rounded-xl border border-gray-100 bg-[#F7F9F8] px-3 text-center text-xs font-semibold text-gray-400">
                오늘 예정된 주요 경기가 없습니다.
              </div>
            ) : (
              todayKeyMatches.map((m) => {
                const clock = resolveMatchClock(m);
                const score = resolveMatchScore(m);

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveTab("MATCHES")}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-100 bg-[#F7F9F8] px-3 py-2 text-left transition hover:border-[#00A878]/40"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold tabular-nums ${
                          clock.isLive
                            ? clock.isHalfTime
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[#00A878]/15 text-[#00A878]"
                            : clock.isFinished
                            ? "bg-gray-200 text-gray-600"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {clock.shortLabel}
                      </span>
                      <span className="truncate text-xs font-bold text-gray-900">
                        {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                      </span>
                    </div>

                    <span className="shrink-0 font-mono text-xs font-black text-gray-800 tabular-nums">
                      {clock.isUpcoming ? clock.kickoffTime : score.display}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* 2. 1-Line Slim Quick Filter Bar + Live Ranking List */}
      <section className="rounded-2xl border border-gray-200/80 bg-[#FFFFFF] shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Mobile-only Search Input */}
        <div className="sm:hidden border-b border-gray-100 px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="선수명, 구단명, 리그 검색"
              className="h-9 w-full rounded-xl border border-gray-200 bg-[#F7F9F8] pl-8 pr-3 text-xs font-medium text-gray-900 focus:border-[#00A878] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* 1-Line Quick Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="정렬 기준"
              className="h-8 rounded-xl border border-gray-200 bg-[#F7F9F8] px-2.5 text-xs font-bold text-gray-800 focus:border-[#00A878] focus:outline-none"
            >
              <option value="GAINERS">정렬: 급등순</option>
              <option value="LOSERS">정렬: 급락순</option>
              <option value="PRICE">정렬: 시세순</option>
              <option value="RATING">정렬: 평점순</option>
            </select>

            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value as PositionFilter)}
              aria-label="포지션 필터"
              className="h-8 rounded-xl border border-gray-200 bg-[#F7F9F8] px-2.5 text-xs font-bold text-gray-800 focus:border-[#00A878] focus:outline-none"
            >
              <option value="ALL">포지션: 전체</option>
              <option value="FW">포지션: FW</option>
              <option value="MF">포지션: MF</option>
              <option value="DF">포지션: DF</option>
              <option value="GK">포지션: GK</option>
            </select>

            <select
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value as LeagueFilter)}
              aria-label="리그 필터"
              className="h-8 rounded-xl border border-gray-200 bg-[#F7F9F8] px-2.5 text-xs font-bold text-gray-800 focus:border-[#00A878] focus:outline-none"
            >
              <option value="ALL">리그: 전체</option>
              <option value="EPL">프리미어리그</option>
              <option value="LALIGA">라리가</option>
              <option value="BUNDESLIGA">분데스리가</option>
              <option value="SERIEA">세리에 A</option>
              <option value="LIGUE1">리그 1</option>
              <option value="AMATCH">국가대표</option>
            </select>

            <button
              type="button"
              onClick={() => setOnlySurge5((v) => !v)}
              className={`h-8 rounded-xl border px-3 text-xs font-bold transition ${
                onlySurge5
                  ? "border-[#00A878] bg-[#00A878]/10 text-[#00A878]"
                  : "border-gray-200 bg-[#F7F9F8] text-gray-600 hover:text-gray-900"
              }`}
            >
              급등 +5%
            </button>

            <button
              type="button"
              onClick={() => setOnlyWonderkid((v) => !v)}
              className={`h-8 rounded-xl border px-3 text-xs font-bold transition ${
                onlyWonderkid
                  ? "border-[#00A878] bg-[#00A878]/10 text-[#00A878]"
                  : "border-gray-200 bg-[#F7F9F8] text-gray-600 hover:text-gray-900"
              }`}
            >
              원더키드
            </button>

            <button
              type="button"
              onClick={() => setOnlyWatchlist((v) => !v)}
              className={`h-8 rounded-xl border px-3 text-xs font-bold transition ${
                onlyWatchlist
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : "border-gray-200 bg-[#F7F9F8] text-gray-600 hover:text-gray-900"
              }`}
            >
              ★ 관심만
            </button>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-8 items-center gap-1 rounded-xl px-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <RotateCcw className="h-3 w-3" />
                <span>초기화</span>
              </button>
            )}
          </div>

          <span className="text-[11px] font-semibold text-gray-400">
            총 {rankedPlayers.length}명
          </span>
        </div>

        {/* Real-time Player Ranking List */}
        {rankedPlayers.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-bold text-gray-600">
              조건에 맞는 선수가 없습니다.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-3 rounded-xl bg-[#F7F9F8] px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rankedPlayers.map((p, idx) => {
              const quote = resolveMarketQuote(p);
              const diff = quote.diff;
              const pct = quote.changePct;
              const isUp = diff > 0;
              const isDown = diff < 0;
              const isWatched = watchlist.includes(p.id);
              const isSelected = selectedPlayerId === p.id;
              const sparkColor = isUp
                ? "#00A878"
                : isDown
                ? "#F07868"
                : "#A8B2BC";

              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPlayerTrade(p, "BUY")}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#F7F9F8] ${
                    isSelected ? "bg-emerald-50/40" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center font-mono text-xs font-extrabold text-gray-400 tabular-nums">
                      {idx + 1}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatchlist(p.id);
                      }}
                      title={isWatched ? "관심선수 해제" : "관심선수 등록"}
                      className="shrink-0 rounded-full p-1 text-gray-300 hover:bg-gray-100"
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          isWatched
                            ? "fill-amber-400 text-amber-400"
                            : "text-gray-300"
                        }`}
                      />
                    </button>

                    <PlayerAvatar player={p} size={36} />

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-extrabold text-gray-900">
                          {formatPlayerDisplayName(p, "full")}
                        </span>
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                          {p.position}
                        </span>
                        <span className="hidden sm:inline-block shrink-0 font-mono text-[10px] font-semibold text-gray-400">
                          ★ {p.stats.rating.toFixed(1)}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-gray-400">
                        {p.teamName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <svg
                      width="68"
                      height="22"
                      viewBox="0 0 72 24"
                      className="hidden sm:block shrink-0"
                    >
                      <polyline
                        fill="none"
                        stroke={sparkColor}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={buildSparklinePoints(
                          quote.isPreMatch
                            ? [
                                { minute: 0, price: quote.basePrice },
                                { minute: 0, price: quote.basePrice },
                              ]
                            : p.priceHistory
                        )}
                      />
                    </svg>

                    <div className="w-24 text-right font-mono tabular-nums">
                      <p className="text-sm font-black text-gray-900">
                        {quote.currentPrice.toLocaleString()}P
                      </p>
                      <p
                        className={`text-[11px] font-bold ${
                          isUp
                            ? "text-[#00A878]"
                            : isDown
                            ? "text-[#F07868]"
                            : "text-[#A8B2BC]"
                        }`}
                      >
                        {isUp ? "+" : ""}
                        {pct.toFixed(2)}%
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlayerTrade(p, "BUY");
                      }}
                      className="rounded-xl bg-[#00A878]/10 px-3 py-1.5 text-xs font-extrabold text-[#00A878] transition hover:bg-[#00A878] hover:text-white"
                    >
                      거래
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
