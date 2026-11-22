"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  User,
  LogOut,
  LogIn,
  Search,
  X,
} from "lucide-react";
import {
  useTradeStore,
  roundToTen,
  doesPlayerBelongToMatch,
} from "@/store/useTradeStore";
import {
  resolveMatchClock,
  resolveMatchForPlayerView,
  resolveMatchScore,
  resolveSyncedMatchFromContext,
} from "@/lib/matchSync";
import { resolvePlayerQuote } from "@/lib/playerQuote";
import {
  formatPlayerDisplayName,
  matchesPlayerSearchQuery,
} from "@/lib/playerDisplayName";
import { BottomTab, Player } from "@/types";

interface TopAssetHeaderProps {
  countdown?: number;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onSelectSearchPlayer: (player: Player) => void;
  onOpenAuthModal: () => void;
}

/**
 * Isolated 1-second timer badge so parent layout/tabs do not re-render every second.
 */
function MarketCountdownBadge({
  externalCountdown,
}: {
  externalCountdown?: number;
}) {
  const tickMarket = useTradeStore((s) => s.tickMarket);
  const [countdown, setCountdown] = useState<number>(externalCountdown ?? 5);

  useEffect(() => {
    if (externalCountdown !== undefined) {
      setCountdown(externalCountdown);
      return;
    }

    let remaining = 5;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        tickMarket();
        remaining = Math.floor(Math.random() * 6) + 5;
      }
      setCountdown(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [externalCountdown, tickMarket]);

  return (
    <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#00A878] border border-emerald-200/60 shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-[#00A878] animate-pulse" />
      {countdown}s
    </span>
  );
}

const NAV_TABS: { key: BottomTab; label: string }[] = [
  { key: "MATCHES", label: "경기 일정" },
  { key: "MARKET", label: "시세/차트" },
  { key: "PORTFOLIO", label: "마이 포트폴리오" },
];

export default function TopAssetHeader({
  countdown,
  searchQuery,
  onSearchQueryChange,
  onSelectSearchPlayer,
  onOpenAuthModal,
}: TopAssetHeaderProps) {
  const user = useTradeStore((s) => s.user);
  const cash = useTradeStore((s) => s.cash);
  const players = useTradeStore((s) => s.players);
  const matches = useTradeStore((s) => s.matches);
  const activeMatchContext = useTradeStore((s) => s.activeMatchContext);
  const holdings = useTradeStore((s) => s.holdings);
  const activeTab = useTradeStore((s) => s.activeTab);
  const setActiveTab = useTradeStore((s) => s.setActiveTab);
  const logout = useTradeStore((s) => s.logout);

  const syncedHeaderMatch = useMemo(
    () => resolveSyncedMatchFromContext(activeMatchContext, matches),
    [activeMatchContext, matches]
  );
  const headerClock = useMemo(
    () =>
      syncedHeaderMatch || activeMatchContext
        ? resolveMatchClock(syncedHeaderMatch, activeMatchContext)
        : null,
    [syncedHeaderMatch, activeMatchContext]
  );
  const headerScore = useMemo(
    () =>
      syncedHeaderMatch || activeMatchContext
        ? resolveMatchScore(syncedHeaderMatch, activeMatchContext)
        : null,
    [syncedHeaderMatch, activeMatchContext]
  );

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

  // Global "/" keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    if (!isSearchFocused) return;
    const handleClick = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isSearchFocused]);

  let holdingsValue = 0;
  if (user) {
    for (const h of Object.values(holdings)) {
      if (h.quantity <= 0) continue;
      const p = players.find((pl) => pl.id === h.playerId);
      if (!p) continue;
      const holdingMatch = resolveMatchForPlayerView({
        player: p,
        storeMatches: matches,
        activeMatchContext: h.matchContext ?? null,
        belongsToMatch: doesPlayerBelongToMatch,
      });
      const holdingClock =
        holdingMatch || h.matchContext
          ? resolveMatchClock(holdingMatch, h.matchContext)
          : null;
      const curPrice = holdingClock
        ? resolvePlayerQuote(p, holdingClock.status).currentPrice
        : roundToTen(p.currentPrice);
      holdingsValue += curPrice * h.quantity;
    }
  }
  const totalAssets = roundToTen(cash + holdingsValue);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return players
      .filter((p) => matchesPlayerSearchQuery(p, q))
      .slice(0, 6);
  }, [players, searchQuery]);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-gray-200/80 bg-[#FFFFFF]/95">
      <div className="mx-auto flex h-full w-full max-w-[1380px] items-center justify-between gap-3 px-4 lg:px-6">
        {/* Left: Logo + Main Navigation Tabs */}
        <div className="flex items-center gap-6 min-w-0">
          <button
            type="button"
            onClick={() => setActiveTab("MATCHES")}
            className="flex items-center gap-2 shrink-0 text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00A878] text-white font-black text-sm tracking-tighter shadow-xs">
              PT
            </div>
            <span className="text-[17px] font-extrabold tracking-tight text-gray-900">
              Pitch<span className="text-[#00A878]">Trade</span>
            </span>
            <span
              title="시뮬레이션 및 더미 데이터 기반 데모 프로토타입"
              className="hidden sm:inline-block rounded-md bg-amber-100 border border-amber-300/80 px-1.5 py-0.5 font-mono text-[9px] font-black tracking-wider text-amber-800 shrink-0"
            >
              DEMO
            </span>
            <MarketCountdownBadge externalCountdown={countdown} />
          </button>

          {/* Desktop Main Navigation Tabs */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl px-3.5 py-2 text-[13px] transition ${
                    isActive
                      ? "bg-[#F7F9F8] font-extrabold text-[#00A878]"
                      : "font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: Active Match Pill + Global Search Bar + Auth / Profile */}
        <div className="flex items-center gap-2.5 shrink-0">
          {headerClock && headerScore && (syncedHeaderMatch || activeMatchContext) && (
            <button
              type="button"
              onClick={() => setActiveTab("MATCHES")}
              className="hidden 2xl:inline-flex items-center gap-1.5 rounded-xl border border-gray-200/90 bg-[#F7F9F8] px-2.5 py-1.5 text-[11px] transition hover:border-[#00A878]/50"
            >
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-extrabold tabular-nums ${
                  headerClock.isLive
                    ? headerClock.isHalfTime
                      ? "bg-amber-100 text-amber-800"
                      : "bg-[#00A878]/15 text-[#00A878]"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {headerClock.shortLabel}
              </span>
              <span className="font-mono font-extrabold text-gray-900 tabular-nums">
                {syncedHeaderMatch?.homeTeam.shortName ??
                  activeMatchContext?.homeTeam}{" "}
                {headerScore.display}{" "}
                {syncedHeaderMatch?.awayTeam.shortName ??
                  activeMatchContext?.awayTeam}
              </span>
            </button>
          )}

          {/* Global Search Input */}
          <div ref={searchBoxRef} className="relative hidden sm:block w-56 md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                onSearchQueryChange(e.target.value);
                setIsSearchFocused(true);
              }}
              placeholder="선수명, 구단명, 리그 검색"
              className="h-9 w-full rounded-xl border border-gray-200/90 bg-[#F7F9F8] pl-8 pr-12 text-xs font-medium text-gray-900 placeholder:text-gray-400 transition focus:border-[#00A878] focus:bg-white focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-gray-400">
                /
              </kbd>
            )}

            {/* Instant Search Dropdown */}
            {isSearchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-2xl border border-gray-200 bg-[#FFFFFF] shadow-lg">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">
                    일치하는 선수 또는 구단이 없습니다.
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {searchResults.map((p) => {
                      const matchedGame = resolveMatchForPlayerView({
                        player: p,
                        storeMatches: matches,
                        belongsToMatch: doesPlayerBelongToMatch,
                      });
                      const gameClock = matchedGame
                        ? resolveMatchClock(matchedGame)
                        : null;
                      const gameScore = matchedGame
                        ? resolveMatchScore(matchedGame)
                        : null;
                      const quote = resolvePlayerQuote(
                        p,
                        gameClock?.status ?? "LIVE"
                      );
                      const pct = quote.changePct;
                      const isUp = pct > 0;
                      const isDown = pct < 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onSelectSearchPlayer(p);
                            setIsSearchFocused(false);
                          }}
                          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left transition hover:bg-[#F7F9F8]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-extrabold text-gray-900">
                              {formatPlayerDisplayName(p, "full")}{" "}
                              <span className="font-semibold text-gray-400">
                                {p.position}
                              </span>
                            </p>
                            <p className="truncate text-[10px] text-gray-400">
                              {p.teamName}
                              {matchedGame && gameClock && gameScore && (
                                <span className="ml-1.5 font-mono font-semibold text-gray-500 tabular-nums">
                                  · {gameClock.shortLabel}{" "}
                                  {matchedGame.homeTeam.shortName}{" "}
                                  {gameScore.display}{" "}
                                  {matchedGame.awayTeam.shortName}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-right font-mono shrink-0">
                            <p className="text-xs font-black text-gray-900">
                              {quote.currentPrice.toLocaleString()}P
                            </p>
                            <p
                              className={`text-[10px] font-bold ${
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
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Compact Asset Chip (Desktop when logged in) */}
          {user && (
            <button
              type="button"
              onClick={() => setActiveTab("PORTFOLIO")}
              className="hidden xl:inline-flex items-center gap-1.5 rounded-xl border border-gray-200/90 bg-[#F7F9F8] px-3 py-1.5 text-xs transition hover:border-[#00A878]/50"
            >
              <span className="font-semibold text-gray-500">총 자산</span>
              <span className="font-mono font-black text-gray-900">
                {totalAssets.toLocaleString()}P
              </span>
            </button>
          )}

          {/* Auth / Profile */}
          {user ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenAuthModal}
                title="계정 전환 모달 열기"
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-[#F7F9F8] px-2.5 py-1.5 text-xs font-extrabold text-gray-800 transition hover:border-gray-300"
              >
                <User className="h-3.5 w-3.5 text-[#00A878]" />
                <span className="max-w-[84px] truncate">{user.name}</span>
                {user.role === "admin" && (
                  <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">
                    ADMIN
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={logout}
                title="로그아웃"
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                <LogOut className="h-3 w-3" />
                <span className="hidden md:inline">로그아웃</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#00A878] px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#00985f] active:scale-95"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>로그인 / 프로필</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
