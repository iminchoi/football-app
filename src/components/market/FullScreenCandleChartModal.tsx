"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Star,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  useTradeStore,
  roundToTen,
  doesPlayerBelongToMatch,
} from "@/store/useTradeStore";
import {
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
  deriveCandlesFromEvents,
  derivePlayerMarketData,
  extractInitialMatchEvents,
  formatMinuteLabel,
} from "@/utils/priceEngine";
import {
  CandleData,
  CandleTimeframe,
  ChartEventType,
  Match,
  Player,
  TradeType,
} from "@/types";
import { EVENT_PIN_CONFIG } from "./MatchTimelineChart";

export type { CandleTimeframe };
export type OhlcCandle = CandleData;

interface FullScreenCandleChartModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectTrade?: (player: Player, type: TradeType) => void;
}

// Standardized PitchTrade Global Palette (Premium Dark Trading Terminal)
const COLOR_UP = "#00B386";
const COLOR_DOWN = "#F07868";
const COLOR_FLAT = "#64748B";

/**
 * Minimal custom SVG vector event badge rendered directly on the candlestick chart.
 */
function renderVectorEventBadge(type: ChartEventType, isSelected: boolean) {
  const scale = isSelected ? 1.15 : 1;
  switch (type) {
    case "GOAL":
      return (
        <g transform={`scale(${scale})`}>
          <circle
            cx={0}
            cy={0}
            r={8}
            fill="#111925"
            stroke="#00B386"
            strokeWidth={1.5}
          />
          {/* Minimal soccer ball */}
          <circle cx={0} cy={0} r={4.4} fill="#F8FAFC" />
          <polygon
            points="0,-2.2 2.1,-0.7 1.3,1.8 -1.3,1.8 -2.1,-0.7"
            fill="#090E16"
          />
          <line x1={0} y1={-2.2} x2={0} y2={-4.3} stroke="#090E16" strokeWidth={0.8} />
          <line x1={2.1} y1={-0.7} x2={4.1} y2={-1.3} stroke="#090E16" strokeWidth={0.8} />
          <line x1={-2.1} y1={-0.7} x2={-4.1} y2={-1.3} stroke="#090E16" strokeWidth={0.8} />
        </g>
      );
    case "ASSIST":
      return (
        <g transform={`scale(${scale})`}>
          <circle
            cx={0}
            cy={0}
            r={8.5}
            fill="#131A26"
            stroke="#38BDF8"
            strokeWidth={1.6}
          />
          <text
            x={0}
            y={3.2}
            textAnchor="middle"
            fill="#38BDF8"
            fontSize={9}
            fontWeight={700}
            className="font-sans"
          >
            A
          </text>
        </g>
      );
    case "YELLOW_CARD":
      return (
        <g transform={`scale(${scale})`}>
          <circle
            cx={0}
            cy={0}
            r={8.5}
            fill="#131A26"
            stroke="#FACC15"
            strokeWidth={1.4}
          />
          {/* Tilted yellow card */}
          <rect
            x={-3}
            y={-4.5}
            width={6}
            height={9}
            rx={1}
            fill="#FACC15"
            transform="rotate(-12)"
          />
        </g>
      );
    case "RED_CARD":
      return (
        <g transform={`scale(${scale})`}>
          <circle
            cx={0}
            cy={0}
            r={8.5}
            fill="#131A26"
            stroke="#F07868"
            strokeWidth={1.4}
          />
          {/* Tilted red card */}
          <rect
            x={-3}
            y={-4.5}
            width={6}
            height={9}
            rx={1}
            fill="#EF4444"
            transform="rotate(-12)"
          />
        </g>
      );
    case "SAVE":
      return (
        <g transform={`scale(${scale})`}>
          <circle
            cx={0}
            cy={0}
            r={8.5}
            fill="#131A26"
            stroke="#A78BFA"
            strokeWidth={1.6}
          />
          <path
            d="M0,-4.5 L3.8,-2.8 L3.2,1.5 C2.8,3.2 0,4.5 0,4.5 C0,4.5 -2.8,3.2 -3.2,1.5 L-3.8,-2.8 Z"
            fill="#A78BFA"
          />
        </g>
      );
    default:
      return (
        <g transform={`scale(${scale})`}>
          <circle
            cx={0}
            cy={0}
            r={8}
            fill="#131A26"
            stroke="#64748B"
            strokeWidth={1.5}
          />
          <circle cx={0} cy={0} r={3} fill="#94A3B8" />
        </g>
      );
  }
}

export default function FullScreenCandleChartModal({
  player: initialPlayer,
  isOpen,
  onClose,
  onSelectTrade,
}: FullScreenCandleChartModalProps) {
  const players = useTradeStore((s) => s.players);
  const matches = useTradeStore((s) => s.matches);
  const watchlist = useTradeStore((s) => s.watchlist);
  const toggleWatchlist = useTradeStore((s) => s.toggleWatchlist);

  // Always subscribe to live player from store so ticks update candles in real time
  const player = useMemo(
    () =>
      initialPlayer
        ? players.find((p) => p.id === initialPlayer.id) ?? initialPlayer
        : null,
    [players, initialPlayer]
  );

  const [timeframe, setTimeframe] = useState<CandleTimeframe>("3M");
  const [visibleCount, setVisibleCount] = useState<number>(24);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [selectedCandleIdx, setSelectedCandleIdx] = useState<number | null>(
    null
  );

  // Gesture state refs for Mouse Drag & Mobile Pinch-to-Zoom / Pan
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState<{ width: number; height: number }>({
    width: 420,
    height: 360,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartIdxRef = useRef<number>(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartCountRef = useRef<number>(18);
  const pinchCenterRatioRef = useRef<number>(0.5);

  const playerMatch: Match | undefined = useMemo(() => {
    if (!player) return undefined;
    const direct = matches.find((m) => m.id === player.matchId);
    if (direct && (direct.status === "LIVE" || direct.rawStatus === "IN_PLAY")) {
      return direct;
    }
    const liveMatch = matches.find(
      (m) =>
        (m.status === "LIVE" || m.rawStatus === "IN_PLAY") &&
        doesPlayerBelongToMatch(player, m)
    );
    if (liveMatch) return liveMatch;
    return direct ?? matches.find((m) => doesPlayerBelongToMatch(player, m));
  }, [matches, player]);

  const matchStatus: "LIVE" | "FT" | "UPCOMING" = useMemo(() => {
    if (!playerMatch) return "LIVE";
    if (
      playerMatch.status === "LIVE" ||
      playerMatch.rawStatus === "IN_PLAY"
    ) {
      return "LIVE";
    }
    if (
      playerMatch.status === "FT" ||
      playerMatch.rawStatus === "FINISHED"
    ) {
      return "FT";
    }
    return "UPCOMING";
  }, [playerMatch]);

  const ssotMetrics = useMemo(() => {
    if (!player) return null;
    const base = roundToTen(
      player.basePrice ?? player.initialPrice ?? player.currentPrice
    );
    const open = roundToTen(
      player.openPrice ?? player.priceHistory[0]?.price ?? base
    );
    const events = extractInitialMatchEvents({
      ...player,
      openPrice: open,
      basePrice: base,
    });
    const curMin =
      matchStatus === "FT"
        ? 90
        : matchStatus === "UPCOMING"
        ? 0
        : playerMatch?.minute ?? player.lastEvent?.minute ?? 65;

    return derivePlayerMarketData({
      playerId: player.id,
      openPrice: open,
      basePrice: base,
      events,
      currentMinute: curMin,
      matchStatus,
    });
  }, [player, matchStatus, playerMatch?.minute]);

  const candles = useMemo(() => {
    if (!player || !ssotMetrics) return [];
    const base = roundToTen(
      player.basePrice ?? player.initialPrice ?? player.currentPrice
    );
    return deriveCandlesFromEvents({
      playerId: player.id,
      openPrice: ssotMetrics.openPrice,
      basePrice: base,
      events: ssotMetrics.events,
      timeframe,
      matchStatus,
      currentMinute: playerMatch?.minute ?? player.lastEvent?.minute ?? 65,
    });
  }, [player, ssotMetrics, timeframe, matchStatus, playerMatch?.minute]);

  // Measure actual chart container size with ResizeObserver so SVG fills 100% height dynamically
  useEffect(() => {
    if (!isOpen) return;
    const el = chartContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setChartSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  // Reset viewport to show the latest candles when timeframe or player changes
  useEffect(() => {
    if (!isOpen || candles.length === 0) return;
    const defaultVis = Math.min(candles.length, 24);
    setVisibleCount(defaultVis);
    setStartIndex(Math.max(0, candles.length - defaultVis));
    setSelectedCandleIdx(candles.length - 1);
  }, [isOpen, player?.id, timeframe, candles.length]);

  if (!isOpen || !player || !ssotMetrics) return null;

  const isWatched = watchlist.includes(player.id);
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const openPrice = player.openPrice ?? ssotMetrics.openPrice;
  const currentPrice = roundToTen(player.currentPrice ?? ssotMetrics.currentPrice);
  const closePrice =
    matchStatus === "FT"
      ? roundToTen(player.closePrice ?? currentPrice)
      : currentPrice;

  const diffFromOpen = calculateDiffFromOpen(closePrice, openPrice);
  const pctFromOpen = calculateChangePercentFromOpen(closePrice, openPrice);
  const isUpOverall = diffFromOpen > 0;
  const isDownOverall = diffFromOpen < 0;

  // Clamp viewport slice
  const minVis = Math.min(6, candles.length);
  const maxVis = Math.max(minVis, candles.length);
  const safeVisCount = Math.max(minVis, Math.min(maxVis, visibleCount));
  const safeStartIdx = Math.max(
    0,
    Math.min(Math.max(0, candles.length - safeVisCount), startIndex)
  );
  const visibleCandles = candles.slice(
    safeStartIdx,
    safeStartIdx + safeVisCount
  );

  // Zoom helper centered at a ratio (0.0 = left edge, 1.0 = right edge)
  const applyZoom = (nextCountRaw: number, anchorRatio = 0.7) => {
    const nextCount = Math.max(minVis, Math.min(maxVis, Math.round(nextCountRaw)));
    if (nextCount === safeVisCount) return;
    const anchorCandleIndex = safeStartIdx + safeVisCount * anchorRatio;
    const nextStart = Math.round(anchorCandleIndex - nextCount * anchorRatio);
    const clampedStart = Math.max(
      0,
      Math.min(Math.max(0, candles.length - nextCount), nextStart)
    );
    setVisibleCount(nextCount);
    setStartIndex(clampedStart);
  };

  // Pan helper by candle delta
  const applyPan = (deltaCandles: number) => {
    const nextStart = Math.max(
      0,
      Math.min(
        Math.max(0, candles.length - safeVisCount),
        safeStartIdx + deltaCandles
      )
    );
    setStartIndex(nextStart);
  };

  // Mouse Wheel Zoom (Desktop)
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0.1,
      Math.min(0.9, (e.clientX - rect.left) / Math.max(1, rect.width))
    );
    const zoomStep = Math.max(2, Math.round(safeVisCount * 0.18));
    if (e.deltaY < 0) {
      applyZoom(safeVisCount - zoomStep, ratio);
    } else {
      applyZoom(safeVisCount + zoomStep, ratio);
    }
  };

  // Mouse Drag Pan (Desktop)
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartIdxRef.current = safeStartIdx;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const plotWidth = Math.max(1, rect.width - 64);

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartXRef.current;
      const candlesPerPx = safeVisCount / plotWidth;
      const deltaIdx = Math.round(-dx * candlesPerPx);
      const nextStart = Math.max(
        0,
        Math.min(
          Math.max(0, candles.length - safeVisCount),
          dragStartIdxRef.current + deltaIdx
        )
      );
      setStartIndex(nextStart);
      return;
    }

    // Hover crosshair selection
    const relX = e.clientX - rect.left - 12;
    if (relX >= 0 && relX <= plotWidth && visibleCandles.length > 0) {
      const localIdx = Math.min(
        visibleCandles.length - 1,
        Math.max(0, Math.floor((relX / plotWidth) * visibleCandles.length))
      );
      setSelectedCandleIdx(visibleCandles[localIdx].index);
    }
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  // Touch Pinch-to-Zoom & 1-Finger Drag Pan (Mobile)
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.max(10, Math.hypot(dx, dy));
      pinchStartCountRef.current = safeVisCount;

      const rect = e.currentTarget.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchCenterRatioRef.current = Math.max(
        0.1,
        Math.min(0.9, (midX - rect.left) / Math.max(1, rect.width))
      );
      isDraggingRef.current = false;
    } else if (e.touches.length === 1) {
      pinchStartDistRef.current = null;
      isDraggingRef.current = true;
      dragStartXRef.current = e.touches[0].clientX;
      dragStartIdxRef.current = safeStartIdx;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.max(10, Math.hypot(dx, dy));
      const scale = pinchStartDistRef.current / dist; // pinch out (dist increases) -> smaller count (zoom in)
      applyZoom(
        pinchStartCountRef.current * scale,
        pinchCenterRatioRef.current
      );
      return;
    }

    if (e.touches.length === 1 && isDraggingRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const plotWidth = Math.max(1, rect.width - 64);
      const dx = e.touches[0].clientX - dragStartXRef.current;
      const candlesPerPx = safeVisCount / plotWidth;
      const deltaIdx = Math.round(-dx * candlesPerPx);
      const nextStart = Math.max(
        0,
        Math.min(
          Math.max(0, candles.length - safeVisCount),
          dragStartIdxRef.current + deltaIdx
        )
      );
      setStartIndex(nextStart);
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    pinchStartDistRef.current = null;
  };

  // Compute dynamic SVG geometry from measured container size (78% Price / 22% Volume)
  const svgW = Math.max(300, chartSize.width);
  const svgH = Math.max(220, chartSize.height);
  const padLeft = 8;
  const padRight = 56;
  const padTop = 18;
  const volGap = 10;
  const padBottom = 18;
  const activePlotH = Math.max(140, svgH - padTop - volGap - padBottom);
  const pricePlotH = Math.round(activePlotH * 0.78);
  const volTop = padTop + pricePlotH + volGap;
  const volPlotH = Math.max(36, activePlotH - pricePlotH);
  const plotW = svgW - padLeft - padRight;

  const visHigh =
    visibleCandles.length > 0
      ? Math.max(...visibleCandles.map((c) => c.high), closePrice, openPrice)
      : closePrice + 500;
  const visLow =
    visibleCandles.length > 0
      ? Math.min(...visibleCandles.map((c) => c.low), closePrice, openPrice)
      : closePrice - 500;
  const priceSpread = Math.max(visHigh - visLow, roundToTen(basePrice * 0.04), 200);
  const maxP = roundToTen(visHigh + priceSpread * 0.17);
  const minP = Math.max(100, roundToTen(visLow - priceSpread * 0.17));
  const rangeP = Math.max(100, maxP - minP);

  const maxVol =
    visibleCandles.length > 0
      ? Math.max(...visibleCandles.map((c) => c.volume), 100)
      : 500;

  const getPriceY = (p: number) =>
    padTop + pricePlotH - ((p - minP) / rangeP) * pricePlotH;

  const getVolH = (v: number) => Math.max(3, (v / maxVol) * volPlotH);

  const slotW = plotW / Math.max(1, visibleCandles.length);
  const bodyW = Math.max(3, Math.min(10, slotW * 0.62));

  const currentPriceY = Math.max(
    padTop,
    Math.min(padTop + pricePlotH, getPriceY(closePrice))
  );
  const openPriceY = Math.max(
    padTop,
    Math.min(padTop + pricePlotH, getPriceY(openPrice))
  );

  const activeCandle =
    (selectedCandleIdx !== null
      ? candles.find((c) => c.index === selectedCandleIdx)
      : undefined) ??
    visibleCandles[visibleCandles.length - 1] ??
    candles[candles.length - 1];

  const activeCandlePctFromOpen = activeCandle
    ? calculateChangePercentFromOpen(activeCandle.close, openPrice)
    : pctFromOpen;

  const allHigh = player.highPrice ?? ssotMetrics.highPrice;
  const allLow = player.lowPrice ?? ssotMetrics.lowPrice;
  const totalVol = player.volume ?? ssotMetrics.volume;
  const canonicalEvents = player.events ?? ssotMetrics.events;

  const currentPriceColor = isUpOverall
    ? COLOR_UP
    : isDownOverall
    ? COLOR_DOWN
    : COLOR_FLAT;

  const sortedEventsAsc = [...canonicalEvents].sort(
    (a, b) => a.minute - b.minute
  );

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#090E16] animate-fade-in">
      {/* Centered Mobile/Desktop Terminal Container */}
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col bg-[#090E16] text-slate-100 overflow-hidden">
        {/* 1. Top Bar: Player Identity + Watchlist + Close */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-3.5 pb-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{ backgroundColor: player.teamColor }}
              className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-white font-sans tabular-nums"
            >
              <span className="text-[8px] font-semibold opacity-85 leading-none">
                {player.teamShort}
              </span>
              <span className="text-xs font-bold mt-0.5">
                {player.backNumber}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-base font-bold tracking-tight text-white">
                  {player.name}
                </h2>
                <span className="rounded-md bg-[#182331] px-1.5 py-0.5 text-[10px] font-semibold text-[#8291A5]">
                  {player.position}
                </span>
                <span className="rounded-md bg-[#00B386]/15 px-1.5 py-0.5 font-sans tabular-nums text-[10px] font-semibold text-[#00B386]">
                  ★ {player.stats.rating.toFixed(1)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] font-medium text-[#8291A5]">
                {player.teamName} ·{" "}
                {matchStatus === "LIVE"
                  ? `LIVE ${playerMatch?.minute ?? 65}'`
                  : matchStatus === "FT"
                  ? "경기 종료"
                  : "경기 예정"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleWatchlist(player.id)}
              title={isWatched ? "관심선수 해제" : "관심선수 등록"}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90 ${
                isWatched
                  ? "bg-amber-400/15 text-amber-400"
                  : "bg-[#182331] text-[#8291A5] hover:text-white"
              }`}
            >
              <Star
                className={`h-4 w-4 ${isWatched ? "fill-amber-400" : ""}`}
              />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="풀스크린 차트 닫기"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#182331] text-[#8291A5] transition hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. Price Hero + Compact 2x2 Summary Metrics (Borderless Hierarchy) */}
        <div className="shrink-0 px-4 pt-1 pb-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2.5">
                <span
                  className={`font-sans tabular-nums text-[28px] font-extrabold leading-none tracking-tight ${
                    isUpOverall
                      ? "text-[#00B386]"
                      : isDownOverall
                      ? "text-[#F07868]"
                      : "text-white"
                  }`}
                >
                  {closePrice.toLocaleString()}
                  <span className="ml-1 text-base font-bold opacity-85">P</span>
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 font-sans tabular-nums text-xs font-bold ${
                    isUpOverall
                      ? "bg-[#00B386]/15 text-[#00B386]"
                      : isDownOverall
                      ? "bg-[#F07868]/15 text-[#F07868]"
                      : "bg-[#182331] text-[#8291A5]"
                  }`}
                >
                  {isUpOverall ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : isDownOverall ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : null}
                  {isUpOverall ? "+" : ""}
                  {pctFromOpen.toFixed(2)}%
                </span>
              </div>
              <p className="mt-1.5 font-sans tabular-nums text-xs font-medium text-[#8291A5]">
                시가 {openPrice.toLocaleString()}P 대비{" "}
                <span
                  className={
                    diffFromOpen > 0
                      ? "text-[#00B386]"
                      : diffFromOpen < 0
                      ? "text-[#F07868]"
                      : "text-slate-300"
                  }
                >
                  {diffFromOpen >= 0 ? "+" : ""}
                  {diffFromOpen.toLocaleString()}P
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right font-sans tabular-nums text-[11px]">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[#8291A5]">고가</span>
                <span className="font-semibold text-[#00B386]">
                  {allHigh.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[#8291A5]">시가</span>
                <span className="font-semibold text-slate-200">
                  {openPrice.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[#8291A5]">저가</span>
                <span className="font-semibold text-[#F07868]">
                  {allLow.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[#8291A5]">거래량</span>
                <span className="font-semibold text-slate-200">
                  {totalVol.toLocaleString()}주
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Minimal Segmented Timeframe Control + Uniform Zoom/Pan Bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#263343]/60 px-4 py-2">
          <div className="inline-flex rounded-lg bg-[#182331] p-0.5 text-[11px] font-semibold">
            {(
              [
                { key: "3M", label: "3분" },
                { key: "1M", label: "1분" },
                { key: "15M", label: "15분" },
                { key: "1D", label: "일봉" },
              ] as { key: CandleTimeframe; label: string }[]
            ).map((tf) => (
              <button
                key={tf.key}
                type="button"
                onClick={() => setTimeframe(tf.key)}
                className={`rounded-md px-2.5 py-1 transition ${
                  timeframe === tf.key
                    ? "bg-[#263343] text-white"
                    : "text-[#8291A5] hover:text-slate-200"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applyPan(-4)}
              disabled={safeStartIdx <= 0}
              title="이전 구간 이동"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#182331] text-slate-300 transition hover:bg-[#263343] disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyPan(4)}
              disabled={safeStartIdx + safeVisCount >= candles.length}
              title="다음 구간 이동"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#182331] text-slate-300 transition hover:bg-[#263343] disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyZoom(safeVisCount - 4)}
              disabled={safeVisCount <= minVis}
              title="차트 확대 (Zoom In)"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#182331] text-slate-300 transition hover:bg-[#263343] disabled:opacity-30"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyZoom(safeVisCount + 4)}
              disabled={safeVisCount >= maxVis}
              title="차트 축소 (Zoom Out)"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#182331] text-slate-300 transition hover:bg-[#263343] disabled:opacity-30"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setVisibleCount(candles.length);
                setStartIndex(0);
              }}
              title="전체 0~90' 한눈에 보기"
              className="flex h-7 items-center gap-1 rounded-lg bg-[#182331] px-2 text-[11px] font-medium text-slate-300 transition hover:bg-[#263343]"
            >
              <RotateCcw className="h-3 w-3" />
              <span>전체</span>
            </button>
          </div>
        </div>

        {/* 4. Seamless OHLCV HUD Strip + Event Impact Line */}
        {activeCandle && (
          <div className="shrink-0 bg-[#111925] px-4 pt-2.5 pb-1 font-sans tabular-nums text-[11px] font-medium text-[#8291A5] space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="rounded bg-[#182331] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {activeCandle.label}
                </span>
                <span>
                  시{" "}
                  <strong className="font-semibold text-slate-200">
                    {activeCandle.open.toLocaleString()}
                  </strong>
                </span>
                <span>
                  고{" "}
                  <strong className="font-semibold text-[#00B386]">
                    {activeCandle.high.toLocaleString()}
                  </strong>
                </span>
                <span>
                  저{" "}
                  <strong className="font-semibold text-[#F07868]">
                    {activeCandle.low.toLocaleString()}
                  </strong>
                </span>
                <span>
                  종{" "}
                  <strong
                    className={`font-semibold ${
                      activeCandle.close > activeCandle.open
                        ? "text-[#00B386]"
                        : activeCandle.close < activeCandle.open
                        ? "text-[#F07868]"
                        : "text-slate-300"
                    }`}
                  >
                    {activeCandle.close.toLocaleString()}
                  </strong>
                </span>
                <span>
                  량{" "}
                  <strong className="font-semibold text-slate-200">
                    {activeCandle.volume.toLocaleString()}
                  </strong>
                </span>
              </div>

              <span
                className={`text-[11px] font-semibold ${
                  activeCandlePctFromOpen > 0
                    ? "text-[#00B386]"
                    : activeCandlePctFromOpen < 0
                    ? "text-[#F07868]"
                    : "text-[#8291A5]"
                }`}
              >
                {activeCandlePctFromOpen > 0 ? "+" : ""}
                {activeCandlePctFromOpen.toFixed(2)}%
              </span>
            </div>

            {activeCandle.matchEvent && (
              <div className="flex items-center justify-between rounded-lg bg-[#182331] px-2.5 py-1 text-[11px] font-medium text-amber-300">
                <span className="truncate">
                  {activeCandle.matchEvent.minute}&apos;{" "}
                  {EVENT_PIN_CONFIG[activeCandle.matchEvent.type]?.icon ?? "⚽"}{" "}
                  {activeCandle.matchEvent.description}
                </span>
                <span className="shrink-0 ml-2 font-sans tabular-nums text-slate-200">
                  {activeCandle.open.toLocaleString()}P →{" "}
                  <strong
                    className={
                      activeCandle.matchEvent.priceImpactPercent >= 0
                        ? "text-[#00B386]"
                        : "text-[#F07868]"
                    }
                  >
                    {activeCandle.close.toLocaleString()}P (
                    {activeCandle.matchEvent.priceImpactPercent >= 0 ? "+" : ""}
                    {activeCandle.matchEvent.priceImpactPercent.toFixed(1)}%)
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* 5. Seamless Full-Bleed Candlestick (78%) + Volume (22%) Canvas */}
        <div
          ref={chartContainerRef}
          className="relative flex-1 min-h-0 w-full bg-[#111925] select-none touch-none overflow-hidden"
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="block h-full w-full cursor-grab active:cursor-grabbing overflow-visible"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Price Horizontal Grid Lines + Right Y-Axis Labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = padTop + pricePlotH * ratio;
              const val = roundToTen(maxP - rangeP * ratio);
              return (
                <g key={`grid-${idx}`}>
                  <line
                    x1={padLeft}
                    x2={padLeft + plotW}
                    y1={y}
                    y2={y}
                    stroke="#263343"
                    strokeOpacity={0.55}
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft + plotW + 6}
                    y={y + 3}
                    className="fill-[#8291A5] font-sans tabular-nums text-[9.5px] font-medium"
                  >
                    {val.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* Subtle Divider between 75% Price Pane and 25% Volume Pane */}
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={volTop - 7}
              y2={volTop - 7}
              stroke="#263343"
              strokeWidth="1"
            />
            <text
              x={padLeft + 2}
              y={volTop + 4}
              className="fill-[#8291A5] font-sans text-[8.5px] font-medium opacity-75"
            >
              VOL
            </text>

            {/* Open Price (시가) Horizontal Reference Line */}
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={openPriceY}
              y2={openPriceY}
              stroke="#475569"
              strokeOpacity={0.7}
              strokeDasharray="4 3"
              strokeWidth="1"
            />

            {/* Current Price Horizontal Dashed Line + Pointed TradingView-Style Price Tag */}
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={currentPriceY}
              y2={currentPriceY}
              stroke={currentPriceColor}
              strokeDasharray="3 3"
              strokeWidth="1.2"
            />
            <g
              transform={`translate(${padLeft + plotW}, ${
                currentPriceY - 8.5
              })`}
            >
              <polygon
                points="0,8.5 6,0 56,0 56,17 6,17"
                fill={currentPriceColor}
              />
              <text
                x="31"
                y="11.5"
                textAnchor="middle"
                className="fill-white font-sans tabular-nums text-[9px] font-semibold"
              >
                {closePrice.toLocaleString()}
              </text>
            </g>

            {/* Candlesticks & Volume Bars */}
            {visibleCandles.map((c, localIdx) => {
              const cx = padLeft + (localIdx + 0.5) * slotW;
              const isUp = c.close > c.open;
              const isDown = c.close < c.open;
              const isFlat = c.close === c.open;
              const candleColor = isUp
                ? COLOR_UP
                : isDown
                ? COLOR_DOWN
                : COLOR_FLAT;

              const highY = getPriceY(c.high);
              const lowY = getPriceY(c.low);
              const openY = getPriceY(c.open);
              const closeY = getPriceY(c.close);

              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = isFlat
                ? 1.5
                : Math.max(2, Math.abs(closeY - openY));

              const vH = getVolH(c.volume);
              const vY = volTop + volPlotH - vH;

              const isSelected = activeCandle?.index === c.index;
              const isHT = c.minute === 45;
              const showXLabel =
                localIdx === 0 ||
                localIdx === visibleCandles.length - 1 ||
                isHT ||
                localIdx % Math.max(2, Math.floor(visibleCandles.length / 5)) ===
                  0;

              return (
                <g
                  key={`candle-${c.index}`}
                  onClick={() => setSelectedCandleIdx(c.index)}
                  className="cursor-pointer"
                >
                  {/* Half-Time 45' Vertical Dashed Line */}
                  {isHT && (
                    <line
                      x1={cx}
                      x2={cx}
                      y1={padTop}
                      y2={volTop + volPlotH}
                      stroke="#F59E0B"
                      strokeOpacity={0.45}
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                  )}

                  {/* Selected Crosshair Vertical Guide */}
                  {isSelected && (
                    <>
                      <rect
                        x={cx - slotW / 2}
                        y={padTop}
                        width={slotW}
                        height={volTop + volPlotH - padTop}
                        fill="rgba(255, 255, 255, 0.035)"
                      />
                      <line
                        x1={cx}
                        x2={cx}
                        y1={padTop}
                        y2={volTop + volPlotH}
                        stroke="#64748B"
                        strokeDasharray="2 2"
                        strokeWidth="1"
                      />
                    </>
                  )}

                  {/* High-Low Wick (Sharp 1.5px centered vertical wick) */}
                  <line
                    x1={cx}
                    x2={cx}
                    y1={highY}
                    y2={lowY}
                    stroke={candleColor}
                    strokeWidth={isSelected ? 1.9 : 1.5}
                    strokeLinecap="round"
                  />

                  {/* Open-Close Candle Body */}
                  {isFlat ? (
                    <line
                      x1={cx - bodyW / 2}
                      x2={cx + bodyW / 2}
                      y1={openY}
                      y2={openY}
                      stroke={COLOR_FLAT}
                      strokeWidth={1.5}
                    />
                  ) : (
                    <rect
                      x={cx - bodyW / 2}
                      y={bodyTop}
                      width={bodyW}
                      height={bodyHeight}
                      rx={1.5}
                      fill={candleColor}
                      stroke={isSelected ? "#FFFFFF" : "none"}
                      strokeOpacity={isSelected ? 0.65 : 0}
                      strokeWidth={isSelected ? 1 : 0}
                    />
                  )}

                  {/* Volume Bar (35% default, 90% when selected) */}
                  <rect
                    x={cx - bodyW / 2}
                    y={vY}
                    width={bodyW}
                    height={vH}
                    rx={1}
                    fill={candleColor}
                    fillOpacity={isSelected ? 0.9 : 0.35}
                  />

                  {/* Custom Vector Match Event Badge */}
                  {c.event && (
                    <g
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCandleIdx(c.index);
                      }}
                      transform={`translate(${cx}, ${
                        (c.matchEvent?.priceImpactPercent ?? 0) < 0
                          ? Math.min(padTop + pricePlotH - 12, lowY + 13)
                          : Math.max(13, highY - 13)
                      })`}
                    >
                      {renderVectorEventBadge(c.event.type, isSelected)}
                    </g>
                  )}

                  {/* X-Axis Time/Minute Tick Label */}
                  {showXLabel && (
                    <text
                      x={cx}
                      y={svgH - 4}
                      textAnchor="middle"
                      className="fill-[#8291A5] font-sans tabular-nums text-[9.5px] font-medium"
                    >
                      {c.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* 6. Slim Borderless Horizontal Event Chips Strip */}
        {sortedEventsAsc.length > 0 && (
          <div className="shrink-0 bg-[#090E16] border-t border-[#263343]/60 px-4 py-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="shrink-0 text-[10px] font-semibold text-[#8291A5] mr-1">
                이벤트
              </span>
              {sortedEventsAsc.map((ev) => {
                const cfg = EVENT_PIN_CONFIG[ev.type] ?? EVENT_PIN_CONFIG.GOAL;
                const isSelected =
                  (activeCandle?.matchEvent?.minute ?? activeCandle?.minute) ===
                  ev.minute;
                const impact = ev.priceImpactPercent;

                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      const targetCandle = candles.find(
                        (c) =>
                          c.matchEvent?.minute === ev.minute ||
                          c.minute === ev.minute
                      );
                      if (!targetCandle) return;
                      setSelectedCandleIdx(targetCandle.index);
                      if (
                        targetCandle.index < safeStartIdx ||
                        targetCandle.index >= safeStartIdx + safeVisCount
                      ) {
                        setStartIndex(
                          Math.max(
                            0,
                            Math.min(
                              candles.length - safeVisCount,
                              targetCandle.index - Math.floor(safeVisCount / 2)
                            )
                          )
                        );
                      }
                    }}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      isSelected
                        ? "bg-[#263343] text-white"
                        : "bg-[#182331] text-slate-300 hover:bg-[#263343]/80"
                    }`}
                  >
                    <span className="font-sans tabular-nums text-[10px] text-[#8291A5]">
                      {formatMinuteLabel(ev.minute)}
                    </span>
                    <span>{cfg.icon}</span>
                    <span>{cfg.shortTitle}</span>
                    <span
                      className={`font-sans tabular-nums text-[10px] font-semibold ${
                        impact > 0
                          ? "text-[#00B386]"
                          : impact < 0
                          ? "text-[#F07868]"
                          : "text-[#8291A5]"
                      }`}
                    >
                      {impact > 0 ? "+" : ""}
                      {impact.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 7. Bottom Safe-Area Action Bar: Direct Buy / Sell Trigger */}
        <div className="shrink-0 bg-[#090E16] px-4 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSelectTrade) onSelectTrade(player, "BUY");
              }}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#00B386] text-sm font-semibold text-white transition hover:bg-[#00B386]/90 active:scale-[0.98]"
            >
              <TrendingUp className="h-4 w-4" />
              <span>매수 주문하기</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSelectTrade) onSelectTrade(player, "SELL");
              }}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#F07868] text-sm font-semibold text-white transition hover:bg-[#F07868]/90 active:scale-[0.98]"
            >
              <TrendingDown className="h-4 w-4" />
              <span>매도 주문하기</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
