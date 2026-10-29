"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Trophy,
  Sparkles,
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react";
import { useTradeStore } from "@/store/useTradeStore";
import { Match, Player, TradeType } from "@/types";
import MatchAccordionCard from "./MatchAccordionCard";
import FormationPitchModal from "./FormationPitchModal";

interface MatchesTabViewProps {
  onSelectPlayerTrade: (player: Player, type: TradeType) => void;
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function toDateStr(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return toDateStr(d);
}

function getNearestSaturdayStr(dateStr: string): string {
  const d = parseDateStr(dateStr);
  const day = d.getDay();
  const diffToSat = day === 6 ? 7 : (6 - day + 7) % 7;
  d.setDate(d.getDate() + diffToSat);
  return toDateStr(d);
}

function formatKoreanDateLabel(dateStr: string, todayStr: string): {
  badge?: string;
  mainText: string;
} {
  const d = parseDateStr(dateStr);
  const t = parseDateStr(todayStr);

  const diffDays = Math.round(
    (d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)
  );

  let badge: string | undefined;
  if (diffDays === 0) badge = "오늘";
  else if (diffDays === -1) badge = "어제";
  else if (diffDays === 1) badge = "내일";

  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const dayName = WEEKDAYS_KO[d.getDay()];

  return {
    badge,
    mainText: `${d.getFullYear()}. ${String(mm).padStart(2, "0")}. ${String(
      dd
    ).padStart(2, "0")} (${dayName})`,
  };
}

export default function MatchesTabView({
  onSelectPlayerTrade,
}: MatchesTabViewProps) {
  const {
    matches: storeMockMatches,
    players,
    holdings,
    expandedMatchIds,
    toggleExpandMatch,
  } = useTradeStore();

  const todayStr = useState(() => toDateStr(new Date()))[0];
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Calendar popover state
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState<Date>(() =>
    parseDateStr(todayStr)
  );
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const [apiMatches, setApiMatches] = useState<Match[]>([]);
  const [dataSource, setDataSource] = useState<string>("LOADING");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pitchViewMatch, setPitchViewMatch] = useState<Match | null>(null);

  // Close calendar popover when clicking outside
  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCalendarOpen]);

  const fetchMatchesByDate = async (dateStr: string) => {
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch(
        `/api/matches?date=${encodeURIComponent(dateStr)}`
      );
      const data = await res.json();

      setDataSource(data.source || "UNKNOWN");

      if (data.source === "FOOTBALL_DATA_API") {
        setApiMatches(Array.isArray(data.matches) ? data.matches : []);
        setStatusMessage(null);
      } else {
        // Fallback when API key is empty or error occurs
        const diffDays = Math.round(
          (parseDateStr(dateStr).getTime() - parseDateStr(todayStr).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const targetKey =
          diffDays === -1
            ? "YESTERDAY"
            : diffDays === 0
            ? "TODAY"
            : diffDays === 1
            ? "TOMORROW"
            : "WEEKEND";

        const filteredMock = storeMockMatches.filter(
          (m) => m.dateKey === targetKey
        );
        setApiMatches(
          filteredMock.length > 0 ? filteredMock : storeMockMatches
        );
        setStatusMessage(data.message || null);
      }
    } catch {
      setDataSource("CLIENT_FALLBACK");
      setApiMatches(storeMockMatches);
      setStatusMessage(
        "네트워크 연결 상태를 확인해주세요. 데모 경기를 표시합니다."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchesByDate(selectedDateStr);
    // Sync calendar view month with selected date
    setCalendarViewMonth(parseDateStr(selectedDateStr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateStr]);

  // Group fetched matches by leagueId
  const leagueGroups = apiMatches.reduce<
    Record<
      string,
      {
        leagueId: string;
        leagueName: string;
        leagueCountry: string;
        leagueEmblem?: string;
        items: Match[];
      }
    >
  >((acc, match) => {
    if (!acc[match.leagueId]) {
      acc[match.leagueId] = {
        leagueId: match.leagueId,
        leagueName: match.leagueName,
        leagueCountry: match.leagueCountry,
        leagueEmblem: match.leagueEmblem,
        items: [],
      };
    }
    acc[match.leagueId].items.push(match);
    return acc;
  }, {});

  // Deterministically assign mock players to any real API match so live stock trading always works
  const getPlayersForMatch = (match: Match, matchIdx: number): Player[] => {
    const direct = players.filter((p) => p.matchId === match.id);
    if (direct.length > 0) return direct;

    const byTeam = players.filter(
      (p) =>
        p.teamId === match.homeTeam.id ||
        p.teamId === match.awayTeam.id ||
        p.teamShort === match.homeTeam.shortName ||
        p.teamShort === match.awayTeam.shortName
    );
    if (byTeam.length >= 6) return byTeam;

    const start = (matchIdx * 3) % Math.max(1, players.length - 6);
    return players.slice(start, start + 6);
  };

  // Calendar grid helper
  const renderMiniCalendar = () => {
    const year = calendarViewMonth.getFullYear();
    const month = calendarViewMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    return (
      <div className="absolute left-1/2 top-full z-40 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-xl animate-fadeIn">
        {/* Month Header */}
        <div className="mb-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setCalendarViewMonth(new Date(year, month - 1, 1))
            }
            className=" flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-xs font-extrabold text-gray-900">
            {year}년 {month + 1}월
          </span>
          <button
            type="button"
            onClick={() =>
              setCalendarViewMonth(new Date(year, month + 1, 1))
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day of Week Row */}
        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 mb-1">
          {WEEKDAYS_KO.map((w, i) => (
            <span
              key={w}
              className={
                i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : ""
              }
            >
              {w}
            </span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="h-8" />;
            }
            const cellDateStr = `${year}-${String(month + 1).padStart(
              2,
              "0"
            )}-${String(day).padStart(2, "0")}`;
            const isSelected = cellDateStr === selectedDateStr;
            const isToday = cellDateStr === todayStr;

            return (
              <button
                key={cellDateStr}
                type="button"
                onClick={() => {
                  setSelectedDateStr(cellDateStr);
                  setIsCalendarOpen(false);
                }}
                className={`relative flex h-8 w-full items-center justify-center rounded-xl font-mono text-xs transition ${
                  isSelected
                    ? "bg-[#00985f] font-extrabold text-white shadow-sm"
                    : isToday
                    ? "border border-[#00985f] bg-emerald-50/70 font-bold text-[#00985f]"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Footer Quick Buttons inside Calendar */}
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setSelectedDateStr(todayStr);
              setIsCalendarOpen(false);
            }}
            className="font-bold text-[#00985f] hover:underline"
          >
            오늘로 이동
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedDateStr(getNearestSaturdayStr(selectedDateStr));
              setIsCalendarOpen(false);
            }}
            className="font-semibold text-gray-500 hover:text-gray-900"
          >
            이번 주말 보기
          </button>
        </div>
      </div>
    );
  };

  const { badge, mainText } = formatKoreanDateLabel(selectedDateStr, todayStr);

  return (
    <div className="pb-6">
      {/* FotMob-Style Date Navigation Bar: Left Arrow (<) | Center Date + Calendar Popover | Right Arrow (>) */}
      <div
        ref={calendarRef}
        className="sticky top-[132px] z-20 border-b border-gray-200/80 bg-white/95 px-4 py-2.5 backdrop-blur-md"
      >
        <div className="relative flex items-center justify-between gap-2">
          {/* Left: Previous Day Arrow Button */}
          <button
            type="button"
            onClick={() => setSelectedDateStr((prev) => shiftDateStr(prev, -1))}
            title="이전 날짜 (어제)"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200/80 bg-[#f8f9fa] text-gray-700 transition hover:bg-gray-200/70 active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Center: Clickable Date Display that toggles the Mini Calendar */}
          <button
            type="button"
            onClick={() => setIsCalendarOpen((open) => !open)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200/90 bg-[#f8f9fa] px-3.5 py-2 text-xs font-bold text-gray-900 transition hover:border-[#00985f]/50 hover:bg-white active:scale-[0.99]"
          >
            <CalendarIcon className="h-3.5 w-3.5 text-[#00985f]" />
            {badge && (
              <span className="rounded-md bg-[#00985f] px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                {badge}
              </span>
            )}
            <span className="font-mono text-[13px] tracking-tight text-gray-900">
              {mainText}
            </span>
          </button>

          {/* Right: Next Day Arrow Button + Refresh Button */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setSelectedDateStr((prev) => shiftDateStr(prev, 1))
              }
              title="다음 날짜 (내일)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200/80 bg-[#f8f9fa] text-gray-700 transition hover:bg-gray-200/70 active:scale-95"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => fetchMatchesByDate(selectedDateStr)}
              title="경기 일정 새로고침"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200 active:scale-95"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {/* Popover Mini Calendar */}
          {isCalendarOpen && renderMiniCalendar()}
        </div>
      </div>

      {/* API Data Source / Guide Banner */}
      <div className="mx-4 mt-3.5 space-y-2">
        <div className="flex items-center justify-between rounded-xl bg-emerald-50/90 border border-emerald-200/70 px-3.5 py-2 text-xs text-emerald-900">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#00985f] shrink-0" />
            <span>
              경기를 눌러 출전 선수의 <strong>실시간 시세</strong>를 확인하고 거래해보세요!
            </span>
          </div>
          <span className="shrink-0 rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#00985f] border border-emerald-200">
            {dataSource === "FOOTBALL_DATA_API" ? "LIVE API" : "DEMO MODE"}
          </span>
        </div>

        {statusMessage && (
          <div className="flex items-start gap-1.5 rounded-xl bg-gray-100 border border-gray-200/80 px-3 py-2 text-[11px] text-gray-600">
            <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Loading Skeleton or Empty State or League Grouped Match Cards */}
      {isLoading ? (
        <div className="mt-4 space-y-3 px-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-2xl border border-gray-200/80 bg-white p-4"
            >
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="mt-4 flex items-center justify-between">
                <div className="h-5 w-28 rounded bg-gray-200" />
                <div className="h-6 w-14 rounded-lg bg-gray-200" />
                <div className="h-5 w-28 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : apiMatches.length === 0 ? (
        <div className="mx-4 mt-4 rounded-2xl border border-gray-200 bg-white py-12 px-5 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <CalendarIcon className="h-6 w-6" />
          </div>
          <p className="text-sm font-extrabold text-gray-800 leading-relaxed">
            선택한 날짜에 예정된 주요 리그 경기가 없습니다.
            <br />
            다른 날짜나 주말을 선택해주세요.
          </p>
          <p className="mt-1.5 text-xs text-gray-400">
            조회 기준일: <span className="font-mono">{selectedDateStr}</span> (PL, PD, BL1, SA, FL1, CL)
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedDateStr((prev) => shiftDateStr(prev, -1))
              }
              className="rounded-xl border border-gray-200 bg-[#f8f9fa] px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
            >
              ← 이전 날 보기
            </button>
            <button
              type="button"
              onClick={() =>
                setSelectedDateStr(getNearestSaturdayStr(selectedDateStr))
              }
              className="rounded-xl bg-[#00985f] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#007f4f]"
            >
              다가오는 주말 경기 보기
            </button>
            <button
              type="button"
              onClick={() => setIsCalendarOpen(true)}
              className="rounded-xl border border-gray-200 bg-[#f8f9fa] px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
            >
              달력에서 날짜 선택
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-5 px-4">
          {Object.values(leagueGroups).map((group) => (
            <section key={group.leagueId} className="space-y-2.5">
              {/* League Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  {group.leagueEmblem ? (
                    <img
                      src={group.leagueEmblem}
                      alt={group.leagueName}
                      className="h-6 w-6 rounded-lg bg-white border border-gray-200 p-0.5 object-contain shadow-sm"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-sm text-[#00985f]">
                      <Trophy className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div>
                    <span className="text-[11px] font-semibold text-gray-400 mr-1.5">
                      {group.leagueCountry}
                    </span>
                    <h2 className="inline text-sm font-extrabold text-gray-900">
                      {group.leagueName}
                    </h2>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-gray-400">
                  {group.items.length}경기
                </span>
              </div>

              {/* Match Cards in League */}
              <div className="space-y-2.5">
                {group.items.map((match) => (
                  <MatchAccordionCard
                    key={match.id}
                    match={match}
                    players={players}
                    holdings={holdings}
                    isExpanded={expandedMatchIds.includes(match.id)}
                    onToggleExpand={() => toggleExpandMatch(match.id)}
                    onSelectPlayerTrade={onSelectPlayerTrade}
                    onOpenPitchView={(m) => setPitchViewMatch(m)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Stage 2: Full Formation Pitch View Modal */}
      <FormationPitchModal
        match={pitchViewMatch}
        players={players}
        holdings={holdings}
        onClose={() => setPitchViewMatch(null)}
        onSelectPlayerTrade={onSelectPlayerTrade}
      />
    </div>
  );
}
