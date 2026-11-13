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
  Zap,
  MoveHorizontal,
} from "lucide-react";
import {
  useTradeStore,
  roundToTen,
  clampToPriceLimit,
  doesPlayerBelongToMatch,
} from "@/store/useTradeStore";
import {
  ChartEventMarker,
  Match,
  Player,
  TradeType,
} from "@/types";
import { EVENT_PIN_CONFIG } from "./MatchTimelineChart";

export type CandleTimeframe = "3M" | "1M" | "15M" | "1D";

export interface OhlcCandle {
  index: number;
  minute?: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  event?: ChartEventMarker;
}

interface FullScreenCandleChartModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectTrade?: (player: Player, type: TradeType) => void;
}

// Standardized PitchTrade Global Palette
const COLOR_UP = "#00A878"; // Emerald Green
const COLOR_DOWN = "#F07868"; // Coral
const COLOR_FLAT = "#A8B2BC"; // Cool Gray

function seededNoise(seedStr: string, index: number): number {
  let h = 2166136261;
  const str = `${seedStr}-${index}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Generates realistic OHLCV candlestick data synchronized with the player's
 * 0~90m match timeline (`openPrice`, `priceHistory`, `event` pins, and `currentPrice`).
 */
function buildCandleSeries(
  player: Player,
  timeframe: CandleTimeframe,
  matchStatus: "LIVE" | "FT" | "UPCOMING",
  matchMinute: number
): OhlcCandle[] {
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const openPrice = roundToTen(
    player.openPrice ?? player.priceHistory[0]?.price ?? basePrice
  );
  const currentPrice = roundToTen(player.currentPrice);
  const finalClose =
    matchStatus === "FT"
      ? roundToTen(player.closePrice ?? currentPrice)
      : currentPrice;

  // Map known history points and events by minute
  const historyMap = new Map<number, number>();
  const eventMap = new Map<number, ChartEventMarker>();
  historyMap.set(0, openPrice);

  for (const pt of player.priceHistory ?? []) {
    const m = Math.max(0, Math.min(96, Math.round(pt.minute ?? 0)));
    historyMap.set(m, m === 0 ? openPrice : roundToTen(pt.price));
    if (pt.event) {
      eventMap.set(m, pt.event);
    }
  }

  const endMin =
    matchStatus === "FT"
      ? 90
      : matchStatus === "UPCOMING"
      ? 30
      : Math.max(
          48,
          Math.min(
            94,
            matchMinute ||
              (player.priceHistory[player.priceHistory.length - 1]?.minute ?? 65)
          )
        );
  historyMap.set(endMin, finalClose);

  // Sorted anchor points for smooth interpolation
  const anchorMinutes = Array.from(historyMap.keys()).sort((a, b) => a - b);
  const getInterpolatedPrice = (targetMin: number): number => {
    if (historyMap.has(targetMin)) return historyMap.get(targetMin)!;
    let leftMin = 0;
    let rightMin = endMin;
    for (const m of anchorMinutes) {
      if (m <= targetMin) leftMin = m;
      if (m >= targetMin) {
        rightMin = m;
        break;
      }
    }
    const leftP = historyMap.get(leftMin) ?? openPrice;
    const rightP = historyMap.get(rightMin) ?? finalClose;
    if (rightMin === leftMin) return leftP;
    const ratio = (targetMin - leftMin) / (rightMin - leftMin);
    const n = seededNoise(`${player.id}-interp`, targetMin);
    const microWave = (n - 0.49) * basePrice * 0.014;
    return clampToPriceLimit(
      leftP + (rightP - leftP) * ratio + microWave,
      basePrice
    );
  };

  if (timeframe === "1D") {
    const count = 24;
    const candles: OhlcCandle[] = [];
    const now = new Date();
    let prevClose = clampToPriceLimit(
      basePrice * (0.91 + seededNoise(player.id, 701) * 0.1),
      basePrice
    );

    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (count - 1 - i));
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const n1 = seededNoise(`${player.id}-1d-o`, i);
      const n2 = seededNoise(`${player.id}-1d-h`, i);
      const n3 = seededNoise(`${player.id}-1d-l`, i);

      const open = prevClose;
      const close =
        i === count - 1
          ? finalClose
          : clampToPriceLimit(
              open +
                ((finalClose - open) / Math.max(1, count - i)) * 0.65 +
                (n1 - 0.48) * basePrice * 0.042,
              basePrice
            );

      const bodyMax = Math.max(open, close);
      const bodyMin = Math.min(open, close);
      const wickUp = roundToTen((0.005 + n2 * 0.022) * basePrice);
      const wickDown = roundToTen((0.005 + n3 * 0.022) * basePrice);
      const high = clampToPriceLimit(bodyMax + wickUp, basePrice);
      const low = clampToPriceLimit(bodyMin - wickDown, basePrice);
      const priceSwing = Math.abs(close - open) + (high - low);
      const volume = Math.max(
        45,
        Math.round(120 + (priceSwing / Math.max(1, basePrice)) * 4200 + n2 * 180)
      );

      candles.push({
        index: i,
        label,
        open,
        high,
        low,
        close,
        volume,
      });
      prevClose = close;
    }
    return candles;
  }

  // Match Timeline Candles: 1M (step=2m), 3M (step=3m), 15M (step=6m)
  const step = timeframe === "1M" ? 2 : timeframe === "3M" ? 3 : 6;
  const candles: OhlcCandle[] = [];
  let prevClose = openPrice;
  let idx = 0;

  for (let m = 0; m <= endMin; m += step) {
    const bucketEnd = Math.min(endMin, m + step);
    const open = m === 0 ? openPrice : prevClose;

    // Check if an event occurred inside [m, bucketEnd]
    let bucketEvent: ChartEventMarker | undefined;
    let eventMinutePrice: number | undefined;
    for (let k = m; k <= bucketEnd; k++) {
      if (eventMap.has(k)) {
        bucketEvent = eventMap.get(k);
        eventMinutePrice = historyMap.get(k);
      }
    }

    const close =
      bucketEnd >= endMin
        ? finalClose
        : eventMinutePrice !== undefined
        ? eventMinutePrice
        : getInterpolatedPrice(bucketEnd);

    const nHigh = seededNoise(`${player.id}-${timeframe}-h`, m);
    const nLow = seededNoise(`${player.id}-${timeframe}-l`, m);
    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);

    const wickRange = bucketEvent
      ? basePrice * (0.014 + nHigh * 0.022)
      : basePrice * (0.004 + nHigh * 0.014);
    const wickDownRange = bucketEvent
      ? basePrice * (0.01 + nLow * 0.018)
      : basePrice * (0.004 + nLow * 0.014);

    const high =
      m === 0 && step > 0
        ? clampToPriceLimit(
            Math.max(bodyMax, openPrice + roundToTen(wickRange * 0.5)),
            basePrice
          )
        : clampToPriceLimit(bodyMax + roundToTen(wickRange), basePrice);

    const low =
      m === 0 && step > 0
        ? clampToPriceLimit(
            Math.min(bodyMin, openPrice - roundToTen(wickDownRange * 0.5)),
            basePrice
          )
        : clampToPriceLimit(bodyMin - roundToTen(wickDownRange), basePrice);

    const baseVol = bucketEvent ? 680 : 140;
    const swingBoost = Math.round(
      (Math.abs(close - open) / Math.max(1, basePrice)) * 6500
    );
    const volume = Math.max(
      30,
      Math.round(baseVol + swingBoost + nHigh * 160)
    );

    const displayMin = bucketEnd;
    const label =
      displayMin === 0
        ? "0'"
        : displayMin === 45
        ? "45'(HT)"
        : displayMin === 90
        ? "90'(FT)"
        : displayMin > 90
        ? `90+${displayMin - 90}'`
        : `${displayMin}'`;

    candles.push({
      index: idx++,
      minute: displayMin,
      label,
      open,
      high,
      low,
      close,
      volume,
      event: bucketEvent,
    });

    prevClose = close;
    if (bucketEnd >= endMin) break;
  }

  return candles;
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
  const [visibleCount, setVisibleCount] = useState<number>(18);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [selectedCandleIdx, setSelectedCandleIdx] = useState<number | null>(
    null
  );

  // Gesture state refs for Mouse Drag & Mobile Pinch-to-Zoom / Pan
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

  const candles = useMemo(() => {
    if (!player) return [];
    return buildCandleSeries(
      player,
      timeframe,
      matchStatus,
      playerMatch?.minute ?? player.lastEvent?.minute ?? 65
    );
  }, [player, timeframe, matchStatus, playerMatch?.minute]);

  // Reset viewport to show the latest candles when timeframe or player changes
  useEffect(() => {
    if (!isOpen || candles.length === 0) return;
    const defaultVis = Math.min(candles.length, 18);
    setVisibleCount(defaultVis);
    setStartIndex(Math.max(0, candles.length - defaultVis));
    setSelectedCandleIdx(candles.length - 1);
  }, [isOpen, player?.id, timeframe, candles.length]);

  if (!isOpen || !player) return null;

  const isWatched = watchlist.includes(player.id);
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const openPrice = roundToTen(
    player.openPrice ?? player.priceHistory[0]?.price ?? basePrice
  );
  const currentPrice = roundToTen(player.currentPrice);
  const closePrice =
    matchStatus === "FT"
      ? roundToTen(player.closePrice ?? currentPrice)
      : currentPrice;

  const diffFromOpen = closePrice - openPrice;
  const pctFromOpen =
    openPrice > 0 ? Number(((diffFromOpen / openPrice) * 100).toFixed(2)) : 0;
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

  // Compute SVG geometry for visibleCandles
  const svgW = 420;
  const svgH = 340;
  const padLeft = 10;
  const padRight = 56;
  const padTop = 24;
  const pricePlotH = 210;
  const volTop = padTop + pricePlotH + 18;
  const volPlotH = 62;
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
  const maxP = roundToTen(visHigh + priceSpread * 0.14);
  const minP = Math.max(100, roundToTen(visLow - priceSpread * 0.12));
  const rangeP = Math.max(100, maxP - minP);

  const maxVol =
    visibleCandles.length > 0
      ? Math.max(...visibleCandles.map((c) => c.volume), 100)
      : 500;

  const getPriceY = (p: number) =>
    padTop + pricePlotH - ((p - minP) / rangeP) * pricePlotH;

  const getVolH = (v: number) => Math.max(3, (v / maxVol) * volPlotH);

  const slotW = plotW / Math.max(1, visibleCandles.length);
  const bodyW = Math.max(4, Math.min(18, slotW * 0.64));

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

  const allHigh = Math.max(...candles.map((c) => c.high), closePrice);
  const allLow = Math.min(...candles.map((c) => c.low), closePrice);
  const totalVol = candles.reduce((acc, c) => acc + c.volume, 0);

  const eventCandles = candles.filter((c) => Boolean(c.event));

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-white animate-fade-in">
      {/* Centered Mobile/Desktop Container */}
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl border-x border-gray-200/80 overflow-hidden">
        {/* 1. Top Bar: Player Info + Watchlist Star + Close Button */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              style={{ backgroundColor: player.teamColor }}
              className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-white font-mono shadow-xs"
            >
              <span className="text-[8px] font-bold opacity-85 leading-none">
                {player.teamShort}
              </span>
              <span className="text-xs font-black">{player.backNumber}</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-base font-black text-gray-900">
                  {player.name}
                </h2>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-extrabold text-gray-700">
                  {player.position}
                </span>
                <span className="rounded bg-[#00A878]/10 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#00A878]">
                  ★ {player.stats.rating.toFixed(1)}
                </span>
              </div>
              <p className="truncate text-[11px] text-gray-400">
                {player.teamName} ·{" "}
                {matchStatus === "LIVE"
                  ? `🔴 실시간 경기 (${playerMatch?.minute ?? 65}')`
                  : matchStatus === "FT"
                  ? "🏁 경기 종료 (FT)"
                  : "🕒 경기 예정"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Watchlist Star Toggle */}
            <button
              type="button"
              onClick={() => toggleWatchlist(player.id)}
              title={isWatched ? "관심선수 해제" : "관심선수 등록"}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-90 ${
                isWatched
                  ? "border-amber-300 bg-amber-50 text-amber-500"
                  : "border-gray-200 bg-gray-50 text-gray-400 hover:text-gray-700"
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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. Exchange-Style OHLC + Volume Summary Header */}
        <div className="shrink-0 border-b border-gray-100 bg-[#f8f9fa] px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-mono text-2xl font-black tracking-tight ${
                    isUpOverall
                      ? "text-[#00A878]"
                      : isDownOverall
                      ? "text-[#F07868]"
                      : "text-[#A8B2BC]"
                  }`}
                >
                  {closePrice.toLocaleString()} P
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-xs font-extrabold ${
                    isUpOverall
                      ? "bg-[#00A878]/10 text-[#00A878]"
                      : isDownOverall
                      ? "bg-[#F07868]/10 text-[#F07868]"
                      : "bg-[#A8B2BC]/15 text-[#A8B2BC]"
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
              <p className="mt-0.5 font-mono text-[10px] text-gray-500">
                시가(0&apos;) {openPrice.toLocaleString()}P 대비{" "}
                {diffFromOpen >= 0 ? "+" : ""}
                {diffFromOpen.toLocaleString()}P
              </p>
            </div>

            {/* 4-Metric Mini Grid: 고가 / 저가 / 시가 / 거래량 */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-right font-mono text-[10px]">
              <div className="flex items-center justify-end gap-1.5">
                <span className="font-sans text-gray-400">고가</span>
                <strong className="text-[#00A878]">
                  {allHigh.toLocaleString()}
                </strong>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="font-sans text-gray-400">시가</span>
                <strong className="text-gray-800">
                  {openPrice.toLocaleString()}
                </strong>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="font-sans text-gray-400">저가</span>
                <strong className="text-[#F07868]">
                  {allLow.toLocaleString()}
                </strong>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="font-sans text-gray-400">거래량</span>
                <strong className="text-gray-700">
                  {totalVol.toLocaleString()}주
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Timeframe Selector & Zoom/Pan Controls Bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-2">
          {/* Timeframe Pills */}
          <div className="inline-flex rounded-xl bg-gray-100 p-0.5 text-[11px] font-extrabold">
            {(
              [
                { key: "3M", label: "⚡ 3분봉(0~90')" },
                { key: "1M", label: "1분봉" },
                { key: "15M", label: "15분봉" },
                { key: "1D", label: "일봉" },
              ] as { key: CandleTimeframe; label: string }[]
            ).map((tf) => (
              <button
                key={tf.key}
                type="button"
                onClick={() => setTimeframe(tf.key)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  timeframe === tf.key
                    ? "bg-gray-900 text-white shadow-xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Zoom & Pan Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applyPan(-4)}
              disabled={safeStartIdx <= 0}
              title="이전 구간 이동"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition hover:bg-gray-100 disabled:opacity-35"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyPan(4)}
              disabled={safeStartIdx + safeVisCount >= candles.length}
              title="다음 구간 이동"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition hover:bg-gray-100 disabled:opacity-35"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyZoom(safeVisCount - 4)}
              disabled={safeVisCount <= minVis}
              title="차트 확대 (Zoom In)"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 transition hover:bg-gray-100 disabled:opacity-35"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyZoom(safeVisCount + 4)}
              disabled={safeVisCount >= maxVis}
              title="차트 축소 (Zoom Out)"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 transition hover:bg-gray-100 disabled:opacity-35"
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
              className="flex h-7 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-2 text-[10px] font-bold text-gray-600 transition hover:bg-gray-100"
            >
              <RotateCcw className="h-3 w-3" />
              <span>전체</span>
            </button>
          </div>
        </div>

        {/* 4. Selected Candle OHLCV HUD Bar */}
        {activeCandle && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 bg-slate-900 px-4 py-1.5 font-mono text-[10px] text-slate-300">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded bg-white/15 px-1.5 py-0.5 font-bold text-white">
                {activeCandle.label}
              </span>
              <span>
                시 <strong className="text-white">{activeCandle.open.toLocaleString()}</strong>
              </span>
              <span>
                고 <strong className="text-[#00A878]">{activeCandle.high.toLocaleString()}</strong>
              </span>
              <span>
                저 <strong className="text-[#F07868]">{activeCandle.low.toLocaleString()}</strong>
              </span>
              <span>
                종{" "}
                <strong
                  className={
                    activeCandle.close > activeCandle.open
                      ? "text-[#00A878]"
                      : activeCandle.close < activeCandle.open
                      ? "text-[#F07868]"
                      : "text-[#A8B2BC]"
                  }
                >
                  {activeCandle.close.toLocaleString()}
                </strong>
              </span>
              <span>
                거래량 <strong className="text-white">{activeCandle.volume}</strong>
              </span>
            </div>

            {activeCandle.event && (
              <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-sans text-[10px] font-extrabold text-amber-300">
                {activeCandle.event.label}
              </span>
            )}
          </div>
        )}

        {/* 5. Main Interactive Candlestick + Volume Chart Area */}
        <div className="relative flex-1 overflow-y-auto px-3 py-2 flex flex-col justify-between">
          <div className="relative flex-1 min-h-[320px] w-full rounded-2xl border border-gray-200 bg-white p-1 shadow-inner select-none touch-none">
            {/* Gesture Guide Pill */}
            <div className="pointer-events-none absolute left-3 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-gray-900/5 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
              <MoveHorizontal className="h-3 w-3 text-[#00A878]" />
              <span>마우스 휠·핀치 줌 확대/축소 · 좌우 드래그 이동</span>
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="h-full w-full cursor-grab active:cursor-grabbing overflow-visible"
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
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft + plotW + 6}
                      y={y + 3}
                      className="fill-slate-400 font-mono text-[9.5px] font-semibold"
                    >
                      {val.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Divider between Price Pane and Volume Pane */}
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={volTop - 8}
                y2={volTop - 8}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padLeft + 4}
                y={volTop + 4}
                className="fill-slate-400 font-mono text-[9px] font-bold"
              >
                거래량 (VOL)
              </text>

              {/* Open Price (시가) Horizontal Reference Line */}
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={openPriceY}
                y2={openPriceY}
                stroke="#94a3b8"
                strokeDasharray="4 3"
                strokeWidth="1.1"
              />

              {/* Current Price Brand Green (#00A878) Horizontal Dashed Line + Axis Pill */}
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={currentPriceY}
                y2={currentPriceY}
                stroke={COLOR_UP}
                strokeDasharray="4 3"
                strokeWidth="1.4"
              />
              <g
                transform={`translate(${padLeft + plotW + 2}, ${
                  currentPriceY - 8
                })`}
              >
                <rect
                  width="52"
                  height="16"
                  rx="4"
                  fill={COLOR_UP}
                />
                <text
                  x="26"
                  y="11"
                  textAnchor="middle"
                  className="fill-white font-mono text-[9px] font-extrabold"
                >
                  {closePrice.toLocaleString()}
                </text>
              </g>

              {/* Candlesticks & Volume Bars */}
              {visibleCandles.map((c, localIdx) => {
                const cx = padLeft + (localIdx + 0.5) * slotW;
                const isUp = c.close > c.open;
                const isDown = c.close < c.open;
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
                const bodyHeight = Math.max(2.5, Math.abs(closeY - openY));

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
                        stroke="#f59e0b"
                        strokeDasharray="3 3"
                        strokeWidth="1.1"
                      />
                    )}

                    {/* Selected Crosshair Vertical Guide */}
                    {isSelected && (
                      <line
                        x1={cx}
                        x2={cx}
                        y1={padTop}
                        y2={volTop + volPlotH}
                        stroke="#64748b"
                        strokeDasharray="2 2"
                        strokeWidth="1"
                      />
                    )}

                    {/* High-Low Wick (same color as candle body) */}
                    <line
                      x1={cx}
                      x2={cx}
                      y1={highY}
                      y2={lowY}
                      stroke={candleColor}
                      strokeWidth={isSelected ? 2 : 1.5}
                      strokeLinecap="round"
                    />

                    {/* Open-Close Candle Body */}
                    <rect
                      x={cx - bodyW / 2}
                      y={bodyTop}
                      width={bodyW}
                      height={bodyHeight}
                      rx={1.2}
                      fill={candleColor}
                    />

                    {/* Volume Bar (50% opacity of candle color) */}
                    <rect
                      x={cx - bodyW / 2}
                      y={vY}
                      width={bodyW}
                      height={vH}
                      rx={1}
                      fill={candleColor}
                      fillOpacity={0.5}
                    />

                    {/* Match Event Badge Above/Below Candle */}
                    {c.event && (
                      <g
                        transform={`translate(${cx}, ${Math.max(
                          12,
                          highY - 13
                        )})`}
                      >
                        <circle
                          cx={0}
                          cy={0}
                          r={8.5}
                          fill={
                            EVENT_PIN_CONFIG[c.event.type]?.fill ?? COLOR_UP
                          }
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                        <text
                          x={0}
                          y={3}
                          textAnchor="middle"
                          fontSize={9}
                        >
                          {EVENT_PIN_CONFIG[c.event.type]?.icon ?? "⚽"}
                        </text>
                      </g>
                    )}

                    {/* X-Axis Time/Minute Tick Label */}
                    {showXLabel && (
                      <text
                        x={cx}
                        y={svgH - 4}
                        textAnchor="middle"
                        className="fill-slate-500 font-mono text-[9.5px] font-bold"
                      >
                        {c.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* 6. Event Marker Chips Bar below Candle Chart */}
          {eventCandles.length > 0 && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-[#f8f9fa] p-2.5 shrink-0">
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-extrabold text-gray-800">
                  <Zap className="h-3.5 w-3.5 text-[#00A878]" />
                  <span>캔들 이벤트 마커 ({eventCandles.length}건)</span>
                </span>
                <span className="text-[10px] text-gray-400">
                  터치 시 해당 캔들로 포커스 이동
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {eventCandles.map((ec) => {
                  if (!ec.event) return null;
                  const cfg =
                    EVENT_PIN_CONFIG[ec.event.type] ?? EVENT_PIN_CONFIG.GOAL;
                  const active = activeCandle?.index === ec.index;
                  const impact = ec.event.impactPercent;
                  return (
                    <button
                      key={`ev-candle-${ec.index}`}
                      type="button"
                      onClick={() => {
                        setSelectedCandleIdx(ec.index);
                        if (
                          ec.index < safeStartIdx ||
                          ec.index >= safeStartIdx + safeVisCount
                        ) {
                          setStartIndex(
                            Math.max(
                              0,
                              Math.min(
                                candles.length - safeVisCount,
                                ec.index - Math.floor(safeVisCount / 2)
                              )
                            )
                          );
                        }
                      }}
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold transition ${
                        active
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-800 hover:bg-gray-100"
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-80">
                        {ec.label}
                      </span>
                      <span>{cfg.icon}</span>
                      <span>{cfg.shortTitle}</span>
                      <span
                        className={`font-mono text-[10px] ${
                          impact > 0
                            ? "text-[#00A878]"
                            : impact < 0
                            ? "text-[#F07868]"
                            : "text-[#A8B2BC]"
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
        </div>

        {/* 7. Bottom Safe-Area Action Bar: Direct Buy / Sell Trigger */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSelectTrade) onSelectTrade(player, "BUY");
              }}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#00A878] py-3 text-sm font-extrabold text-white shadow-sm transition hover:opacity-95 active:scale-95"
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
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#F07868] py-3 text-sm font-extrabold text-white shadow-sm transition hover:opacity-95 active:scale-95"
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
