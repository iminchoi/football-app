"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { X, Star } from "lucide-react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineStyle,
  LineType,
  SeriesMarker,
  Time,
  UTCTimestamp,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
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
  resolveLastMatchReview,
} from "@/lib/priceEngine";
import { resolvePlayerQuote } from "@/lib/playerQuote";
import {
  resolveMatchClock,
  resolveMatchForPlayerView,
  resolveMatchScore,
} from "@/lib/matchSync";
import { formatPlayerDisplayName } from "@/lib/playerDisplayName";
import {
  CandleData,
  CandleTimeframe,
  ChartEventType,
  Match,
  MatchEvent,
  Player,
  TradeType,
} from "@/types";
import { EVENT_PIN_CONFIG } from "./MatchTimelineChart";

export type { CandleTimeframe };
export type OhlcCandle = CandleData;
type ChartDisplayMode = "CANDLE" | "LINE";

interface FullScreenCandleChartModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectTrade?: (player: Player, type: TradeType) => void;
}

const COLOR_BG = "#F7F9F8";
const COLOR_SURFACE = "#FFFFFF";
const COLOR_MINT_SURFACE = "#E8F5EF";
const COLOR_BORDER = "#E2E8F0";
const COLOR_GRID = "#F1F5F9";
const COLOR_UP = "#00A878";
const COLOR_DOWN = "#F07868";
const COLOR_TEXT = "#0F172A";
const COLOR_MUTED = "#64748B";
const BASE_TIMESTAMP_SEC = 1700000000;

const TIMEFRAME_TABS: { key: CandleTimeframe; label: string }[] = [
  { key: "1M", label: "1분" },
  { key: "3M", label: "3분" },
  { key: "15M", label: "15분" },
  { key: "1D", label: "전체" },
];

function getEventMarkerText(type: ChartEventType, minute: number): string {
  const labelMap: Record<ChartEventType, string> = {
    GOAL: `⚽ ${minute}'`,
    ASSIST: `🅰️ ${minute}'`,
    YELLOW_CARD: `🟨 ${minute}'`,
    RED_CARD: `🟥 ${minute}'`,
    SAVE: `🧤 ${minute}'`,
    CONCEDED: `🥅 ${minute}'`,
    DEFENSIVE_ACTION: `🛡️ ${minute}'`,
    KEY_PLAY: `🎯 ${minute}'`,
    BIG_CHANCE_MISS: `😣 ${minute}'`,
    SUB_OUT: `🔄 ${minute}'`,
    SUB_IN: `🔄 ${minute}'`,
    SUB: `🔄 ${minute}'`,
  };
  return labelMap[type] ?? `• ${minute}'`;
}

function getEventChipLabel(type: ChartEventType): string {
  const map: Record<ChartEventType, string> = {
    GOAL: "GOAL",
    ASSIST: "ASSIST",
    YELLOW_CARD: "CARD",
    RED_CARD: "RED",
    SAVE: "SAVE",
    CONCEDED: "GOAL AG",
    DEFENSIVE_ACTION: "DEF",
    KEY_PLAY: "KEY",
    BIG_CHANCE_MISS: "MISS",
    SUB_OUT: "SUB",
    SUB_IN: "SUB",
    SUB: "SUB",
  };
  return map[type] ?? EVENT_PIN_CONFIG[type]?.shortTitle ?? type;
}

function formatAxisMatchMinute(candle: CandleData, timeframe: CandleTimeframe): string {
  if (timeframe === "1D") return candle.label;
  if (candle.minute === 45) return "HT 45'";
  if (candle.minute !== undefined) return `${candle.minute}'`;
  return candle.label;
}

function toChartTime(index: number): UTCTimestamp {
  return (BASE_TIMESTAMP_SEC + index * 60) as UTCTimestamp;
}

const EMPTY_MATCH_EVENTS: MatchEvent[] = [];

interface CrosshairHudProps {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => CandleData | null;
  timeframe: CandleTimeframe;
  chartMode: ChartDisplayMode;
}

function getServerHoveredCandleSnapshot(): CandleData | null {
  return null;
}

const CrosshairHud = React.memo(function CrosshairHud({
  subscribe,
  getSnapshot,
  timeframe,
  chartMode,
}: CrosshairHudProps) {
  const hoveredCandle = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerHoveredCandleSnapshot
  );

  if (!hoveredCandle) return null;

  return (
    <div className="pointer-events-none absolute top-2 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF]/95 px-2.5 py-1 font-sans tabular-nums text-[11px] text-[#64748B] shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 truncate">
        <span className="font-bold text-[#0F172A]">
          {formatAxisMatchMinute(hoveredCandle, timeframe)}
        </span>
        {chartMode === "CANDLE" ? (
          <>
            <span>
              시{" "}
              <strong className="text-[#0F172A]">
                {hoveredCandle.open.toLocaleString()}
              </strong>
            </span>
            <span>
              고{" "}
              <strong className="text-[#0F172A]">
                {hoveredCandle.high.toLocaleString()}
              </strong>
            </span>
            <span>
              저{" "}
              <strong className="text-[#0F172A]">
                {hoveredCandle.low.toLocaleString()}
              </strong>
            </span>
            <span>
              종{" "}
              <strong
                className={
                  hoveredCandle.close > hoveredCandle.open
                    ? "text-[#00A878]"
                    : hoveredCandle.close < hoveredCandle.open
                    ? "text-[#F07868]"
                    : "text-[#0F172A]"
                }
              >
                {hoveredCandle.close.toLocaleString()}
              </strong>
            </span>
            <span>
              량{" "}
              <strong className="text-[#0F172A]">
                {hoveredCandle.volume.toLocaleString()}
              </strong>
            </span>
          </>
        ) : (
          <span>
            가격{" "}
            <strong className="text-[#0F172A]">
              {hoveredCandle.close.toLocaleString()}P
            </strong>
          </span>
        )}
      </div>
      {hoveredCandle.matchEvent && (
        <span className="shrink-0 font-semibold text-[#00A878]">
          {EVENT_PIN_CONFIG[hoveredCandle.matchEvent.type]?.icon ?? "⚽"}{" "}
          {hoveredCandle.matchEvent.minute}&apos;
        </span>
      )}
    </div>
  );
});

export default function FullScreenCandleChartModal({
  player: initialPlayer,
  isOpen,
  onClose,
  onSelectTrade,
}: FullScreenCandleChartModalProps) {
  const players = useTradeStore((s) => s.players);
  const matches = useTradeStore((s) => s.matches);
  const activeMatchContext = useTradeStore((s) => s.activeMatchContext);
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
  const [chartMode, setChartMode] = useState<ChartDisplayMode>("CANDLE");
  const [preMatchMode, setPreMatchMode] = useState<"PRE" | "LAST_FT">("PRE");
  const [selectedEventMinute, setSelectedEventMinute] = useState<number | null>(
    null
  );

  const hoveredCandleRef = useRef<CandleData | null>(null);
  const crosshairListenersRef = useRef<Set<() => void>>(new Set());
  const selectedEventMinuteRef = useRef<number | null>(null);

  const notifyHoveredCandle = useCallback((next: CandleData | null) => {
    if (hoveredCandleRef.current === next) return;
    hoveredCandleRef.current = next;
    crosshairListenersRef.current.forEach((listener) => listener());
  }, []);

  const subscribeHoveredCandle = useCallback((listener: () => void) => {
    crosshairListenersRef.current.add(listener);
    return () => {
      crosshairListenersRef.current.delete(listener);
    };
  }, []);

  const getHoveredCandleSnapshot = useCallback(
    () => hoveredCandleRef.current,
    []
  );

  useEffect(() => {
    setPreMatchMode("PRE");
    selectedEventMinuteRef.current = null;
    setSelectedEventMinute(null);
    notifyHoveredCandle(null);
  }, [isOpen, player?.id, notifyHoveredCandle]);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const goalHighlightSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area", Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const candleMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const areaMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const timeToCandleRef = useRef<Map<number, CandleData>>(new Map());
  const balancedRangeRef = useRef<{ minValue: number; maxValue: number } | null>(
    null
  );
  const timeframeRef = useRef<CandleTimeframe>(timeframe);
  const prevViewKeyRef = useRef<string>("");

  timeframeRef.current = timeframe;

  const playerMatch: Match | undefined = useMemo(() => {
    if (!player) return undefined;
    return resolveMatchForPlayerView({
      player,
      storeMatches: matches,
      activeMatchContext,
      belongsToMatch: doesPlayerBelongToMatch,
    });
  }, [activeMatchContext, matches, player]);

  const matchClock = useMemo(
    () => resolveMatchClock(playerMatch, activeMatchContext),
    [playerMatch, activeMatchContext]
  );

  const matchScore = useMemo(
    () => resolveMatchScore(playerMatch, activeMatchContext),
    [playerMatch, activeMatchContext]
  );

  const matchStatus: "LIVE" | "FT" | "UPCOMING" = matchClock.status;
  const currentMinute = matchClock.minute;

  const ssotMetrics = useMemo(() => {
    if (!player) return null;
    const base = roundToTen(
      player.basePrice ?? player.initialPrice ?? player.currentPrice
    );
    const open =
      matchStatus === "UPCOMING"
        ? base
        : roundToTen(player.openPrice ?? player.priceHistory[0]?.price ?? base);
    const events = extractInitialMatchEvents(
      {
        ...player,
        openPrice: open,
        basePrice: base,
      },
      matchStatus
    );

    return derivePlayerMarketData({
      playerId: player.id,
      openPrice: open,
      basePrice: base,
      events,
      currentMinute,
      matchStatus,
    });
  }, [player, matchStatus, currentMinute]);

  const lastMatchReview = useMemo(() => {
    if (!player || matchStatus !== "UPCOMING") return null;
    return resolveLastMatchReview(player, matches);
  }, [player, matchStatus, matches]);

  const isViewingLastMatch =
    matchStatus === "UPCOMING" &&
    preMatchMode === "LAST_FT" &&
    Boolean(lastMatchReview);

  const candles = useMemo(() => {
    if (!player || !ssotMetrics) return [];
    if (isViewingLastMatch && lastMatchReview) {
      return deriveCandlesFromEvents({
        playerId: `${player.id}-last-ft`,
        openPrice: lastMatchReview.openPrice,
        basePrice: lastMatchReview.basePrice,
        events: lastMatchReview.events,
        timeframe,
        matchStatus: "FT",
        currentMinute: 90,
      });
    }
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
      currentMinute,
    });
  }, [
    player,
    ssotMetrics,
    isViewingLastMatch,
    lastMatchReview,
    timeframe,
    matchStatus,
    currentMinute,
  ]);

  const canonicalEvents = useMemo<MatchEvent[]>(() => {
    if (!isOpen || !player || !ssotMetrics) return EMPTY_MATCH_EVENTS;
    if (isViewingLastMatch && lastMatchReview) {
      return lastMatchReview.events;
    }
    if (matchStatus === "UPCOMING") {
      return EMPTY_MATCH_EVENTS;
    }
    return player.events ?? ssotMetrics.events;
  }, [
    isOpen,
    player,
    ssotMetrics,
    isViewingLastMatch,
    lastMatchReview,
    matchStatus,
  ]);

  const sortedEventsAsc = useMemo<MatchEvent[]>(() => {
    if (canonicalEvents.length <= 1) return canonicalEvents;
    return [...canonicalEvents].sort((a, b) => a.minute - b.minute);
  }, [canonicalEvents]);

  const quote = player ? resolvePlayerQuote(player, matchStatus) : null;
  const openPrice = quote?.openPrice ?? 0;
  const closePrice = quote?.currentPrice ?? 0;
  const diffFromOpen = calculateDiffFromOpen(closePrice, openPrice);
  const pctFromOpen = calculateChangePercentFromOpen(closePrice, openPrice);
  const isUpOverall = diffFromOpen > 0;
  const isDownOverall = diffFromOpen < 0;

  // Initialize lightweight-charts instance on Soft Ivory Green white canvas
  useEffect(() => {
    if (!isOpen) return;
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth || 420,
      height: container.clientHeight || 340,
      layout: {
        background: { type: ColorType.Solid, color: COLOR_SURFACE },
        textColor: COLOR_MUTED,
        fontFamily:
          "var(--font-sans), ui-sans-serif, system-ui, -apple-system, sans-serif",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: COLOR_GRID, style: LineStyle.Dashed },
        horzLines: { color: COLOR_GRID, style: LineStyle.Dashed },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(15, 23, 42, 0.22)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: COLOR_TEXT,
        },
        horzLine: {
          color: "rgba(15, 23, 42, 0.22)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: COLOR_TEXT,
        },
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: COLOR_BORDER,
        scaleMargins: { top: 0.16, bottom: 0.24 },
      },
      timeScale: {
        borderColor: COLOR_BORDER,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 12,
        minBarSpacing: 4,
        tickMarkFormatter: (time: Time) => {
          if (typeof time === "number") {
            const c = timeToCandleRef.current.get(time);
            if (c) return formatAxisMatchMinute(c, timeframeRef.current);
          }
          return "";
        },
      },
      localization: {
        priceFormatter: (price: number) => Math.round(price).toLocaleString(),
        timeFormatter: (time: Time) => {
          if (typeof time === "number") {
            const c = timeToCandleRef.current.get(time);
            if (c) return formatAxisMatchMinute(c, timeframeRef.current);
          }
          return "";
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Subtle #E8F5EF vertical highlight column behind GOAL candles
    const goalHighlightSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "goal-bg",
      base: 0,
      lastValueVisible: false,
      priceLineVisible: false,
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 1 },
      }),
    });
    goalHighlightSeries.priceScale().applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
      visible: false,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLOR_UP,
      downColor: COLOR_DOWN,
      borderVisible: false,
      wickUpColor: COLOR_UP,
      wickDownColor: COLOR_DOWN,
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 10,
      },
      autoscaleInfoProvider: (baseImpl: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const res = baseImpl();
        const balanced = balancedRangeRef.current;
        if (!res || !balanced) return res;
        return {
          priceRange: {
            minValue: Math.min(res.priceRange.minValue, balanced.minValue),
            maxValue: Math.max(res.priceRange.maxValue, balanced.maxValue),
          },
        };
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: COLOR_UP,
      topColor: "rgba(0, 168, 120, 0.22)",
      bottomColor: "rgba(0, 168, 120, 0.01)",
      lineWidth: 2,
      lineType: LineType.Curved,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      visible: false,
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 10,
      },
      autoscaleInfoProvider: (baseImpl: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const res = baseImpl();
        const balanced = balancedRangeRef.current;
        if (!res || !balanced) return res;
        return {
          priceRange: {
            minValue: Math.min(res.priceRange.minValue, balanced.minValue),
            maxValue: Math.max(res.priceRange.maxValue, balanced.maxValue),
          },
        };
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    const candleMarkers = createSeriesMarkers(candleSeries, []);
    const areaMarkers = createSeriesMarkers(areaSeries, []);

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time === undefined || typeof param.time !== "number") {
        notifyHoveredCandle(null);
        return;
      }
      const matched = timeToCandleRef.current.get(param.time) ?? null;
      notifyHoveredCandle(matched);
      if (selectedEventMinuteRef.current !== null) {
        const hoveredMinute = matched?.matchEvent?.minute ?? matched?.minute ?? null;
        if (hoveredMinute !== selectedEventMinuteRef.current) {
          selectedEventMinuteRef.current = null;
          setSelectedEventMinute(null);
        }
      }
    });

    chartRef.current = chart;
    goalHighlightSeriesRef.current = goalHighlightSeries;
    candleSeriesRef.current = candleSeries;
    areaSeriesRef.current = areaSeries;
    volumeSeriesRef.current = volumeSeries;
    candleMarkersRef.current = candleMarkers;
    areaMarkersRef.current = areaMarkers;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({
            width: Math.round(width),
            height: Math.round(height),
          });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      candleMarkers.detach();
      areaMarkers.detach();
      chart.remove();
      chartRef.current = null;
      goalHighlightSeriesRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
      candleMarkersRef.current = null;
      areaMarkersRef.current = null;
      notifyHoveredCandle(null);
    };
  }, [isOpen, notifyHoveredCandle]);

  // Sync data & chart mode (CANDLE vs LINE)
  useEffect(() => {
    if (!isOpen) return;
    const goalSeries = goalHighlightSeriesRef.current;
    const candleSeries = candleSeriesRef.current;
    const areaSeries = areaSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const candleMarkers = candleMarkersRef.current;
    const areaMarkers = areaMarkersRef.current;
    const chart = chartRef.current;

    if (
      !goalSeries ||
      !candleSeries ||
      !areaSeries ||
      !volumeSeries ||
      !candleMarkers ||
      !areaMarkers ||
      !chart
    ) {
      return;
    }

    const nextMap = new Map<number, CandleData>();

    const candleData = candles.map((c, idx) => {
      const t = toChartTime(idx);
      nextMap.set(t, c);
      return {
        time: t,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });

    const areaData = candles.map((c, idx) => ({
      time: toChartTime(idx),
      value: c.close,
    }));

    const goalHighlightData = candles.map((c, idx) => ({
      time: toChartTime(idx),
      value: c.event?.type === "GOAL" ? 1 : 0,
      color: c.event?.type === "GOAL" ? COLOR_MINT_SURFACE : "transparent",
    }));

    const volumeData = candles.map((c, idx) => {
      const isUp = c.close >= c.open;
      return {
        time: toChartTime(idx),
        value: c.volume,
        color: isUp ? "rgba(0, 168, 120, 0.25)" : "rgba(240, 120, 104, 0.25)",
      };
    });

    const markers: SeriesMarker<Time>[] = [];
    candles.forEach((c, idx) => {
      if (!c.event) return;
      const isNegative = (c.matchEvent?.priceImpactPercent ?? 0) < 0;
      const minute = c.matchEvent?.minute ?? c.minute ?? 0;
      markers.push({
        time: toChartTime(idx),
        position: isNegative ? "belowBar" : "aboveBar",
        color: isNegative ? COLOR_DOWN : COLOR_UP,
        shape: isNegative ? "arrowUp" : "arrowDown",
        text: getEventMarkerText(c.event.type, minute),
      });
    });

    const lineAccent = isDownOverall ? COLOR_DOWN : COLOR_UP;
    const areaTop = isDownOverall
      ? "rgba(240, 120, 104, 0.22)"
      : "rgba(0, 168, 120, 0.22)";
    const areaBottom = isDownOverall
      ? "rgba(240, 120, 104, 0.01)"
      : "rgba(0, 168, 120, 0.01)";

    // Balance Y-axis scale with generous breathing room so single-event spikes look well-proportioned
    if (candles.length > 0) {
      let minLow = candles[0].low;
      let maxHigh = candles[0].high;
      let maxSingleSpan = candles[0].high - candles[0].low;
      for (const c of candles) {
        if (c.low < minLow) minLow = c.low;
        if (c.high > maxHigh) maxHigh = c.high;
        const span = c.high - c.low;
        if (span > maxSingleSpan) maxSingleSpan = span;
      }
      const totalSpan = Math.max(120, maxHigh - minLow);
      if (maxSingleSpan > totalSpan * 0.45) {
        const targetSpan = maxSingleSpan / 0.45;
        const extra = targetSpan - totalSpan;
        balancedRangeRef.current = {
          minValue: Math.max(100, Math.round(minLow - extra * 0.55)),
          maxValue: Math.round(maxHigh + extra * 0.45),
        };
      } else {
        const pad = Math.max(50, Math.round(totalSpan * 0.14));
        balancedRangeRef.current = {
          minValue: Math.max(100, minLow - pad),
          maxValue: maxHigh + pad,
        };
      }
    } else {
      balancedRangeRef.current = null;
    }

    timeToCandleRef.current = nextMap;
    goalSeries.setData(goalHighlightData);
    candleSeries.setData(candleData);
    areaSeries.setData(areaData);
    volumeSeries.setData(volumeData);

    const isCandleMode = chartMode === "CANDLE";
    candleSeries.applyOptions({ visible: isCandleMode });
    volumeSeries.applyOptions({ visible: isCandleMode });
    areaSeries.applyOptions({
      visible: !isCandleMode,
      lineColor: lineAccent,
      topColor: areaTop,
      bottomColor: areaBottom,
    });

    candleMarkers.setMarkers(isCandleMode ? markers : []);
    areaMarkers.setMarkers(!isCandleMode ? markers : []);

    const viewKey = `${player?.id ?? ""}:${timeframe}:${preMatchMode}`;
    if (prevViewKeyRef.current !== viewKey) {
      prevViewKeyRef.current = viewKey;
      selectedEventMinuteRef.current = null;
      setSelectedEventMinute(null);
      notifyHoveredCandle(null);
      chart.timeScale().fitContent();
    }
  }, [
    isOpen,
    candles,
    player?.id,
    timeframe,
    preMatchMode,
    chartMode,
    isDownOverall,
    notifyHoveredCandle,
  ]);

  if (!isOpen || !player || !ssotMetrics) return null;

  const isWatched = watchlist.includes(player.id);
  const candleHigh =
    candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : openPrice;
  const candleLow =
    candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : openPrice;
  const allHigh =
    isViewingLastMatch && lastMatchReview
      ? timeframe !== "1D"
        ? Math.max(lastMatchReview.openPrice, candleHigh)
        : lastMatchReview.marketData.highPrice
      : matchStatus === "UPCOMING"
      ? openPrice
      : timeframe !== "1D"
      ? Math.max(openPrice, closePrice, candleHigh)
      : Math.max(player.highPrice ?? ssotMetrics.highPrice, closePrice);
  const allLow =
    isViewingLastMatch && lastMatchReview
      ? timeframe !== "1D"
        ? Math.min(lastMatchReview.openPrice, candleLow)
        : lastMatchReview.marketData.lowPrice
      : matchStatus === "UPCOMING"
      ? openPrice
      : timeframe !== "1D"
      ? Math.min(openPrice, closePrice, candleLow)
      : Math.min(player.lowPrice ?? ssotMetrics.lowPrice, closePrice);
  const isHalfTime = !isViewingLastMatch && matchClock.isHalfTime;

  const progressPct =
    isViewingLastMatch || matchStatus === "FT"
      ? 100
      : matchStatus === "UPCOMING"
      ? 0
      : Math.min(100, Math.max(0, Math.round((currentMinute / 90) * 100)));

  const summaryClosePrice =
    isViewingLastMatch && lastMatchReview
      ? lastMatchReview.marketData.currentPrice
      : closePrice;
  const summaryPctFromOpen =
    isViewingLastMatch && lastMatchReview
      ? calculateChangePercentFromOpen(
          lastMatchReview.marketData.currentPrice,
          lastMatchReview.openPrice
        )
      : pctFromOpen;

  const focusEventCandle = (minute: number) => {
    const idx = candles.findIndex(
      (c) => c.matchEvent?.minute === minute || c.minute === minute
    );
    if (idx < 0) return;
    selectedEventMinuteRef.current = minute;
    setSelectedEventMinute(minute);
    notifyHoveredCandle(candles[idx]);
    const chart = chartRef.current;
    if (chart) {
      const halfSpan = Math.max(4, Math.floor(candles.length * 0.25));
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(-1, idx - halfSpan),
        to: Math.min(candles.length + 1, idx + halfSpan),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#F7F9F8] animate-fade-in">
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col bg-[#F7F9F8] text-[#0F172A] overflow-hidden">
        {/* Tier 1: Slim Header Bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3.5 pb-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] transition hover:text-[#0F172A]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 items-baseline gap-1.5">
              <h2 className="truncate text-base font-bold tracking-[-0.02em] text-[#0F172A]">
                {formatPlayerDisplayName(player, "full")}
              </h2>
              <span className="shrink-0 text-xs font-medium text-[#64748B]">
                · {player.position} ·
              </span>
              <span className="shrink-0 font-sans tabular-nums text-xs font-semibold text-[#0F172A]">
                ★{player.stats.rating.toFixed(1)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleWatchlist(player.id)}
            aria-label={isWatched ? "관심선수 해제" : "관심선수 등록"}
            className={`flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition active:scale-95 ${
              isWatched
                ? "border-[#00A878]/30 bg-[#E8F5EF] text-[#00A878]"
                : "border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <span>관심</span>
            <Star
              className={`h-3.5 w-3.5 ${
                isWatched ? "fill-[#00A878] text-[#00A878]" : ""
              }`}
            />
          </button>
        </div>

        {/* Tier 2: Core Price & Change Badge */}
        <div className="flex shrink-0 items-baseline gap-2.5 px-4 pb-2.5">
          <span
            className={`font-sans tabular-nums text-[28px] font-extrabold leading-none tracking-[-0.03em] ${
              isUpOverall
                ? "text-[#00A878]"
                : isDownOverall
                ? "text-[#F07868]"
                : "text-[#0F172A]"
            }`}
          >
            {closePrice.toLocaleString()} P
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-sans tabular-nums text-xs font-bold tracking-[-0.02em] ${
              isUpOverall
                ? "bg-[#E8F5EF] text-[#00A878]"
                : isDownOverall
                ? "bg-[#F07868]/15 text-[#F07868]"
                : "bg-[#E2E8F0]/60 text-[#64748B]"
            }`}
          >
            {pctFromOpen > 0 ? "+" : ""}
            {pctFromOpen.toFixed(2)}% ({diffFromOpen > 0 ? "+" : ""}
            {diffFromOpen.toLocaleString()}P)
          </span>
        </div>

        {/* Tier 3: Timeframe Tabs + [캔들 | 라인] Mode Switcher */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2.5">
          <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] p-0.5 text-[11px] font-semibold">
            {TIMEFRAME_TABS.map((tf) => (
              <button
                key={tf.key}
                type="button"
                onClick={() => setTimeframe(tf.key)}
                className={`rounded-md px-2.5 py-1 transition ${
                  timeframe === tf.key
                    ? "bg-[#E8F5EF] text-[#00A878]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] p-0.5 text-[11px] font-semibold">
            {(
              [
                { key: "CANDLE", label: "캔들" },
                { key: "LINE", label: "라인" },
              ] as { key: ChartDisplayMode; label: string }[]
            ).map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setChartMode(mode.key)}
                className={`rounded-md px-2.5 py-1 transition ${
                  chartMode === mode.key
                    ? "bg-[#E8F5EF] text-[#00A878]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* FT / Last Match Review Summary Mode Bar */}
        {(matchStatus === "FT" || isViewingLastMatch) && (
          <div className="mx-4 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2 font-sans tabular-nums text-[11px]">
            <div className="flex items-center gap-1">
              <span className="text-[#64748B]">
                {isViewingLastMatch ? "직전 종가" : "최종 종가"}
              </span>
              <strong className="font-bold text-[#0F172A]">
                {summaryClosePrice.toLocaleString()}P
              </strong>
            </div>
            <span className="text-[#E2E8F0]">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[#64748B]">최고</span>
              <strong className="font-semibold text-[#00A878]">
                {allHigh.toLocaleString()}
              </strong>
            </div>
            <span className="text-[#E2E8F0]">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[#64748B]">최저</span>
              <strong className="font-semibold text-[#F07868]">
                {allLow.toLocaleString()}
              </strong>
            </div>
            <span className="text-[#E2E8F0]">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[#64748B]">변동</span>
              <strong
                className={`font-bold ${
                  summaryPctFromOpen > 0
                    ? "text-[#00A878]"
                    : summaryPctFromOpen < 0
                    ? "text-[#F07868]"
                    : "text-[#0F172A]"
                }`}
              >
                {summaryPctFromOpen > 0 ? "+" : ""}
                {summaryPctFromOpen.toFixed(1)}%
              </strong>
            </div>
          </div>
        )}

        {/* White Main Chart Surface + Floating 1-Line Crosshair HUD */}
        <div className="chart-surface-contain relative mx-4 flex-1 min-h-0 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF]">
          <CrosshairHud
            subscribe={subscribeHoveredCandle}
            getSnapshot={getHoveredCandleSnapshot}
            timeframe={timeframe}
            chartMode={chartMode}
          />

          {matchStatus === "UPCOMING" && !isViewingLastMatch && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#FFFFFF]/65 px-4 text-center backdrop-blur-[1px]">
              <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 border-t border-dashed border-[#CBD5E1]" />
              <div className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#FFFFFF]/95 px-3.5 py-2 text-xs font-semibold text-[#0F172A] shadow-sm">
                <span>⏱ KICK-OFF 대기 · 경기 시작 후 실시간 시세 및 이벤트 반영</span>
              </div>
              <p className="relative z-10 mt-2 font-sans tabular-nums text-[11px] font-medium text-[#64748B]">
                기준 시가{" "}
                <strong className="font-bold text-[#0F172A]">
                  {openPrice.toLocaleString()} P
                </strong>{" "}
                · 장전 매수/매도 주문 가능
              </p>
              <button
                type="button"
                onClick={() => setPreMatchMode("LAST_FT")}
                className="pointer-events-auto relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#00A878]/30 bg-[#E8F5EF] px-3.5 py-1.5 text-xs font-bold text-[#00A878] shadow-sm transition hover:bg-[#00A878] hover:text-white active:scale-95"
              >
                <span>📊 지난 경기 시세 차트 바로 보기 →</span>
              </button>
            </div>
          )}

          <div ref={chartContainerRef} className="h-full w-full" />
        </div>

        {/* PitchTrade Signature: MATCH TIMELINE Progress Bar + Event Chips */}
        <div className="shrink-0 px-4 pt-2.5 pb-1.5">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2">
            {matchStatus === "UPCOMING" && (
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#F1F5F9] pb-2">
                <span className="truncate text-[11px] font-semibold text-[#64748B]">
                  {isViewingLastMatch && lastMatchReview
                    ? lastMatchReview.matchLabel
                    : "오늘 경기 킥오프 대기 중"}
                </span>
                <div className="inline-flex shrink-0 rounded-lg border border-[#E2E8F0] bg-[#F7F9F8] p-0.5 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPreMatchMode("PRE")}
                    className={`rounded-md px-2 py-0.5 transition ${
                      preMatchMode === "PRE"
                        ? "bg-[#E8F5EF] text-[#00A878]"
                        : "text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    오늘 경기 (PRE)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreMatchMode("LAST_FT")}
                    className={`rounded-md px-2 py-0.5 transition ${
                      preMatchMode === "LAST_FT"
                        ? "bg-slate-900 text-white"
                        : "text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    지난 경기 (FT)
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#64748B]">
                  MATCH TIMELINE
                </span>
                {isViewingLastMatch ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 font-sans text-[10px] font-bold text-white">
                    LAST MATCH · FT
                  </span>
                ) : matchStatus === "UPCOMING" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-0.5 font-sans text-[10px] font-bold text-white">
                    <span>PRE</span>
                    <span className="text-slate-300 font-semibold">KICK-OFF 예정</span>
                  </span>
                ) : isHalfTime ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 font-sans tabular-nums text-[10px] font-bold text-white">
                    HT 45&apos;
                  </span>
                ) : matchStatus === "LIVE" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00A878] px-2.5 py-0.5 font-sans tabular-nums text-[10px] font-bold text-white">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    {matchClock.chartLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 font-sans text-[10px] font-bold text-white">
                    FULL TIME
                  </span>
                )}
                {!isViewingLastMatch && (playerMatch || activeMatchContext) && (
                  <span className="font-mono text-[10px] font-extrabold text-[#0F172A] tabular-nums">
                    {playerMatch?.homeTeam.shortName ??
                      activeMatchContext?.homeTeam}{" "}
                    {matchScore.display}{" "}
                    {playerMatch?.awayTeam.shortName ??
                      activeMatchContext?.awayTeam}
                  </span>
                )}
              </div>
              <span className="font-sans tabular-nums text-[10px] font-semibold text-[#64748B]">
                0&apos; —{" "}
                <span
                  className={
                    isHalfTime
                      ? "rounded bg-amber-500/15 px-1 py-0.5 font-bold text-amber-600"
                      : ""
                  }
                >
                  HT 45&apos;
                </span>{" "}
                — 90&apos;
              </span>
            </div>

            <div className="relative h-2 w-full rounded-full bg-[#E2E8F0]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isHalfTime ? "bg-amber-500" : "bg-[#00A878]"
                }`}
                style={{ width: `${progressPct}%` }}
              />
              {/* Center HT 45' tick mark */}
              <span
                className={`absolute top-1/2 left-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  isHalfTime ? "bg-amber-500" : "bg-[#CBD5E1]"
                }`}
              />
              {/* Event marker dots along the 0'-90' timeline track */}
              {sortedEventsAsc.map((ev) => {
                const posPct = Math.min(98, Math.max(2, (ev.minute / 90) * 100));
                const isNeg = ev.priceImpactPercent < 0;
                const dotColor =
                  ev.type === "YELLOW_CARD"
                    ? "bg-amber-400"
                    : isNeg
                    ? "bg-[#F07868]"
                    : "bg-[#00A878]";
                return (
                  <button
                    key={`track-pin-${ev.id}`}
                    type="button"
                    onClick={() => focusEventCandle(ev.minute)}
                    title={`${ev.minute}' ${getEventChipLabel(ev.type)}`}
                    className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition hover:scale-125 ${dotColor}`}
                    style={{ left: `${posPct}%` }}
                  />
                );
              })}
            </div>

            {sortedEventsAsc.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {sortedEventsAsc.map((ev) => {
                  const cfg = EVENT_PIN_CONFIG[ev.type] ?? EVENT_PIN_CONFIG.GOAL;
                  const isSelected = selectedEventMinute === ev.minute;
                  const impact = ev.priceImpactPercent;

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => focusEventCandle(ev.minute)}
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        isSelected
                          ? "border-[#00A878]/40 bg-[#E8F5EF] text-[#0F172A]"
                          : "border-[#E2E8F0] bg-[#F7F9F8] text-[#0F172A] hover:border-[#00A878]/30"
                      }`}
                    >
                      <span>{cfg.icon}</span>
                      <span className="font-sans tabular-nums text-[#64748B]">
                        {formatMinuteLabel(ev.minute)}
                      </span>
                      <span>{getEventChipLabel(ev.type)}</span>
                      <span
                        className={`font-sans tabular-nums text-[10px] font-bold ${
                          impact > 0
                            ? "text-[#00A878]"
                            : impact < 0
                            ? "text-[#F07868]"
                            : "text-[#64748B]"
                        }`}
                      >
                        {impact > 0 ? "+" : ""}
                        {impact.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Safe-Area Action Bar: Direct Buy / Sell Trigger */}
        <div className="shrink-0 bg-[#F7F9F8] px-4 pt-1.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSelectTrade) onSelectTrade(player, "BUY");
              }}
              className="flex h-12 items-center justify-center rounded-xl bg-[#00A878] text-sm font-semibold text-white transition hover:bg-[#00A878]/90 active:scale-[0.98]"
            >
              매수 주문하기
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSelectTrade) onSelectTrade(player, "SELL");
              }}
              className="flex h-12 items-center justify-center rounded-xl bg-[#F07868] text-sm font-semibold text-white transition hover:bg-[#F07868]/90 active:scale-[0.98]"
            >
              매도 주문하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
