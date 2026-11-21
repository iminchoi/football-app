"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
} from "recharts";
import { Maximize2 } from "lucide-react";
import {
  useTradeStore,
  roundToTen,
  clampToPriceLimit,
  doesPlayerBelongToMatch,
} from "@/store/useTradeStore";
import {
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
  derivePlayerMarketData,
  extractInitialMatchEvents,
  resolveLastMatchReview,
} from "@/lib/priceEngine";
import {
  resolveMatchClock,
  resolveMatchForPlayerView,
  resolveMatchScore,
} from "@/lib/matchSync";
import { formatPlayerDisplayName } from "@/lib/playerDisplayName";
import MatchEventTimeline from "@/components/MatchEventTimeline";
import {
  ChartEventMarker,
  ChartEventType,
  Match,
  Player,
  PricePoint,
} from "@/types";

export type ChartViewMode = "MATCH_TIMELINE" | "OVERALL_MARKET";
export type OverallPeriod = "1M" | "1D" | "1W" | "1M_MONTH";

interface MatchTimelineChartProps {
  player: Player;
  /** Optional footer action (e.g. "즉시 주문" button) */
  footerAction?: React.ReactNode;
  /** Callback to open the dedicated FullScreenCandleChartModal */
  onOpenFullScreenCandle?: () => void;
}

interface OverallPoint {
  timeLabel: string;
  price: number;
  changePct: number;
}

const OVERALL_PERIOD_TABS: {
  key: OverallPeriod;
  label: string;
  desc: string;
}[] = [
  { key: "1M", label: "1분", desc: "최근 20분 분봉 추이" },
  { key: "1D", label: "일", desc: "최근 14일 일별 종가 추이" },
  { key: "1W", label: "주", desc: "최근 12주 주간 시세 흐름" },
  { key: "1M_MONTH", label: "월", desc: "최근 6개월 시즌 월간 추이" },
];

export const EVENT_PIN_CONFIG: Record<
  ChartEventType,
  {
    icon: string;
    shortTitle: string;
    fill: string;
    stroke: string;
    ring: string;
    chipBg: string;
    chipText: string;
    chipBorder: string;
  }
> = {
  GOAL: {
    icon: "⚽",
    shortTitle: "득점",
    fill: "#00A878",
    stroke: "#fbbf24",
    ring: "rgba(0, 168, 120, 0.28)",
    chipBg: "bg-[#00A878]/10",
    chipText: "text-[#00A878]",
    chipBorder: "border-[#00A878]/30",
  },
  ASSIST: {
    icon: "🅰️",
    shortTitle: "도움",
    fill: "#0284c7",
    stroke: "#bae6fd",
    ring: "rgba(2, 132, 199, 0.25)",
    chipBg: "bg-sky-50",
    chipText: "text-sky-700",
    chipBorder: "border-sky-300",
  },
  YELLOW_CARD: {
    icon: "🟨",
    shortTitle: "경고",
    fill: "#d97706",
    stroke: "#fde68a",
    ring: "rgba(245, 158, 11, 0.25)",
    chipBg: "bg-amber-50",
    chipText: "text-amber-800",
    chipBorder: "border-amber-300",
  },
  RED_CARD: {
    icon: "🟥",
    shortTitle: "퇴장",
    fill: "#F07868",
    stroke: "#fecdd3",
    ring: "rgba(240, 120, 104, 0.28)",
    chipBg: "bg-[#F07868]/10",
    chipText: "text-[#F07868]",
    chipBorder: "border-[#F07868]/30",
  },
  SAVE: {
    icon: "🧤",
    shortTitle: "선방",
    fill: "#7c3aed",
    stroke: "#ddd6fe",
    ring: "rgba(124, 58, 237, 0.25)",
    chipBg: "bg-violet-50",
    chipText: "text-violet-700",
    chipBorder: "border-violet-300",
  },
  SUB_OUT: {
    icon: "🔄",
    shortTitle: "교체 아웃",
    fill: "#A8B2BC",
    stroke: "#cbd5e1",
    ring: "rgba(168, 178, 188, 0.22)",
    chipBg: "bg-slate-100",
    chipText: "text-slate-700",
    chipBorder: "border-slate-300",
  },
  SUB_IN: {
    icon: "🔄",
    shortTitle: "교체 투입",
    fill: "#00A878",
    stroke: "#a7f3d0",
    ring: "rgba(0, 168, 120, 0.22)",
    chipBg: "bg-emerald-50",
    chipText: "text-emerald-700",
    chipBorder: "border-emerald-300",
  },
  SUB: {
    icon: "🔄",
    shortTitle: "교체",
    fill: "#A8B2BC",
    stroke: "#cbd5e1",
    ring: "rgba(168, 178, 188, 0.22)",
    chipBg: "bg-slate-100",
    chipText: "text-slate-700",
    chipBorder: "border-slate-300",
  },
  CONCEDED: {
    icon: "🥅",
    shortTitle: "실점",
    fill: "#F07868",
    stroke: "#fecdd3",
    ring: "rgba(240, 120, 104, 0.28)",
    chipBg: "bg-[#F07868]/10",
    chipText: "text-[#F07868]",
    chipBorder: "border-[#F07868]/30",
  },
  DEFENSIVE_ACTION: {
    icon: "🛡️",
    shortTitle: "수비",
    fill: "#0f766e",
    stroke: "#99f6e4",
    ring: "rgba(15, 118, 110, 0.25)",
    chipBg: "bg-teal-50",
    chipText: "text-teal-700",
    chipBorder: "border-teal-300",
  },
  KEY_PLAY: {
    icon: "🎯",
    shortTitle: "기회 창출",
    fill: "#0284c7",
    stroke: "#bae6fd",
    ring: "rgba(2, 132, 199, 0.25)",
    chipBg: "bg-sky-50",
    chipText: "text-sky-700",
    chipBorder: "border-sky-300",
  },
  BIG_CHANCE_MISS: {
    icon: "😣",
    shortTitle: "찬스 미스",
    fill: "#d97706",
    stroke: "#fde68a",
    ring: "rgba(245, 158, 11, 0.25)",
    chipBg: "bg-amber-50",
    chipText: "text-amber-800",
    chipBorder: "border-amber-300",
  },
};

function seededNoise(seedStr: string, index: number): number {
  let h = 2166136261;
  const str = `${seedStr}-${index}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function buildOverallSeries(
  player: Player,
  period: OverallPeriod
): OverallPoint[] {
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const currentPrice = roundToTen(player.currentPrice);

  if (period === "1M") {
    const count = 16;
    const points: OverallPoint[] = [];
    const now = new Date();
    let cursor = basePrice;
    for (let i = 0; i < count; i++) {
      const t = new Date(now.getTime() - (count - 1 - i) * 2 * 60 * 1000);
      const label = `${String(t.getHours()).padStart(2, "0")}:${String(
        t.getMinutes()
      ).padStart(2, "0")}`;
      if (i === count - 1) {
        points.push({
          timeLabel: label,
          price: currentPrice,
          changePct: Number(
            (((currentPrice - basePrice) / basePrice) * 100).toFixed(2)
          ),
        });
      } else {
        const n = seededNoise(`${player.id}-1M`, i);
        const drift =
          ((currentPrice - basePrice) / count) * (0.65 + n * 0.7);
        const wave = (n - 0.48) * basePrice * 0.028;
        cursor = clampToPriceLimit(cursor + drift + wave, basePrice);
        points.push({
          timeLabel: label,
          price: cursor,
          changePct: Number(
            (((cursor - basePrice) / basePrice) * 100).toFixed(2)
          ),
        });
      }
    }
    return points;
  }

  if (period === "1D") {
    const count = 14;
    const points: OverallPoint[] = [];
    const now = new Date();
    let cursor = clampToPriceLimit(
      basePrice * (0.94 + seededNoise(player.id, 101) * 0.08),
      basePrice
    );
    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (count - 1 - i));
      const label = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(
        d.getDate()
      ).padStart(2, "0")}`;
      if (i === count - 1) {
        points.push({
          timeLabel: label,
          price: currentPrice,
          changePct: Number(
            (((currentPrice - basePrice) / basePrice) * 100).toFixed(2)
          ),
        });
      } else {
        const n = seededNoise(`${player.id}-1D`, i);
        const step = (n - 0.47) * basePrice * 0.045;
        cursor = clampToPriceLimit(cursor + step, basePrice);
        points.push({
          timeLabel: label,
          price: cursor,
          changePct: Number(
            (((cursor - basePrice) / basePrice) * 100).toFixed(2)
          ),
        });
      }
    }
    return points;
  }

  if (period === "1W") {
    const count = 12;
    const points: OverallPoint[] = [];
    const now = new Date();
    let cursor = clampToPriceLimit(
      basePrice * (0.9 + seededNoise(player.id, 202) * 0.12),
      basePrice
    );
    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (count - 1 - i) * 7);
      const label = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(
        d.getDate()
      ).padStart(2, "0")}`;
      if (i === count - 1) {
        points.push({
          timeLabel: label,
          price: currentPrice,
          changePct: Number(
            (((currentPrice - basePrice) / basePrice) * 100).toFixed(2)
          ),
        });
      } else {
        const n = seededNoise(`${player.id}-1W`, i);
        const step = (n - 0.46) * basePrice * 0.06;
        cursor = clampToPriceLimit(cursor + step, basePrice);
        points.push({
          timeLabel: label,
          price: cursor,
          changePct: Number(
            (((cursor - basePrice) / basePrice) * 100).toFixed(2)
          ),
        });
      }
    }
    return points;
  }

  const months = ["11월", "12월", "1월", "2월", "3월", "4월"];
  let cursor = clampToPriceLimit(
    basePrice * (0.88 + seededNoise(player.id, 303) * 0.14),
    basePrice
  );
  return months.map((mLabel, idx) => {
    if (idx === months.length - 1) {
      return {
        timeLabel: mLabel,
        price: currentPrice,
        changePct: Number(
          (((currentPrice - basePrice) / basePrice) * 100).toFixed(2)
        ),
      };
    }
    const n = seededNoise(`${player.id}-MONTH`, idx);
    cursor = clampToPriceLimit(
      cursor + (n - 0.45) * basePrice * 0.075,
      basePrice
    );
    return {
      timeLabel: mLabel,
      price: cursor,
      changePct: Number(
        (((cursor - basePrice) / basePrice) * 100).toFixed(2)
      ),
    };
  });
}

function formatXAxisTick(min: number): string {
  if (min === 0) return "0'(킥오프)";
  if (min === 45) return "45'(HT)";
  if (min === 90) return "90'(FT)";
  if (min > 90) return `90+${min - 90}'`;
  return `${min}'`;
}

export default function MatchTimelineChart({
  player,
  footerAction,
  onOpenFullScreenCandle,
}: MatchTimelineChartProps) {
  const matches = useTradeStore((s) => s.matches);
  const activeMatchContext = useTradeStore((s) => s.activeMatchContext);

  const [viewMode, setViewMode] = useState<ChartViewMode>("MATCH_TIMELINE");
  const [preMatchMode, setPreMatchMode] = useState<"PRE" | "LAST_FT">("PRE");
  const [overallPeriod, setOverallPeriod] = useState<OverallPeriod>("1D");
  const [selectedEventMinute, setSelectedEventMinute] = useState<number | null>(
    null
  );

  useEffect(() => {
    setPreMatchMode("PRE");
    setSelectedEventMinute(null);
  }, [player.id]);

  // Resolve canonical live match from storeMatches + activeMatchContext (single source of truth)
  const playerMatch: Match | undefined = useMemo(
    () =>
      resolveMatchForPlayerView({
        player,
        storeMatches: matches,
        activeMatchContext,
        belongsToMatch: doesPlayerBelongToMatch,
      }),
    [activeMatchContext, matches, player]
  );

  const matchClock = useMemo(
    () => resolveMatchClock(playerMatch, activeMatchContext),
    [playerMatch, activeMatchContext]
  );

  const matchScore = useMemo(
    () => resolveMatchScore(playerMatch, activeMatchContext),
    [playerMatch, activeMatchContext]
  );

  const matchStatus: "LIVE" | "FT" | "UPCOMING" = matchClock.status;

  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const rawOpenPrice =
    matchStatus === "UPCOMING"
      ? basePrice
      : roundToTen(player.openPrice ?? player.priceHistory[0]?.price ?? basePrice);

  // Derive SSOT timeline & metrics from player.events and openPrice (forced empty on PRE)
  const ssotData = useMemo(() => {
    const events =
      matchStatus === "UPCOMING"
        ? []
        : extractInitialMatchEvents(
            {
              ...player,
              openPrice: rawOpenPrice,
              basePrice,
            },
            matchStatus
          );
    const endMin =
      matchClock.isFinished
        ? matchClock.minute
        : matchClock.isUpcoming
        ? 0
        : matchClock.minute;
    return derivePlayerMarketData({
      playerId: player.id,
      openPrice: rawOpenPrice,
      basePrice,
      events,
      currentMinute: endMin,
      matchStatus,
    });
  }, [
    player,
    rawOpenPrice,
    basePrice,
    matchStatus,
    matchClock.isFinished,
    matchClock.isUpcoming,
    matchClock.minute,
  ]);

  const lastMatchReview = useMemo(() => {
    if (matchStatus !== "UPCOMING") return null;
    return resolveLastMatchReview(player, matches);
  }, [matchStatus, player, matches]);

  const isViewingLastMatch = matchStatus === "UPCOMING" && preMatchMode === "LAST_FT" && Boolean(lastMatchReview);

  const hasSimulatedEvents = useMemo(() => {
    if (playerMatch?.providerMode === "SIMULATED_EVENTS") return true;
    if ((player.events ?? []).some((e) => e.source === "SIMULATED")) return true;
    if ((playerMatch?.events ?? []).some((e) => e.source === "SIMULATED")) {
      return true;
    }
    return ssotData.events.some((e) => e.source === "SIMULATED");
  }, [player.events, playerMatch?.events, playerMatch?.providerMode, ssotData.events]);

  const openPrice = isViewingLastMatch && lastMatchReview
    ? lastMatchReview.openPrice
    : player.openPrice ?? ssotData.openPrice;
  const closePrice = isViewingLastMatch && lastMatchReview
    ? lastMatchReview.marketData.currentPrice
    : matchStatus === "UPCOMING"
    ? openPrice
    : matchStatus === "FT"
    ? roundToTen(player.closePrice ?? player.currentPrice ?? ssotData.currentPrice)
    : roundToTen(player.currentPrice ?? ssotData.currentPrice);
  const highPrice = isViewingLastMatch && lastMatchReview
    ? lastMatchReview.marketData.highPrice
    : matchStatus === "UPCOMING"
    ? openPrice
    : player.highPrice ?? ssotData.highPrice;
  const lowPrice = isViewingLastMatch && lastMatchReview
    ? lastMatchReview.marketData.lowPrice
    : matchStatus === "UPCOMING"
    ? openPrice
    : player.lowPrice ?? ssotData.lowPrice;
  const volume = isViewingLastMatch && lastMatchReview
    ? lastMatchReview.marketData.volume
    : matchStatus === "UPCOMING"
    ? 0
    : player.volume ?? ssotData.volume;
  const timelineData: PricePoint[] = isViewingLastMatch && lastMatchReview
    ? lastMatchReview.marketData.priceHistory
    : ssotData.priceHistory;
  const canonicalEvents = isViewingLastMatch && lastMatchReview
    ? lastMatchReview.events
    : matchStatus === "UPCOMING"
    ? []
    : player.events ?? ssotData.events;

  const eventPoints = useMemo(
    () =>
      timelineData.filter(
        (pt): pt is PricePoint & { event: ChartEventMarker } =>
          Boolean(pt.event)
      ),
    [timelineData]
  );

  const activeEventPoint = useMemo(() => {
    if (eventPoints.length === 0) return null;
    if (selectedEventMinute !== null) {
      const found = eventPoints.find((p) => p.minute === selectedEventMinute);
      if (found) return found;
    }
    return eventPoints[eventPoints.length - 1];
  }, [eventPoints, selectedEventMinute]);

  const diffFromOpen = calculateDiffFromOpen(closePrice, openPrice);
  const pctFromOpen = calculateChangePercentFromOpen(closePrice, openPrice);
  const isUpFromOpen = diffFromOpen > 0;
  const isDownFromOpen = diffFromOpen < 0;

  const yDomain: [number, number] = useMemo(() => {
    const spread = Math.max(highPrice - lowPrice, roundToTen(openPrice * 0.06), 300);
    const minVal = Math.max(
      roundToTen(basePrice * 0.68),
      roundToTen(lowPrice - spread * 0.32)
    );
    const maxVal = Math.min(
      roundToTen(basePrice * 1.32),
      roundToTen(highPrice + spread * 0.38)
    );
    return [minVal, Math.max(minVal + 200, maxVal)];
  }, [highPrice, lowPrice, openPrice, basePrice]);

  const maxTimelineMinute = useMemo(() => {
    const lastMin = timelineData[timelineData.length - 1]?.minute ?? 90;
    return Math.max(90, lastMin);
  }, [timelineData]);

  const overallSeries = useMemo(
    () => buildOverallSeries(player, overallPeriod),
    [player, overallPeriod]
  );

  const matchTabLabel = matchClock.chartLabel;
  const playerDisplayName = formatPlayerDisplayName(player, "full");

  // Standardized PitchTrade Palette: Up = #00A878, Down = #F07868, Flat = #A8B2BC
  const strokeColor = isUpFromOpen
    ? "#00A878"
    : isDownFromOpen
    ? "#F07868"
    : "#A8B2BC";
  const gradientId = `matchAreaGrad-${player.id}`;
  const overallGradientId = `overallAreaGrad-${player.id}`;

  return (
    <div className="rounded-2xl border border-gray-200/90 bg-[#f8f9fa] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* 1. Compact 1-Row Header: [당일 경기 | 전체 시세] + [↗ 확대] */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-gray-200/80 p-1">
          <button
            type="button"
            onClick={() => setViewMode("MATCH_TIMELINE")}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-extrabold transition ${
              viewMode === "MATCH_TIMELINE"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {matchClock.isLive && (
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                {!matchClock.isHalfTime && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F07868] opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    matchClock.isHalfTime ? "bg-amber-400" : "bg-[#F07868]"
                  }`}
                />
              </span>
            )}
            <span className="truncate">{matchTabLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("OVERALL_MARKET")}
            className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-extrabold transition ${
              viewMode === "OVERALL_MARKET"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span>전체 시세</span>
          </button>
        </div>

        {onOpenFullScreenCandle && (
          <button
            type="button"
            onClick={onOpenFullScreenCandle}
            title="캔들 차트 크게 보기"
            className="inline-flex h-[34px] shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 text-[11px] font-bold text-gray-700 transition hover:border-[#00A878]/50 hover:text-[#00A878] active:scale-95"
          >
            <Maximize2 className="h-3 w-3" />
            <span>확대</span>
          </button>
        )}
      </div>

      {/* 2. Slim 1-Line Match Subheader + Simulation Source Badge + Optional PRE/LAST_FT Toggle */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="truncate text-[11px] font-semibold text-gray-500">
            {isViewingLastMatch && lastMatchReview ? (
              <span className="text-slate-700">{lastMatchReview.matchLabel}</span>
            ) : playerMatch ? (
              <>
                <span>{playerMatch.leagueName}</span>
                <span className="mx-1 text-gray-300">·</span>
                <span className="font-mono font-bold text-gray-800 tabular-nums">
                  {playerMatch.homeTeam.shortName} {matchScore.display}{" "}
                  {playerMatch.awayTeam.shortName}
                </span>
              </>
            ) : activeMatchContext ? (
              <>
                <span>{activeMatchContext.competition}</span>
                <span className="mx-1 text-gray-300">·</span>
                <span className="font-mono font-bold text-gray-800 tabular-nums">
                  {activeMatchContext.homeTeam} {matchScore.display}{" "}
                  {activeMatchContext.awayTeam}
                </span>
              </>
            ) : (
              <span>{playerDisplayName} · 매치 타임라인 시세</span>
            )}
          </p>
          {hasSimulatedEvents && (
            <span className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
              시뮬레이션 이벤트 포함
            </span>
          )}
        </div>

        {matchStatus === "UPCOMING" && viewMode === "MATCH_TIMELINE" && (
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => {
                setPreMatchMode("PRE");
                setSelectedEventMinute(null);
              }}
              className={`rounded-md px-2 py-1 transition ${
                preMatchMode === "PRE"
                  ? "bg-[#E8F5EF] text-[#00A878]"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              오늘 경기 (PRE)
            </button>
            <button
              type="button"
              onClick={() => {
                setPreMatchMode("LAST_FT");
                setSelectedEventMinute(null);
              }}
              className={`rounded-md px-2 py-1 transition ${
                preMatchMode === "LAST_FT"
                  ? "bg-slate-900 text-white"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              지난 경기 (FT)
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Chart Area */}
      {viewMode === "MATCH_TIMELINE" ? (
        <>
          <div className="relative mt-2 h-64 w-full rounded-2xl bg-white border border-gray-100 pt-2.5 pr-2 pb-1 pl-1 shadow-inner">
            <div className="flex items-center gap-2.5 px-3 pb-1 text-[10px] font-semibold text-gray-400">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 border-t border-dashed border-[#00A878]" />
                {isViewingLastMatch ? "직전 종가" : "현재가"} ({closePrice.toLocaleString()}P)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-0.5 border-l border-dashed border-amber-500" />
                45&apos; HT
              </span>
            </div>

            {matchStatus === "UPCOMING" && !isViewingLastMatch ? (
              <div className="relative flex h-56 flex-col items-center justify-center px-4 text-center">
                <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed border-[#CBD5E1]" />
                <div className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#FFFFFF]/90 px-3.5 py-2 text-xs font-semibold text-[#0F172A] shadow-sm backdrop-blur-sm">
                  <span>⏱ KICK-OFF 대기 · 경기 시작 후 실시간 시세 및 이벤트 반영</span>
                </div>
                <p className="relative z-10 mt-2 font-sans tabular-nums text-[11px] font-medium text-[#64748B]">
                  기준 시가{" "}
                  <strong className="font-bold text-[#0F172A]">
                    {openPrice.toLocaleString()}P
                  </strong>{" "}
                  · 장전 주문 가능
                </p>
                <button
                  type="button"
                  onClick={() => setPreMatchMode("LAST_FT")}
                  className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#00A878]/30 bg-[#E8F5EF] px-3.5 py-1.5 text-xs font-bold text-[#00A878] transition hover:bg-[#00A878] hover:text-white active:scale-95"
                >
                  <span>📊 지난 경기 시세 차트 바로 보기 →</span>
                </button>
              </div>
            ) : (
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={timelineData}
                    margin={{ top: 22, right: 16, left: 0, bottom: 6 }}
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={strokeColor}
                          stopOpacity={0.34}
                        />
                        <stop
                          offset="65%"
                          stopColor={strokeColor}
                          stopOpacity={0.1}
                        />
                        <stop
                          offset="100%"
                          stopColor={strokeColor}
                          stopOpacity={0.0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f1f5f9"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="minute"
                      type="number"
                      domain={[0, maxTimelineMinute]}
                      ticks={[0, 15, 30, 45, 60, 75, 90]}
                      tickFormatter={formatXAxisTick}
                      tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />

                    <YAxis
                      domain={yDomain}
                      orientation="right"
                      width={52}
                      tickFormatter={(v: number) => `${v.toLocaleString()}`}
                      tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <ReferenceLine
                      x={45}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth={1.2}
                      label={{
                        value: "HT 45'",
                        position: "insideTop",
                        fill: "#d97706",
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    />

                    <ReferenceLine
                      y={openPrice}
                      stroke="#94a3b8"
                      strokeDasharray="4 3"
                      strokeWidth={1.1}
                      label={{
                        value: `시가 ${openPrice.toLocaleString()}P`,
                        position: "insideBottomLeft",
                        fill: "#64748b",
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    />

                    {/* Current Price Brand Green Dashed Reference Line */}
                    <ReferenceLine
                      y={closePrice}
                      stroke="#00A878"
                      strokeDasharray="5 3"
                      strokeWidth={1.3}
                    />

                    {activeEventPoint && (
                      <ReferenceLine
                        x={activeEventPoint.minute}
                        stroke={
                          EVENT_PIN_CONFIG[activeEventPoint.event.type]?.fill ??
                          "#00A878"
                        }
                        strokeDasharray="2 2"
                        strokeWidth={1.5}
                      />
                    )}

                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) {
                          return null;
                        }
                        const pt = payload[0].payload as PricePoint;
                        const diff = pt.price - openPrice;
                        const pct =
                          openPrice > 0
                            ? ((diff / openPrice) * 100).toFixed(2)
                            : "0.00";
                        const up = diff > 0;
                        const down = diff < 0;
                        const ev = pt.event;
                        const pinCfg = ev ? EVENT_PIN_CONFIG[ev.type] : null;

                        return (
                          <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-white shadow-xl backdrop-blur-xs">
                            <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-300">
                              <span>
                                ⏱️{" "}
                                {pt.minute === 0
                                  ? "0' (킥오프 시가)"
                                  : pt.minute === 45
                                  ? "45' (하프타임)"
                                  : pt.minute === 90
                                  ? "90' (정규시간 종료)"
                                  : `${pt.timeLabel ?? `${pt.minute}'`} 경과`}
                              </span>
                              <span
                                className={`font-mono font-extrabold ${
                                  up
                                    ? "text-[#00A878]"
                                    : down
                                    ? "text-[#F07868]"
                                    : "text-[#A8B2BC]"
                                }`}
                              >
                                시가대비 {up ? "+" : ""}
                                {pct}%
                              </span>
                            </div>
                            <div className="mt-0.5 font-mono text-sm font-black text-white">
                              {pt.price.toLocaleString()} P
                            </div>
                            {ev && pinCfg && (
                              <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-extrabold text-amber-300">
                                <span>{pinCfg.icon}</span>
                                <span>{ev.label}</span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={strokeColor}
                      strokeWidth={2.75}
                      fill={`url(#${gradientId})`}
                      isAnimationActive={false}
                      dot={(dotProps: {
                        cx?: number;
                        cy?: number;
                        index?: number;
                        payload?: PricePoint;
                      }) => {
                        const { cx, cy, index, payload } = dotProps;
                        if (
                          typeof cx !== "number" ||
                          typeof cy !== "number" ||
                          !payload
                        ) {
                          return <g key={`empty-${index}`} />;
                        }

                        const isLast = index === timelineData.length - 1;
                        const ev = payload.event;

                        if (ev) {
                          const cfg =
                            EVENT_PIN_CONFIG[ev.type] ?? EVENT_PIN_CONFIG.GOAL;
                          const isSelected =
                            activeEventPoint?.minute === payload.minute;

                          return (
                            <g
                              key={`ev-pin-${payload.minute}-${index}`}
                              className="cursor-pointer"
                              onClick={() =>
                                setSelectedEventMinute(payload.minute)
                              }
                            >
                              <circle
                                cx={cx}
                                cy={cy}
                                r={isSelected ? 15 : 12}
                                fill={cfg.ring}
                              />
                              <circle
                                cx={cx}
                                cy={cy}
                                r={isSelected ? 11 : 9.5}
                                fill={cfg.fill}
                                stroke={cfg.stroke}
                                strokeWidth={isSelected ? 2.5 : 2}
                              />
                              <text
                                x={cx}
                                y={cy + 3.5}
                                textAnchor="middle"
                                fontSize={isSelected ? 11 : 10}
                              >
                                {cfg.icon}
                              </text>
                              <rect
                                x={cx - 14}
                                y={Math.max(2, cy - 26)}
                                width={28}
                                height={13}
                                rx={4}
                                fill="#0f172a"
                                opacity={0.9}
                              />
                              <text
                                x={cx}
                                y={Math.max(11, cy - 17)}
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize={8.5}
                                fontWeight={800}
                                fontFamily="monospace"
                              >
                                {payload.minute > 90
                                  ? `90+${payload.minute - 90}'`
                                  : `${payload.minute}'`}
                              </text>
                            </g>
                          );
                        }

                        if (isLast) {
                          return (
                            <g key={`last-dot-${index}`}>
                              <circle
                                cx={cx}
                                cy={cy}
                                r={7}
                                fill={
                                  isUpFromOpen
                                    ? "rgba(0, 168, 120, 0.25)"
                                    : isDownFromOpen
                                    ? "rgba(240, 120, 104, 0.25)"
                                    : "rgba(168, 178, 188, 0.25)"
                                }
                              />
                              <circle
                                cx={cx}
                                cy={cy}
                                r={4}
                                fill={strokeColor}
                                stroke="#ffffff"
                                strokeWidth={2}
                              />
                            </g>
                          );
                        }

                        if (payload.minute === 0 || payload.minute === 45) {
                          return (
                            <circle
                              key={`anchor-dot-${index}`}
                              cx={cx}
                              cy={cy}
                              r={3}
                              fill="#ffffff"
                              stroke={strokeColor}
                              strokeWidth={1.75}
                            />
                          );
                        }

                        return <g key={`dot-${index}`} />;
                      }}
                      activeDot={{
                        r: 5,
                        fill: strokeColor,
                        stroke: "#ffffff",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 4. Shared SSOT Match Event Timeline Chips (Single Slim Row) */}
          <div className="mt-2">
            <MatchEventTimeline
              events={canonicalEvents}
              selectedMinute={activeEventPoint?.minute ?? null}
              onSelectEvent={(ev) => setSelectedEventMinute(ev.minute)}
              variant="CHIPS"
              title="경기 이벤트"
              subtitle=""
            />
          </div>
        </>
      ) : (
        /* Tab 2: [📈 전체 시세] (1분 / 일 / 주 / 월) */
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-1 rounded-xl bg-gray-200/75 p-1">
            {OVERALL_PERIOD_TABS.map((tab) => {
              const active = overallPeriod === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setOverallPeriod(tab.key)}
                  className={`flex-1 rounded-lg py-1 text-[11px] font-extrabold transition ${
                    active
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-gray-500">
            <span>
              {
                OVERALL_PERIOD_TABS.find((t) => t.key === overallPeriod)
                  ?.desc
              }
            </span>
            <span className="font-mono font-bold text-gray-700">
              기준가 {basePrice.toLocaleString()}P
            </span>
          </div>

          <div className="mt-1.5 h-60 w-full rounded-2xl bg-white border border-gray-100 pt-3 pr-2 pb-1 pl-1 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={overallSeries}
                margin={{ top: 12, right: 14, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient
                    id={overallGradientId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={strokeColor}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={strokeColor}
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f1f5f9"
                  vertical={false}
                />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  orientation="right"
                  width={52}
                  tickFormatter={(v: number) => `${v.toLocaleString()}`}
                  tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine
                  y={closePrice}
                  stroke="#00A878"
                  strokeDasharray="4 3"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0)
                      return null;
                    const pt = payload[0].payload as OverallPoint;
                    return (
                      <div className="rounded-xl bg-slate-900/95 px-3 py-1.5 text-xs text-white shadow-lg">
                        <div className="font-bold text-slate-300">
                          {pt.timeLabel}
                        </div>
                        <div className="font-mono font-black">
                          {pt.price.toLocaleString()} P ({pt.changePct >= 0 ? "+" : ""}
                          {pt.changePct}%)
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  fill={`url(#${overallGradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Optional Footer (Latest Event Feed + Quick Order Action) */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-gray-200/70 pt-2.5 text-xs">
        <span className="truncate text-gray-600 font-medium">
          {player.lastEvent.text}
        </span>
        {footerAction}
      </div>
    </div>
  );
}
