"use client";

import React, { useMemo, useState } from "react";
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
  roundToTen,
  doesPlayerBelongToMatch,
  isNationalTeamMatch,
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
} from "@/store/useTradeStore";
import {
  Player,
  PositionLine,
  PricePoint,
  TradeType,
  getPositionLine,
} from "@/types";
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
  const watchlist = useTradeStore((s) => s.watchlist);
  const toggleWatchlist = useTradeStore((s) => s.toggleWatchlist);
  const setActiveTab = useTradeStore((s) => s.setActiveTab);

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
    const todayMatches = matches.filter((m) => m.dateKey === "TODAY");
    return (todayMatches.length > 0 ? todayMatches : matches).slice(0, 4);
  }, [matches]);

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

  const rankedPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = players.filter((p) => {
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.englishName.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.teamShort.toLowerCase().includes(q) ||
          (p.nationalTeam && p.nationalTeam.toLowerCase().includes(q));
        if (!hit) return false;
      }

      if (posFilter !== "ALL" && getPositionLine(p.position) !== posFilter) {
        return false;
      }

      if (!doesPlayerMatchLeague(p, leagueFilter)) {
        return false;
      }

      const openP = roundToTen(p.openPrice ?? p.initialPrice);
      const pct = calculateChangePercentFromOpen(p.currentPrice, openP);
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
      const openA = roundToTen(a.openPrice ?? a.initialPrice);
      const openB = roundToTen(b.openPrice ?? b.initialPrice);
      const rateA = calculateChangePercentFromOpen(a.currentPrice, openA);
      const rateB = calculateChangePercentFromOpen(b.currentPrice, openB);

      if (sortMode === "GAINERS") return rateB - rateA;
      if (sortMode === "LOSERS") return rateA - rateB;
      if (sortMode === "PRICE") return b.currentPrice - a.currentPrice;
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
        {/* Left 2/3: 6 Hot Players Compact Grid (3 cols x 2 rows) */}
        <div className="lg:col-span-8 rounded-2xl border border-gray-200/80 bg-[#FFFFFF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-[#00A878]" />
              <h2 className="text-sm font-extrabold text-gray-900">
                핫 플레이어 스포트라이트
              </h2>
            </div>
            <span className="text-[11px] font-medium text-gray-400">
              카드 클릭 시 즉시 차트 · 주문 패널 연결
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {spotlightPlayers.map((p) => {
              const open = roundToTen(p.openPrice ?? p.initialPrice);
              const pct = calculateChangePercentFromOpen(p.currentPrice, open);
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
                  className={`flex flex-col justify-between rounded-xl border p-3 text-left transition hover:border-[#00A878]/60 active:scale-[0.99] ${
                    isSelected
                      ? "border-[#00A878] bg-emerald-50/35"
                      : "border-gray-200/80 bg-[#F7F9F8]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar player={p} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-gray-900">
                          {p.name}
                        </p>
                        <span className="text-[10px] font-semibold text-gray-400">
                          {p.position} · {p.teamShort}
                        </span>
                      </div>
                    </div>
                    <svg
                      width="56"
                      height="22"
                      viewBox="0 0 72 24"
                      className="shrink-0 overflow-visible"
                    >
                      <polyline
                        fill="none"
                        stroke={sparkColor}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={buildSparklinePoints(p.priceHistory)}
                      />
                    </svg>
                  </div>

                  <div className="mt-2.5 flex items-baseline justify-between gap-1 w-full">
                    <span className="font-mono text-sm font-black text-gray-900 tabular-nums">
                      {p.currentPrice.toLocaleString()}P
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold tabular-nums ${
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
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-[#00A878]" />
              <h2 className="text-sm font-extrabold text-gray-900">
                오늘의 주요 매치 일정
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("MATCHES")}
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#00A878] hover:underline"
            >
              <span>전체 보기</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-2">
            {todayKeyMatches.map((m) => {
              const statusLabel =
                m.status === "LIVE"
                  ? `${m.minute ?? 45}'`
                  : m.status === "FT"
                  ? "FT"
                  : "PRE";

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveTab("MATCHES")}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-100 bg-[#F7F9F8] px-3 py-2 text-left transition hover:border-[#00A878]/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold ${
                        m.status === "LIVE"
                          ? "bg-[#00A878]/15 text-[#00A878]"
                          : m.status === "FT"
                          ? "bg-gray-200 text-gray-600"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <span className="truncate text-xs font-bold text-gray-900">
                      {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                    </span>
                  </div>

                  <span className="shrink-0 font-mono text-xs font-black text-gray-800 tabular-nums">
                    {m.status === "UPCOMING"
                      ? m.kickoffTime
                      : `${m.homeTeam.score ?? 0} : ${m.awayTeam.score ?? 0}`}
                  </span>
                </button>
              );
            })}
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
              const open = roundToTen(p.openPrice ?? p.initialPrice);
              const diff = calculateDiffFromOpen(p.currentPrice, open);
              const pct = calculateChangePercentFromOpen(p.currentPrice, open);
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
                          {p.name}
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
                        points={buildSparklinePoints(p.priceHistory)}
                      />
                    </svg>

                    <div className="w-24 text-right font-mono tabular-nums">
                      <p className="text-sm font-black text-gray-900">
                        {p.currentPrice.toLocaleString()}P
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
