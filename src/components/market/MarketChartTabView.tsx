"use client";

import React, { useMemo, useState } from "react";
import {
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  TrendingUp,
  Search,
  RotateCcw,
  BarChart2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
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
  TradeType,
  getPositionLine,
} from "@/types";
import MatchTimelineChart from "@/components/market/MatchTimelineChart";
import FullScreenCandleChartModal from "@/components/market/FullScreenCandleChartModal";

interface MarketChartTabViewProps {
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
type PriceBandFilter = "ALL" | "UNDER_10K" | "MID_10K_15K" | "OVER_15K";
type ChangeRangeFilter = "ALL" | "SURGE_5" | "DROP_5";

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

export default function MarketChartTabView({
  onSelectPlayerTrade,
}: MarketChartTabViewProps) {
  const user = useTradeStore((s) => s.user);
  const players = useTradeStore((s) => s.players);
  const matches = useTradeStore((s) => s.matches);
  const holdings = useTradeStore((s) => s.holdings);
  const watchlist = useTradeStore((s) => s.watchlist);
  const toggleWatchlist = useTradeStore((s) => s.toggleWatchlist);

  // Featured player & Full-screen Candle Modal state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    players[0]?.id ?? "p-son"
  );
  const [candleModalPlayer, setCandleModalPlayer] = useState<Player | null>(
    null
  );
  const [isInlineChartExpanded, setIsInlineChartExpanded] =
    useState<boolean>(false);

  // Sort mode
  const [rankFilter, setRankFilter] = useState<
    "GAINERS" | "LOSERS" | "PRICE" | "RATING"
  >("GAINERS");

  // Search & Dual Filter States (Football Criteria vs Investment Criteria)
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(true);

  // 1) Football Criteria
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [leagueFilter, setLeagueFilter] = useState<LeagueFilter>("ALL");
  const [clubFilter, setClubFilter] = useState<string>("ALL");

  // 2) Investment Criteria
  const [priceBandFilter, setPriceBandFilter] =
    useState<PriceBandFilter>("ALL");
  const [changeFilter, setChangeFilter] = useState<ChangeRangeFilter>("ALL");
  const [onlyWatchlist, setOnlyWatchlist] = useState<boolean>(false);
  const [onlyHoldings, setOnlyHoldings] = useState<boolean>(false);
  const [onlyHighVolume, setOnlyHighVolume] = useState<boolean>(false);
  const [onlyWonderkid, setOnlyWonderkid] = useState<boolean>(false);

  const activePlayer =
    players.find((p) => p.id === selectedPlayerId) ?? players[0];

  // Featured popular players for quick switcher
  const featuredIds = [
    "p-son",
    "p-haaland",
    "p-bellingham",
    "p-lee",
    "p-salah",
    "p-kim",
    "p-yamal",
    "p-palmer",
  ];
  const featuredPlayers = featuredIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));

  // Helper to check which league a player belongs to
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

  // Distinct clubs/national teams for the club dropdown
  const availableClubs = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      if (p.teamName) set.add(p.teamName);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [players]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim() !== "") count++;
    if (posFilter !== "ALL") count++;
    if (leagueFilter !== "ALL") count++;
    if (clubFilter !== "ALL") count++;
    if (priceBandFilter !== "ALL") count++;
    if (changeFilter !== "ALL") count++;
    if (onlyWatchlist) count++;
    if (onlyHoldings) count++;
    if (onlyHighVolume) count++;
    if (onlyWonderkid) count++;
    return count;
  }, [
    searchQuery,
    posFilter,
    leagueFilter,
    clubFilter,
    priceBandFilter,
    changeFilter,
    onlyWatchlist,
    onlyHoldings,
    onlyHighVolume,
    onlyWonderkid,
  ]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setPosFilter("ALL");
    setLeagueFilter("ALL");
    setClubFilter("ALL");
    setPriceBandFilter("ALL");
    setChangeFilter("ALL");
    setOnlyWatchlist(false);
    setOnlyHoldings(false);
    setOnlyHighVolume(false);
    setOnlyWonderkid(false);
  };

  // Compute volatility/volume proxy for each player (for '📊 거래량(변동성) 상위' filter)
  const highVolumeThreshold = useMemo(() => {
    const swings = players.map((p) => {
      const open = p.openPrice ?? p.initialPrice;
      return Math.abs((p.currentPrice - open) / Math.max(1, open)) * 100;
    });
    swings.sort((a, b) => b - a);
    return swings[Math.min(19, Math.max(0, swings.length - 1))] ?? 2.5;
  }, [players]);

  // Apply Search + Football Criteria + Investment Criteria + Sort + Top 15 Cutoff
  const { filteredTotalCount, top15Players } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = players.filter((p) => {
      // Search query check
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.englishName.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.teamShort.toLowerCase().includes(q) ||
          (p.nationalTeam && p.nationalTeam.toLowerCase().includes(q));
        if (!hit) return false;
      }

      // 1) Football Criteria: Position Line
      if (posFilter !== "ALL" && getPositionLine(p.position) !== posFilter) {
        return false;
      }

      // 2) Football Criteria: League & Club
      if (!doesPlayerMatchLeague(p, leagueFilter)) {
        return false;
      }
      if (
        clubFilter !== "ALL" &&
        p.teamName !== clubFilter &&
        p.nationalTeam !== clubFilter
      ) {
        return false;
      }

      // 3) Investment Criteria: Price Band
      if (priceBandFilter === "UNDER_10K" && p.currentPrice >= 10000) {
        return false;
      }
      if (
        priceBandFilter === "MID_10K_15K" &&
        (p.currentPrice < 10000 || p.currentPrice >= 15000)
      ) {
        return false;
      }
      if (priceBandFilter === "OVER_15K" && p.currentPrice < 15000) {
        return false;
      }

      // 4) Investment Criteria: Price Change %
      const openP = p.openPrice ?? p.initialPrice;
      const pct = calculateChangePercentFromOpen(p.currentPrice, openP);
      if (changeFilter === "SURGE_5" && pct < 5) {
        return false;
      }
      if (changeFilter === "DROP_5" && pct > -5) {
        return false;
      }

      // 5) Investment Status & Supply Toggles
      if (onlyWatchlist && !watchlist.includes(p.id)) {
        return false;
      }
      if (onlyHoldings && (!user || (holdings[p.id]?.quantity ?? 0) <= 0)) {
        return false;
      }
      if (
        onlyHighVolume &&
        Math.abs(pct) < highVolumeThreshold &&
        !p.priceHistory.some((pt) => Boolean(pt.event))
      ) {
        return false;
      }
      if (onlyWonderkid && p.tier !== "C" && (p.basePrice ?? p.initialPrice) >= 5000) {
        return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const openA = a.openPrice ?? a.initialPrice;
      const openB = b.openPrice ?? b.initialPrice;
      const rateA = calculateChangePercentFromOpen(a.currentPrice, openA);
      const rateB = calculateChangePercentFromOpen(b.currentPrice, openB);

      if (rankFilter === "GAINERS") return rateB - rateA;
      if (rankFilter === "LOSERS") return rateA - rateB;
      if (rankFilter === "PRICE") return b.currentPrice - a.currentPrice;
      return b.stats.rating - a.stats.rating;
    });

    return {
      filteredTotalCount: sorted.length,
      top15Players: sorted.slice(0, 15), // Strict Top 15 cutoff
    };
  }, [
    players,
    searchQuery,
    posFilter,
    leagueFilter,
    clubFilter,
    priceBandFilter,
    changeFilter,
    onlyWatchlist,
    onlyHoldings,
    onlyHighVolume,
    onlyWonderkid,
    watchlist,
    user,
    holdings,
    highVolumeThreshold,
    rankFilter,
  ]);

  const openPrice = roundToTen(
    activePlayer.openPrice ??
      activePlayer.priceHistory[0]?.price ??
      activePlayer.initialPrice
  );
  const activeHigh = activePlayer.highPrice ?? activePlayer.currentPrice;
  const activeLow = activePlayer.lowPrice ?? openPrice;
  const activeVolume = activePlayer.volume ?? 0;
  const activeDiff = calculateDiffFromOpen(activePlayer.currentPrice, openPrice);
  const activePct = calculateChangePercentFromOpen(
    activePlayer.currentPrice,
    openPrice
  );
  const isActiveUp = activeDiff > 0;
  const isActiveDown = activeDiff < 0;
  const isActiveWatched = watchlist.includes(activePlayer.id);

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      {/* 1. Compact Featured Player Card + [📊 실시간 캔들 차트 크게 보기] Trigger */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-[#00A878]" />
            <h2 className="text-sm font-extrabold text-gray-900">
              인기 종목 실시간 시세 & 캔들 차트
            </h2>
          </div>
          <span className="text-[11px] font-medium text-gray-400">
            5초 주기 자동 갱신
          </span>
        </div>

        {/* Horizontal Featured Player Chip Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2">
          {featuredPlayers.map((p) => {
            const isSelected = p.id === activePlayer.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlayerId(p.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                  isSelected
                    ? "bg-[#111827] text-white font-bold shadow-xs"
                    : "bg-[#f1f3f5] text-gray-600 font-medium hover:bg-gray-200"
                }`}
              >
                <span>{p.name}</span>
                <span
                  className={`font-mono text-[10px] ${
                    isSelected ? "text-[#00A878]" : "text-gray-400"
                  }`}
                >
                  {p.teamShort}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Player Summary Row */}
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              style={{ backgroundColor: activePlayer.teamColor }}
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-white font-mono shadow-xs"
            >
              <span className="text-[9px] font-semibold opacity-80 leading-none">
                {activePlayer.teamShort}
              </span>
              <span className="text-sm font-black">
                {activePlayer.backNumber}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-base font-extrabold text-gray-900">
                  {activePlayer.name}
                </h3>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                  {activePlayer.position}
                </span>
                <button
                  type="button"
                  onClick={() => toggleWatchlist(activePlayer.id)}
                  title={isActiveWatched ? "관심선수 해제" : "관심선수 등록"}
                  className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 active:scale-90"
                >
                  <Star
                    className={`h-4 w-4 ${
                      isActiveWatched
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              </div>
              <p className="truncate text-[11px] text-gray-400 font-mono">
                {activePlayer.teamName} · 시가 {openPrice.toLocaleString()}P · 고가{" "}
                <span className="text-[#00A878]">
                  {activeHigh.toLocaleString()}P
                </span>{" "}
                · 저가{" "}
                <span className="text-[#F07868]">
                  {activeLow.toLocaleString()}P
                </span>{" "}
                · 거래량 {activeVolume.toLocaleString()}주
              </p>
            </div>
          </div>

          <div className="text-right font-mono shrink-0">
            <div className="text-lg font-black text-gray-900">
              {activePlayer.currentPrice.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-gray-400">P</span>
            </div>
            <div
              className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                isActiveUp
                  ? "text-[#00A878]"
                  : isActiveDown
                  ? "text-[#F07868]"
                  : "text-[#A8B2BC]"
              }`}
            >
              {isActiveUp ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : isActiveDown ? (
                <ArrowDownRight className="h-3.5 w-3.5" />
              ) : null}
              <span>
                {isActiveUp ? "+" : ""}
                {activeDiff.toLocaleString()}P ({isActiveUp ? "+" : ""}
                {activePct.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Action Row: [📊 실시간 캔들 차트 크게 보기] + [즉시 주문] + Collapsible Inline Preview Toggle */}
        <div className="mt-3 grid grid-cols-[1.5fr_1fr] gap-2">
          <button
            type="button"
            onClick={() => setCandleModalPlayer(activePlayer)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-gray-800 active:scale-95"
          >
            <BarChart2 className="h-4 w-4 text-[#00A878]" />
            <span>📊 실시간 캔들 차트 크게 보기</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectPlayerTrade(activePlayer, "BUY")}
            className="flex items-center justify-center gap-1 rounded-xl bg-[#00A878] px-3 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:opacity-95 active:scale-95"
          >
            <span>즉시 매수/매도</span>
          </button>
        </div>

        {/* Optional Collapsible Inline Timeline Summary (Default Collapsed for Clean Readability) */}
        <div className="mt-2 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={() => setIsInlineChartExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between text-[11px] font-bold text-gray-500 hover:text-gray-800"
          >
            <span className="truncate">
              {activePlayer.lastEvent.text}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-gray-400">
              <span>{isInlineChartExpanded ? "미니 차트 접기" : "0~90' 라인 요약"}</span>
              {isInlineChartExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </button>

          {isInlineChartExpanded && (
            <div className="mt-2.5">
              <MatchTimelineChart
                player={activePlayer}
                onOpenFullScreenCandle={() => setCandleModalPlayer(activePlayer)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. Search Bar + Dual Filter System ('⚽ 축구 기준' vs '📈 투자 기준') */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
        {/* Top Search Input + Filter Toggle & Reset */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="선수명, 구단명, 국가대표 검색 (예: 손흥민, 바르샤)"
              className="h-10 w-full rounded-xl border border-gray-200 bg-[#f8f9fa] pl-9 pr-3 text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:border-[#00A878] focus:bg-white focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold transition ${
              activeFilterCount > 0
                ? "border-[#00A878] bg-[#00A878]/10 text-[#00A878]"
                : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>필터</span>
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#00A878] px-1 font-mono text-[10px] font-black text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleResetFilters}
              title="필터 초기화"
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 text-[11px] font-bold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>초기화</span>
            </button>
          )}
        </div>

        {/* Dual Filter Panel: Group 1 (Football Criteria) & Group 2 (Investment Criteria) */}
        {isFilterOpen && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            {/* Group 1: ⚽ 축구 기준 필터 (Football Criteria) */}
            <div className="rounded-xl bg-[#f8f9fa] p-3 border border-gray-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-gray-900">
                  ⚽ 축구 기준 필터 (포지션 · 리그 · 구단)
                </span>
                <span className="text-[10px] font-semibold text-gray-400">
                  Football Criteria
                </span>
              </div>

              {/* ① 포지션 */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { key: "ALL", label: "포지션 전체" },
                    { key: "FW", label: "FW (공격)" },
                    { key: "MF", label: "MF (미드필더)" },
                    { key: "DF", label: "DF (수비)" },
                    { key: "GK", label: "GK (골키퍼)" },
                  ] as { key: PositionFilter; label: string }[]
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPosFilter(item.key)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                      posFilter === item.key
                        ? "bg-gray-900 text-white shadow-xs"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* ② 소속 리그 + 구단 선택 */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { key: "ALL", label: "리그 전체" },
                    { key: "EPL", label: "프리미어리그" },
                    { key: "LALIGA", label: "라리가" },
                    { key: "BUNDESLIGA", label: "분데스리가" },
                    { key: "SERIEA", label: "세리에A" },
                    { key: "LIGUE1", label: "리그1" },
                    { key: "AMATCH", label: "🌍 국가대표(A매치)" },
                  ] as { key: LeagueFilter; label: string }[]
                ).map((lg) => (
                  <button
                    key={lg.key}
                    type="button"
                    onClick={() => {
                      setLeagueFilter(lg.key);
                      setClubFilter("ALL");
                    }}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                      leagueFilter === lg.key
                        ? "bg-[#00A878] text-white shadow-xs"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {lg.label}
                  </button>
                ))}

                {/* Club Dropdown */}
                <select
                  value={clubFilter}
                  onChange={(e) => setClubFilter(e.target.value)}
                  className="h-7 shrink-0 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-bold text-gray-700 focus:border-[#00A878] focus:outline-none"
                >
                  <option value="ALL">구단 전체 ({availableClubs.length})</option>
                  {availableClubs.map((club) => (
                    <option key={club} value={club}>
                      {club}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Group 2: 📈 투자 기준 필터 (Investment Criteria) */}
            <div className="rounded-xl bg-[#f8f9fa] p-3 border border-gray-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-gray-900">
                  📈 투자 기준 필터 (가격대 · 등락폭 · 관심/수급)
                </span>
                <span className="text-[10px] font-semibold text-gray-400">
                  Investment Criteria
                </span>
              </div>

              {/* ③ 가격대 */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { key: "ALL", label: "가격대 전체" },
                    { key: "UNDER_10K", label: "10,000P 미만 (저가주)" },
                    { key: "MID_10K_15K", label: "10,000~15,000P (중가주)" },
                    { key: "OVER_15K", label: "15,000P 이상 (고액주/S티어)" },
                  ] as { key: PriceBandFilter; label: string }[]
                ).map((pb) => (
                  <button
                    key={pb.key}
                    type="button"
                    onClick={() => setPriceBandFilter(pb.key)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                      priceBandFilter === pb.key
                        ? "bg-gray-900 text-white shadow-xs"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {pb.label}
                  </button>
                ))}
              </div>

              {/* ④ 가격 변동폭 + ⑤ 투자 상태 및 수급 */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { key: "ALL", label: "변동폭 전체" },
                    { key: "SURGE_5", label: "🔥 +5% 이상 급등" },
                    { key: "DROP_5", label: "💧 -5% 이상 급락" },
                  ] as { key: ChangeRangeFilter; label: string }[]
                ).map((cf) => (
                  <button
                    key={cf.key}
                    type="button"
                    onClick={() => setChangeFilter(cf.key)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                      changeFilter === cf.key
                        ? cf.key === "DROP_5"
                          ? "bg-[#F07868] text-white shadow-xs"
                          : "bg-[#00A878] text-white shadow-xs"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {cf.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setOnlyWatchlist((v) => !v)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                    onlyWatchlist
                      ? "bg-amber-500 text-white shadow-xs"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  ⭐ 관심선수만 ({watchlist.length})
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyHoldings((v) => !v)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                    onlyHoldings
                      ? "bg-[#00A878] text-white shadow-xs"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  💼 보유 선수만
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyHighVolume((v) => !v)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                    onlyHighVolume
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  📊 거래량(변동성) 상위
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyWonderkid((v) => !v)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                    onlyWonderkid
                      ? "bg-violet-600 text-white shadow-xs"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  ⚡ 원더키드만
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Top 15 Player Ranking Section */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-[#00A878]" />
            <h2 className="text-sm font-extrabold text-gray-900">
              실시간 선수 등락률 랭킹
            </h2>
            <span className="rounded-full bg-[#00A878]/10 px-2 py-0.5 font-mono text-[10px] font-extrabold text-[#00A878]">
              TOP 15
            </span>
            {activeFilterCount > 0 && (
              <span className="text-[11px] font-semibold text-gray-400">
                (검색 {filteredTotalCount}명 중 상위 {top15Players.length}명)
              </span>
            )}
          </div>

          {/* Sort Mode Selector */}
          <div className="inline-flex rounded-xl bg-gray-100 p-0.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setRankFilter("GAINERS")}
              className={`rounded-lg px-2 py-1 transition ${
                rankFilter === "GAINERS"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500"
              }`}
            >
              상승률순
            </button>
            <button
              type="button"
              onClick={() => setRankFilter("LOSERS")}
              className={`rounded-lg px-2 py-1 transition ${
                rankFilter === "LOSERS"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500"
              }`}
            >
              하락률순
            </button>
            <button
              type="button"
              onClick={() => setRankFilter("PRICE")}
              className={`rounded-lg px-2 py-1 transition ${
                rankFilter === "PRICE"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500"
              }`}
            >
              고가순
            </button>
            <button
              type="button"
              onClick={() => setRankFilter("RATING")}
              className={`rounded-lg px-2 py-1 transition ${
                rankFilter === "RATING"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500"
              }`}
            >
              평점순
            </button>
          </div>
        </div>

        {top15Players.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-xs font-extrabold text-gray-700">
              조건에 일치하는 선수가 없습니다.
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              검색어나 축구/투자 필터 조건을 조정해보세요.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-extrabold text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>필터 전체 초기화</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {top15Players.map((player, index) => {
              const pOpen = player.openPrice ?? player.initialPrice;
              const diff = calculateDiffFromOpen(player.currentPrice, pOpen);
              const pct = calculateChangePercentFromOpen(
                player.currentPrice,
                pOpen
              );
              const isUp = diff > 0;
              const isDown = diff < 0;
              const holding = user ? holdings[player.id] : undefined;
              const isWatched = watchlist.includes(player.id);

              return (
                <div
                  key={player.id}
                  onClick={() => {
                    setSelectedPlayerId(player.id);
                    onSelectPlayerTrade(player, "BUY");
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 py-3 transition hover:bg-gray-50/80"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Rank Number */}
                    <span
                      className={`w-5 text-center font-mono text-xs font-extrabold ${
                        index < 3 ? "text-[#00A878]" : "text-gray-400"
                      }`}
                    >
                      {index + 1}
                    </span>

                    {/* One-Touch Watchlist Star Toggle */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatchlist(player.id);
                      }}
                      title={isWatched ? "관심선수 해제" : "관심선수 등록"}
                      className="shrink-0 rounded-full p-1 text-gray-300 transition hover:bg-gray-100 active:scale-90"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          isWatched
                            ? "fill-amber-400 text-amber-400"
                            : "text-gray-300 hover:text-gray-400"
                        }`}
                      />
                    </button>

                    <div
                      style={{ backgroundColor: player.teamColor }}
                      className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-white font-mono"
                    >
                      <span className="text-[8px] font-semibold opacity-80 leading-none">
                        {player.teamShort}
                      </span>
                      <span className="text-xs font-black">
                        {player.backNumber}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-gray-900 truncate">
                          {player.name}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.2 text-[10px] font-bold text-gray-600">
                          {player.position}
                        </span>
                        {player.tier === "C" && (
                          <span className="rounded bg-violet-50 px-1.5 py-0.2 text-[9px] font-extrabold text-violet-700 border border-violet-200">
                            ⚡원더키드
                          </span>
                        )}
                        {holding && holding.quantity > 0 && (
                          <span className="rounded-full bg-[#00A878]/10 px-1.5 py-0.2 text-[10px] font-bold text-[#00A878]">
                            {holding.quantity}주
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">
                        {player.teamName} · 평점 {player.stats.rating.toFixed(1)} ·{" "}
                        {player.stats.goals}골 {player.stats.assists}도움
                      </p>
                    </div>
                  </div>

                  {/* Right: Price + Standardized Change Badge + [📊 캔들] Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right font-mono">
                      <p className="text-sm font-black text-gray-900">
                        {player.currentPrice.toLocaleString()} P
                      </p>
                      <span
                        className={`inline-block rounded-md px-1.5 py-0.2 text-[11px] font-extrabold ${
                          isUp
                            ? "bg-[#00A878]/10 text-[#00A878]"
                            : isDown
                            ? "bg-[#F07868]/10 text-[#F07868]"
                            : "bg-[#A8B2BC]/15 text-[#A8B2BC]"
                        }`}
                      >
                        {isUp ? "+" : ""}
                        {pct.toFixed(2)}%
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlayerId(player.id);
                        setCandleModalPlayer(player);
                      }}
                      title="실시간 캔들 차트 크게 보기"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-[#f8f9fa] text-gray-700 transition hover:border-[#00A878] hover:bg-[#00A878]/10 hover:text-[#00A878] active:scale-90"
                    >
                      <BarChart2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dedicated Full-Screen Candlestick Chart Modal (Zoom & Pan Supported) */}
      <FullScreenCandleChartModal
        player={candleModalPlayer}
        isOpen={Boolean(candleModalPlayer)}
        onClose={() => setCandleModalPlayer(null)}
        onSelectTrade={onSelectPlayerTrade}
      />
    </div>
  );
}
