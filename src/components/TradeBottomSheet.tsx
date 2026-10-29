"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Zap,
  BarChart3,
} from "lucide-react";
import {
  useTradeStore,
  roundToTen,
  clampToPriceLimit,
} from "@/store/useTradeStore";
import { Player, TradeType } from "@/types";
import PlayerDetailModal from "@/components/PlayerDetailModal";

interface TradeBottomSheetProps {
  playerId: string | null;
  initialTradeType?: TradeType;
  onClose: () => void;
  onRequireAuth?: () => void;
}

type ChartPeriod = "TICK" | "1M" | "1D" | "1W" | "1M_MONTH";

interface PeriodPoint {
  timeLabel: string;
  price: number;
}

interface TimelineEventItem {
  minuteLabel: string;
  icon: string;
  title: string;
  rateLabel: string;
  badgeStyle: string;
}

type StatGaugeTier = "HIGH" | "MID" | "LOW";

interface FotMobStatBarItem {
  label: string;
  valueText: string;
  percent: number; // 0 ~ 100
  tier: StatGaugeTier; // HIGH=emerald, MID=amber, LOW=rose
}

interface ToastNotificationState {
  id: number;
  message: string;
  tradeType: TradeType | "AUTH";
  visible: boolean;
}

const MAX_PRICE_MULTIPLIER = 1.3;
const MIN_PRICE_MULTIPLIER = 0.7;

const PERIOD_TABS: { key: ChartPeriod; label: string; desc: string }[] = [
  { key: "TICK", label: "실시간 틱", desc: "5초 단위 실시간 체결 추이" },
  { key: "1M", label: "1분", desc: "경기 중 분봉 추이 (최근 20분)" },
  { key: "1D", label: "일", desc: "최근 14일 일별 종가 추이" },
  { key: "1W", label: "주", desc: "최근 12주 주간 시세 흐름" },
  { key: "1M_MONTH", label: "월", desc: "최근 6개월 시즌 월간 추이" },
];

// Deterministic pseudo-random helper seeded by player id + salt
function seededNoise(seedStr: string, index: number): number {
  let h = 2166136261;
  const str = `${seedStr}-${index}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function buildPeriodSeries(
  player: Player,
  period: ChartPeriod
): PeriodPoint[] {
  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const currentPrice = roundToTen(player.currentPrice);

  if (period === "TICK") {
    const raw = (player.priceHistory ?? []).slice(-18);
    if (raw.length >= 2) {
      return raw.map((p) => ({
        timeLabel: p.timeLabel,
        price: roundToTen(p.price),
      }));
    }
    return [
      { timeLabel: "기준가", price: basePrice },
      { timeLabel: "현재", price: currentPrice },
    ];
  }

  if (period === "1M") {
    const count = 16;
    const points: PeriodPoint[] = [];
    let cursor = basePrice;
    for (let i = 0; i < count; i++) {
      const minuteMark = Math.max(1, 55 + i * 2);
      if (i === count - 1) {
        points.push({ timeLabel: `${minuteMark}'`, price: currentPrice });
      } else {
        const n = seededNoise(`${player.id}-1M`, i);
        const drift =
          ((currentPrice - basePrice) / count) * (0.65 + n * 0.7);
        const wave = (n - 0.48) * basePrice * 0.028;
        cursor = clampToPriceLimit(cursor + drift + wave, basePrice);
        points.push({ timeLabel: `${minuteMark}'`, price: cursor });
      }
    }
    return points;
  }

  if (period === "1D") {
    const count = 14;
    const points: PeriodPoint[] = [];
    const now = new Date();
    let cursor = clampToPriceLimit(
      basePrice * (0.94 + seededNoise(player.id, 101) * 0.08),
      basePrice
    );
    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (count - 1 - i));
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      if (i === count - 1) {
        points.push({ timeLabel: label, price: currentPrice });
      } else {
        const n = seededNoise(`${player.id}-1D`, i);
        const step = (n - 0.47) * basePrice * 0.045;
        cursor = clampToPriceLimit(cursor + step, basePrice);
        points.push({ timeLabel: label, price: cursor });
      }
    }
    return points;
  }

  if (period === "1W") {
    const count = 12;
    const points: PeriodPoint[] = [];
    let cursor = clampToPriceLimit(
      basePrice * (0.9 + seededNoise(player.id, 202) * 0.12),
      basePrice
    );
    for (let i = 0; i < count; i++) {
      const label = `${count - 1 - i}주전`;
      if (i === count - 1) {
        points.push({ timeLabel: "이번주", price: currentPrice });
      } else {
        const n = seededNoise(`${player.id}-1W`, i);
        const step = (n - 0.46) * basePrice * 0.06;
        cursor = clampToPriceLimit(cursor + step, basePrice);
        points.push({ timeLabel: label, price: cursor });
      }
    }
    return points;
  }

  // "1M_MONTH" (월봉: 최근 6개월)
  const months = ["11월", "12월", "1월", "2월", "3월", "4월"];
  let cursor = clampToPriceLimit(
    basePrice * (0.88 + seededNoise(player.id, 303) * 0.14),
    basePrice
  );
  return months.map((mLabel, idx) => {
    if (idx === months.length - 1) {
      return { timeLabel: mLabel, price: currentPrice };
    }
    const n = seededNoise(`${player.id}-MONTH`, idx);
    cursor = clampToPriceLimit(
      cursor + (n - 0.45) * basePrice * 0.075,
      basePrice
    );
    return { timeLabel: mLabel, price: cursor };
  });
}

// Build 3-line real-time match event timeline tailored to position & player state
function buildPlayerEventTimeline(player: Player): TimelineEventItem[] {
  const seed = Math.round(seededNoise(player.id, 77) * 100);
  const pos = player.position;
  const goals = player.stats?.goals ?? 0;
  const assists = player.stats?.assists ?? 0;

  if (pos === "GK") {
    return [
      {
        minuteLabel: `${62 + (seed % 18)}'`,
        icon: "🧤",
        title: "박스 안 결정적 슈퍼세이브",
        rateLabel: "+3.5%",
        badgeStyle: "bg-emerald-50 text-[#00985f] border border-emerald-200",
      },
      {
        minuteLabel: `${38 + (seed % 15)}'`,
        icon: "🎯",
        title: "역습 기점 정확한 롱킥 연결",
        rateLabel: "+1.2%",
        badgeStyle: "bg-blue-50 text-blue-600 border border-blue-200",
      },
      {
        minuteLabel: `${14 + (seed % 12)}'`,
        icon: "🛡️",
        title: "코너킥 공중볼 안정적 캐칭",
        rateLabel: "+0.8%",
        badgeStyle: "bg-gray-100 text-gray-700 border border-gray-200",
      },
    ];
  }

  if (pos === "DF") {
    return [
      {
        minuteLabel: `${67 + (seed % 15)}'`,
        icon: "🛡️",
        title: "페널티박스 결정적 태클 차단",
        rateLabel: "+2.8%",
        badgeStyle: "bg-emerald-50 text-[#00985f] border border-emerald-200",
      },
      {
        minuteLabel: `${41 + (seed % 14)}'`,
        icon: "👟",
        title: "전방 침투 패스 인터셉트",
        rateLabel: "+1.5%",
        badgeStyle: "bg-blue-50 text-blue-600 border border-blue-200",
      },
      {
        minuteLabel: `${19 + (seed % 10)}'`,
        icon: "⚡",
        title: "공중볼 경합 승리 후 빌드업",
        rateLabel: "+1.0%",
        badgeStyle: "bg-gray-100 text-gray-700 border border-gray-200",
      },
    ];
  }

  if (pos === "MF") {
    return [
      {
        minuteLabel: `${58 + (seed % 20)}'`,
        icon: assists > 0 ? "🅰️" : "👟",
        title:
          assists > 0
            ? "결정적 스루패스 어시스트 기록"
            : "수비 라인 허무는 핵심 키패스",
        rateLabel: assists > 0 ? "+5.0%" : "+1.8%",
        badgeStyle: "bg-emerald-50 text-[#00985f] border border-emerald-200",
      },
      {
        minuteLabel: `${34 + (seed % 12)}'`,
        icon: "🎯",
        title: "아크 정면 날카로운 유효슈팅",
        rateLabel: "+1.5%",
        badgeStyle: "bg-blue-50 text-blue-600 border border-blue-200",
      },
      {
        minuteLabel: `${15 + (seed % 10)}'`,
        icon: "⚡",
        title: "중원 탈압박 드리블 돌파 성공",
        rateLabel: "+1.0%",
        badgeStyle: "bg-gray-100 text-gray-700 border border-gray-200",
      },
    ];
  }

  // Default FW
  return [
    {
      minuteLabel: `${24 + (seed % 35)}'`,
      icon: "⚽",
      title:
        goals > 0
          ? "골 득점 성공 (결정적 피니시)"
          : "박스 안 위협적인 침투 슈팅",
      rateLabel: goals > 0 ? "+8.0%" : "+2.4%",
      badgeStyle: "bg-emerald-50 text-[#00985f] border border-emerald-200",
    },
    {
      minuteLabel: `${18 + (seed % 10)}'`,
      icon: "🎯",
      title: "유효슈팅 (골문 구석 강슛)",
      rateLabel: "+1.5%",
      badgeStyle: "bg-blue-50 text-blue-600 border border-blue-200",
    },
    {
      minuteLabel: `${11 + (seed % 6)}'`,
      icon: "👟",
      title: "동료 찬스 연결 키패스",
      rateLabel: "+1.0%",
      badgeStyle: "bg-gray-100 text-gray-700 border border-gray-200",
    },
  ];
}

// Build FotMob-style horizontal gauge bar stats (7 rows per position)
function buildFotMobStats(player: Player): FotMobStatBarItem[] {
  const seed = Math.round(seededNoise(player.id, 99) * 100);
  const pos = player.position;
  const goals = player.stats?.goals ?? 0;
  const assists = player.stats?.assists ?? 0;

  if (pos === "FW") {
    const xg = (0.42 + goals * 0.68 + (seed % 45) * 0.01).toFixed(2);
    const totalShots = Math.max(goals + 2, 3 + (seed % 3));
    const shotsOnTarget = Math.max(
      goals + 1,
      Math.min(totalShots, (player.stats?.shotsOnTarget ?? 2) + (seed % 2))
    );
    const chancesCreated = Math.max(1, (player.stats?.keyPasses ?? 1) + (seed % 2));
    const dribbleTotal = 4 + (seed % 3);
    const dribbleSuccess = Math.min(dribbleTotal, 2 + (seed % 3));
    const dribblePct = Math.round((dribbleSuccess / dribbleTotal) * 100);
    const touchesInBox = 6 + goals * 2 + (seed % 5);
    const bigChanceMissed = seed % 4 === 0 ? 1 : 0;

    return [
      {
        label: "득점 (예상 골 xG)",
        valueText: `${goals} (${xg})`,
        percent: goals > 0 ? Math.min(96, 68 + goals * 14) : 45,
        tier: goals > 0 ? "HIGH" : "MID",
      },
      {
        label: "유효 슈팅",
        valueText: `${shotsOnTarget}/${totalShots}`,
        percent: Math.round((shotsOnTarget / totalShots) * 100),
        tier: shotsOnTarget >= 2 ? "HIGH" : "MID",
      },
      {
        label: "기회 창출",
        valueText: `${chancesCreated}회`,
        percent: Math.min(92, 32 + chancesCreated * 20),
        tier: chancesCreated >= 2 ? "HIGH" : "MID",
      },
      {
        label: "드리블 성공 %",
        valueText: `${dribbleSuccess}/${dribbleTotal} (${dribblePct}%)`,
        percent: dribblePct,
        tier: dribblePct >= 60 ? "HIGH" : "MID",
      },
      {
        label: "어시스트",
        valueText: `${assists}`,
        percent: assists > 0 ? Math.min(95, 70 + assists * 15) : 8,
        tier: assists > 0 ? "HIGH" : "LOW",
      },
      {
        label: "상대 박스 내 터치",
        valueText: `${touchesInBox}회`,
        percent: Math.min(94, 52 + touchesInBox * 4),
        tier: "HIGH",
      },
      {
        label: "빅 찬스 미스 (결정적 기회 놓침)",
        valueText: `${bigChanceMissed}회`,
        percent: bigChanceMissed === 0 ? 88 : 16,
        tier: bigChanceMissed === 0 ? "HIGH" : "LOW",
      },
    ];
  }

  if (pos === "MF") {
    const passPct = 85 + (seed % 10);
    const longTotal = 7 + (seed % 4);
    const longSuccess = Math.min(longTotal, 5 + (seed % 3));
    const longPct = Math.round((longSuccess / longTotal) * 100);
    const chances = 2 + assists + (seed % 3);
    const xa = (0.28 + assists * 0.45 + (seed % 30) * 0.01).toFixed(2);
    const dribblePct = 52 + (seed % 34);
    const duelPct = 48 + (seed % 32);
    const keyPasses = Math.max(2, (player.stats?.keyPasses ?? 2) + assists + (seed % 3));
    const tacklesInterceptions = 3 + (seed % 4);

    return [
      {
        label: "성공한 패스 %",
        valueText: `${passPct}.0%`,
        percent: passPct,
        tier: "HIGH",
      },
      {
        label: "정확한 긴 패스 %",
        valueText: `${longSuccess}/${longTotal} (${longPct}%)`,
        percent: longPct,
        tier: longPct >= 68 ? "HIGH" : "MID",
      },
      {
        label: "기회 창출 (예상 어시스트 xA)",
        valueText: `${chances} (${xa})`,
        percent: Math.min(94, 45 + chances * 14),
        tier: chances >= 3 ? "HIGH" : "MID",
      },
      {
        label: "드리블 성공 %",
        valueText: `${dribblePct}.4%`,
        percent: dribblePct,
        tier: dribblePct >= 65 ? "HIGH" : "MID",
      },
      {
        label: "볼 경합 성공 %",
        valueText: `${duelPct}.2%`,
        percent: duelPct,
        tier: duelPct >= 62 ? "HIGH" : "MID",
      },
      {
        label: "키패스 / 찬스 메이킹",
        valueText: `${keyPasses}회`,
        percent: Math.min(93, 55 + keyPasses * 8),
        tier: "HIGH",
      },
      {
        label: "태클 및 가로채기 성공",
        valueText: `${tacklesInterceptions}회`,
        percent: Math.min(88, 44 + tacklesInterceptions * 9),
        tier: tacklesInterceptions >= 5 ? "HIGH" : "MID",
      },
    ];
  }

  if (pos === "DF") {
    const tackleTotal = 4 + (seed % 3);
    const tackleWon = Math.min(tackleTotal, 3 + (seed % 2));
    const tacklePct = Math.round((tackleWon / tackleTotal) * 100);
    const aerialPct = 60 + (seed % 28);
    const interceptions = 2 + (seed % 4);
    const longPct = 55 + (seed % 28);
    const passPct = 86 + (seed % 10);
    const clearances = 4 + (seed % 4);
    const blocks = 1 + (seed % 3);

    return [
      {
        label: "태클 성공 %",
        valueText: `${tackleWon}/${tackleTotal} (${tacklePct}%)`,
        percent: tacklePct,
        tier: tacklePct >= 70 ? "HIGH" : "MID",
      },
      {
        label: "공중 볼 경합 성공 %",
        valueText: `${aerialPct}.0%`,
        percent: aerialPct,
        tier: aerialPct >= 65 ? "HIGH" : "MID",
      },
      {
        label: "가로채기",
        valueText: `${interceptions}회`,
        percent: Math.min(92, 38 + interceptions * 14),
        tier: interceptions >= 3 ? "HIGH" : "MID",
      },
      {
        label: "정확한 긴 패스 %",
        valueText: `${longPct}.5%`,
        percent: longPct,
        tier: longPct >= 68 ? "HIGH" : "MID",
      },
      {
        label: "패스 성공 %",
        valueText: `${passPct}.2%`,
        percent: passPct,
        tier: "HIGH",
      },
      {
        label: "클리어링 (걷어내기)",
        valueText: `${clearances}회`,
        percent: Math.min(92, 54 + clearances * 6),
        tier: "HIGH",
      },
      {
        label: "슈팅 블로킹",
        valueText: `${blocks}회`,
        percent: Math.min(84, 42 + blocks * 14),
        tier: blocks >= 3 ? "HIGH" : "MID",
      },
    ];
  }

  // GK (7 items)
  const saves = 3 + (seed % 4);
  const shotsFaced = saves + (seed % 2);
  const savePct = Math.round((saves / Math.max(1, shotsFaced)) * 100);
  const prevented = (0.35 + (seed % 50) * 0.01).toFixed(2);
  const passPct = 78 + (seed % 15);
  const longPct = 48 + (seed % 26);
  const highClaims = 3 + (seed % 3);
  const sweeperClearances = 1 + (seed % 3);

  return [
    {
      label: "유효슈팅 선방(세이브)",
      valueText: `${saves}/${shotsFaced} (${savePct}%)`,
      percent: savePct,
      tier: "HIGH",
    },
    {
      label: "예방한 실점 (xGOT 대비)",
      valueText: `+${prevented}`,
      percent: Math.min(92, 55 + Math.round(parseFloat(prevented) * 40)),
      tier: "HIGH",
    },
    {
      label: "패스 성공 %",
      valueText: `${passPct}.0%`,
      percent: passPct,
      tier: "HIGH",
    },
    {
      label: "정확한 긴 패스 %",
      valueText: `${longPct}.5%`,
      percent: longPct,
      tier: "MID",
    },
    {
      label: "펀칭/캐칭 실책",
      valueText: "0건",
      percent: 8,
      tier: "LOW",
    },
    {
      label: "공중볼 경합/캐칭 성공",
      valueText: `${highClaims}회`,
      percent: Math.min(92, 62 + highClaims * 6),
      tier: "HIGH",
    },
    {
      label: "박스 밖 스위핑 걷어내기",
      valueText: `${sweeperClearances}회`,
      percent: Math.min(78, 42 + sweeperClearances * 12),
      tier: "MID",
    },
  ];
}

function getGaugeBarColor(tier: StatGaugeTier): string {
  if (tier === "HIGH") return "bg-[#10b981]"; // FotMob signature green
  if (tier === "MID") return "bg-[#f59e0b]"; // FotMob orange/amber
  return "bg-[#f43f5e]"; // FotMob rose/red
}

export default function TradeBottomSheet({
  playerId,
  initialTradeType = "BUY",
  onClose,
  onRequireAuth,
}: TradeBottomSheetProps) {
  const user = useTradeStore((state) => state.user);
  const players = useTradeStore((state) => state.players);
  const cash = useTradeStore((state) => state.cash);
  const holdings = useTradeStore((state) => state.holdings);
  const buyPlayer = useTradeStore((state) => state.buyPlayer);
  const sellPlayer = useTradeStore((state) => state.sellPlayer);

  const [tradeType, setTradeType] = useState<TradeType>(initialTradeType);
  const [quantity, setQuantity] = useState<number>(1);
  const [period, setPeriod] = useState<ChartPeriod>("TICK");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [toast, setToast] = useState<ToastNotificationState | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRemoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useMemo(
    () => players.find((p) => p.id === playerId) ?? null,
    [players, playerId]
  );

  useEffect(() => {
    if (playerId) {
      setTradeType(initialTradeType);
      setQuantity(1);
      setFeedback(null);
      setHoverIdx(null);
      setIsDetailModalOpen(false);
    }
  }, [playerId, initialTradeType]);

  useEffect(() => {
    setHoverIdx(null);
  }, [period]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (toastRemoveRef.current) clearTimeout(toastRemoveRef.current);
    };
  }, []);

  const triggerToast = (
    message: string,
    executedTradeType: TradeType | "AUTH"
  ) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (toastRemoveRef.current) clearTimeout(toastRemoveRef.current);

    const id = Date.now();
    setToast({ id, message, tradeType: executedTradeType, visible: true });

    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) =>
        prev && prev.id === id ? { ...prev, visible: false } : prev
      );
    }, 2200);

    toastRemoveRef.current = setTimeout(() => {
      setToast((prev) => (prev && prev.id === id ? null : prev));
    }, 2600);
  };

  if (!playerId || !player) return null;

  const holding = holdings[player.id];
  const ownedQty = holding?.quantity ?? 0;
  const avgBuyPrice = holding ? roundToTen(holding.avgBuyPrice) : 0;

  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const currentPrice = roundToTen(player.currentPrice);
  const diffFromBase = currentPrice - basePrice;
  const pctFromBase = basePrice > 0 ? (diffFromBase / basePrice) * 100 : 0;

  // Unrealized PnL for owned holdings
  const unrealizedPnL =
    ownedQty > 0 ? roundToTen((currentPrice - avgBuyPrice) * ownedQty) : 0;
  const unrealizedPct =
    ownedQty > 0 && avgBuyPrice > 0
      ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
      : 0;

  const maxCapPrice = roundToTen(basePrice * MAX_PRICE_MULTIPLIER);
  const minFloorPrice = roundToTen(basePrice * MIN_PRICE_MULTIPLIER);

  // Period chart series
  const series = buildPeriodSeries(player, period);
  const periodStartPrice = series[0]?.price ?? basePrice;
  const periodDiff = currentPrice - periodStartPrice;
  const periodPct =
    periodStartPrice > 0 ? (periodDiff / periodStartPrice) * 100 : 0;
  const isUp = period === "TICK" ? pctFromBase >= 0 : periodDiff >= 0;

  // Timeline & 7-Row FotMob Gauge Stats
  const timelineEvents = buildPlayerEventTimeline(player);
  const fotMobStats = buildFotMobStats(player);

  // Max purchasable or sellable quantity
  const maxBuyQty = Math.max(0, Math.floor(cash / currentPrice));
  const maxSellQty = ownedQty;
  const maxQty = tradeType === "BUY" ? maxBuyQty : maxSellQty;

  const totalAmount = roundToTen(currentPrice * quantity);
  const balanceAfter =
    tradeType === "BUY"
      ? roundToTen(cash - totalAmount)
      : roundToTen(cash + totalAmount);
  const holdingsAfter =
    tradeType === "BUY"
      ? ownedQty + quantity
      : Math.max(0, ownedQty - quantity);

  // Allow clicking confirm when unauthenticated so Auth Guard can intercept & open AuthModal
  const canExecute = !user
    ? quantity >= 1
    : quantity >= 1 &&
      (tradeType === "BUY" ? totalAmount <= cash : quantity <= ownedQty);

  const handleAdjust = (delta: number) => {
    setFeedback(null);
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (maxQty > 0 && next > maxQty) return maxQty;
      return next;
    });
  };

  const handleSetMax = () => {
    setFeedback(null);
    if (maxQty >= 1) {
      setQuantity(maxQty);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Auth Guard: Block trade execution when user is not logged in
    if (!user) {
      const authMsg = "로그인이 필요한 서비스입니다.";
      setFeedback({
        type: "error",
        text: authMsg,
      });
      triggerToast(`🔒 ${authMsg}`, "AUTH");
      if (onRequireAuth) {
        onRequireAuth();
      }
      return;
    }

    const execQty = quantity;

    if (tradeType === "BUY") {
      const res = buyPlayer(player.id, execQty);
      const unitExec = res.executedPrice ?? currentPrice;
      const execTotal = roundToTen(unitExec * execQty);
      setFeedback({
        type: res.success ? "success" : "error",
        text: res.message,
      });
      if (res.success) {
        triggerToast(
          `✓ 체결 완료: ${player.name} ${execQty}주를 ${execTotal.toLocaleString()}P (단가 ${unitExec.toLocaleString()}P)에 매수했습니다.`,
          "BUY"
        );
      }
    } else {
      const res = sellPlayer(player.id, execQty);
      const unitExec = res.executedPrice ?? currentPrice;
      const execTotal = roundToTen(unitExec * execQty);
      setFeedback({
        type: res.success ? "success" : "error",
        text: res.message,
      });
      if (res.success) {
        triggerToast(
          `✓ 체결 완료: ${player.name} ${execQty}주를 ${execTotal.toLocaleString()}P (단가 ${unitExec.toLocaleString()}P)에 매도했습니다.`,
          "SELL"
        );
      }
    }
  };

  // --- Professional HTS SVG Chart Geometry ---
  const prices = series.map((p) => p.price);
  const allPrices = [...prices, basePrice];
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const spread = Math.max(rawMax - rawMin, roundToTen(basePrice * 0.04), 100);
  const minP = Math.max(minFloorPrice, roundToTen(rawMin - spread * 0.15));
  const maxP = Math.min(maxCapPrice, roundToTen(rawMax + spread * 0.15));
  const rangeP = Math.max(maxP - minP, 100);

  const svgW = 360;
  const svgH = 152;
  const padLeft = 8;
  const padRight = 50;
  const padTop = 14;
  const padBottom = 22;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const getX = (idx: number) =>
    series.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (idx / (series.length - 1)) * plotW;

  const getY = (price: number) =>
    padTop + plotH - ((price - minP) / rangeP) * plotH;

  const coords = series.map((pt, idx) => ({
    x: getX(idx),
    y: getY(pt.price),
    ...pt,
  }));

  const polylineStr = coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const areaStr =
    coords.length > 0
      ? `${coords[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} ${polylineStr} ${coords[
          coords.length - 1
        ].x.toFixed(1)},${(padTop + plotH).toFixed(1)}`
      : "";

  const baseLineY = Math.max(
    padTop,
    Math.min(padTop + plotH, getY(basePrice))
  );

  const strokeColor = isUp ? "#00985f" : "#2563eb";
  const activePoint =
    hoverIdx !== null && coords[hoverIdx]
      ? coords[hoverIdx]
      : coords[coords.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] animate-fade-in">
      {/* Top-Center Floating Order Execution Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 z-[70] w-[92%] max-w-[440px] -translate-x-1/2 pointer-events-none transition-all duration-300 ${
            toast.visible
              ? "translate-y-0 opacity-100 scale-100"
              : "-translate-y-2 opacity-0 scale-95"
          }`}
        >
          <div
            className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-xs font-extrabold text-white shadow-xl border ${
              toast.tradeType === "AUTH"
                ? "bg-rose-600 border-rose-400/40"
                : toast.tradeType === "BUY"
                ? "bg-[#00985f] border-emerald-400/40"
                : "bg-blue-600 border-blue-400/40"
            }`}
          >
            {toast.tradeType === "AUTH" ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-white" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
            )}
            <span className="leading-snug">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Expanded Half-Full Bottom Sheet Container (h-[90vh] max-h-[92vh]) */}
      <div className="relative z-10 flex h-[90vh] max-h-[92vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl overflow-hidden">
        {/* Top Grab Handle */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <div className="h-1.5 w-11 rounded-full bg-gray-300" />
        </div>

        {/* Sticky Top Header: Player Profile + Live Price + Buy/Sell Mode Switch */}
        <div className="shrink-0 border-b border-gray-100 px-5 pb-2.5 pt-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-gray-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                  #{player.backNumber}
                </span>
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-700">
                  {player.position}
                </span>
                <span className="text-xs font-semibold text-gray-500">
                  {player.teamName}
                </span>
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#00985f]">
                  ★ {(player.stats?.rating ?? 7.0).toFixed(1)}
                </span>
              </div>
              <h3 className="mt-0.5 text-lg font-black tracking-tight text-gray-900">
                {player.name}
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-800"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Current Price & Buy/Sell Mode Selector Row */}
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-black tracking-tight text-gray-900">
                  {currentPrice.toLocaleString()} P
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-xs font-extrabold ${
                    isUp
                      ? "bg-emerald-50 text-[#00985f]"
                      : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {isUp ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {isUp ? "+" : ""}
                  {(period === "TICK" ? pctFromBase : periodPct).toFixed(2)}%
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                기준가 {basePrice.toLocaleString()}P · 상한{" "}
                {maxCapPrice.toLocaleString()}P / 하한{" "}
                {minFloorPrice.toLocaleString()}P
              </p>
            </div>

            {/* Compact Buy / Sell Switch */}
            <div className="grid grid-cols-2 rounded-xl bg-[#f1f3f5] p-1 w-36 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setTradeType("BUY");
                  setFeedback(null);
                }}
                className={`rounded-lg py-1.5 text-xs font-extrabold transition ${
                  tradeType === "BUY"
                    ? "bg-[#00985f] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                매수
              </button>
              <button
                type="button"
                onClick={() => {
                  setTradeType("SELL");
                  setFeedback(null);
                }}
                className={`rounded-lg py-1.5 text-xs font-extrabold transition ${
                  tradeType === "SELL"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                매도
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Middle Area: Chart + Event Timeline + 7-Row FotMob Gauge Stats */}
        <div className="flex-1 overflow-y-auto px-5 py-2.5 space-y-2.5">
          {/* A. Professional Stock HTS Chart Card */}
          <div className="rounded-2xl border border-gray-200/90 bg-[#f8f9fa] p-3">
            {/* Period Selector Tabs: [실시간 틱] [1분] [일] [주] [월] */}
            <div className="flex items-center justify-between gap-1 rounded-xl bg-gray-200/75 p-1">
              {PERIOD_TABS.map((tab) => {
                const active = period === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPeriod(tab.key)}
                    className={`flex-1 rounded-lg py-1 text-[11px] font-extrabold transition ${
                      active
                        ? "bg-gray-900 text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Chart Sub-header */}
            <div className="mt-2 flex items-center justify-between px-0.5 text-[11px]">
              <span className="font-semibold text-gray-500">
                {PERIOD_TABS.find((t) => t.key === period)?.desc}
              </span>
              {activePoint && (
                <span className="font-mono font-bold text-gray-800">
                  {activePoint.timeLabel} ·{" "}
                  <strong
                    className={isUp ? "text-[#00985f]" : "text-blue-600"}
                  >
                    {activePoint.price.toLocaleString()} P
                  </strong>
                </span>
              )}
            </div>

            {/* Expanded Main Chart Area */}
            <div className="relative mt-1.5 h-44 w-full rounded-xl bg-white border border-gray-100 p-2 shadow-inner">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="h-full w-full overflow-visible select-none"
                onMouseLeave={() => setHoverIdx(null)}
              >
                <defs>
                  <linearGradient id="htsGradUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00985f" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#00985f" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="htsGradDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0, 0.5, 1].map((ratio, idx) => {
                  const yPos = padTop + plotH * ratio;
                  const priceVal = roundToTen(maxP - rangeP * ratio);
                  return (
                    <g key={idx}>
                      <line
                        x1={padLeft}
                        x2={padLeft + plotW}
                        y1={yPos}
                        y2={yPos}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft + plotW + 6}
                        y={yPos + 3}
                        className="fill-gray-400 font-mono text-[9px]"
                      >
                        {priceVal.toLocaleString()}
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={padLeft}
                  x2={padLeft + plotW}
                  y1={baseLineY}
                  y2={baseLineY}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                  strokeWidth="1.2"
                />
                <text
                  x={padLeft + plotW + 6}
                  y={baseLineY + 3}
                  className="fill-slate-500 font-mono text-[9px] font-bold"
                >
                  기준가
                </text>

                {areaStr && (
                  <polygon
                    points={areaStr}
                    fill={isUp ? "url(#htsGradUp)" : "url(#htsGradDown)"}
                  />
                )}

                <polyline
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylineStr}
                />

                {coords.length >= 3 &&
                  [
                    coords[0],
                    coords[Math.floor(coords.length / 2)],
                    coords[coords.length - 1],
                  ].map((pt, i) => (
                    <text
                      key={i}
                      x={pt.x}
                      y={svgH - 4}
                      textAnchor={
                        i === 0 ? "start" : i === 2 ? "end" : "middle"
                      }
                      className="fill-gray-400 font-mono text-[9px]"
                    >
                      {pt.timeLabel}
                    </text>
                  ))}

                {activePoint && (
                  <g>
                    <line
                      x1={activePoint.x}
                      x2={activePoint.x}
                      y1={padTop}
                      y2={padTop + plotH}
                      stroke="#64748b"
                      strokeDasharray="2 2"
                      strokeWidth="1"
                    />
                    <circle
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r={4}
                      fill={strokeColor}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    {hoverIdx !== null && (
                      <g
                        transform={`translate(${Math.min(
                          Math.max(activePoint.x - 52, padLeft),
                          padLeft + plotW - 104
                        )}, ${Math.max(2, activePoint.y - 32)})`}
                      >
                        <rect
                          width="104"
                          height="22"
                          rx="6"
                          fill="#0f172a"
                          opacity="0.92"
                        />
                        <text
                          x="52"
                          y="14"
                          textAnchor="middle"
                          className="fill-white font-mono text-[10px] font-bold"
                        >
                          {activePoint.timeLabel} ·{" "}
                          {activePoint.price.toLocaleString()}P
                        </text>
                      </g>
                    )}
                  </g>
                )}

                {coords.map((pt, idx) => {
                  const sliceW = plotW / Math.max(1, coords.length);
                  return (
                    <rect
                      key={idx}
                      x={pt.x - sliceW / 2}
                      y={padTop}
                      width={sliceW}
                      height={plotH}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoverIdx(idx)}
                      onTouchStart={() => setHoverIdx(idx)}
                    />
                  );
                })}
              </svg>
            </div>
          </div>

          {/* B. Middle-Upper: Real-time Event Timeline (3-Line Feed) */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-[#00985f]" />
                <span className="text-xs font-extrabold text-gray-800">
                  실시간 경기 이벤트 타임라인
                </span>
              </div>
              <span className="text-[10px] font-medium text-gray-400">
                최근 시세 변동 요인
              </span>
            </div>

            <div className="space-y-1">
              {timelineEvents.map((ev, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1 border border-gray-100 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 shrink-0 font-mono text-[11px] font-bold text-gray-400">
                      {ev.minuteLabel}
                    </span>
                    <span className="shrink-0 text-xs">{ev.icon}</span>
                    <span className="truncate text-xs font-semibold text-gray-700">
                      {ev.title}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold ${ev.badgeStyle}`}
                  >
                    {ev.rateLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* C. Middle-Lower: FotMob Style Horizontal Gauge Bar Stats (7 Rows) */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-[#00985f]" />
                <span className="text-xs font-extrabold text-gray-800">
                  오늘 경기 핵심 스탯 ({player.position})
                </span>
              </div>
              <span className="text-[10px] font-medium text-gray-400">
                FotMob 퍼포먼스 지표 (7개 항목)
              </span>
            </div>

            <div className="space-y-1.5">
              {fotMobStats.map((stat, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1.3fr_auto_1fr] items-center gap-2 text-xs"
                >
                  {/* Left: Stat Label */}
                  <span className="truncate text-[11px] font-medium text-gray-600">
                    {stat.label}
                  </span>

                  {/* Center: Numeric Value (Right-aligned next to vertical divider like FotMob) */}
                  <div className="flex items-center gap-2">
                    <span className="min-w-[52px] text-right font-mono text-[11px] font-extrabold text-gray-900">
                      {stat.valueText}
                    </span>
                    <span className="h-3 w-[1px] bg-gray-200" />
                  </div>

                  {/* Right: FotMob Horizontal Gauge Bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200/80">
                    <div
                      style={{
                        width: `${Math.max(5, Math.min(100, stat.percent))}%`,
                      }}
                      className={`h-full rounded-full transition-all duration-500 ${getGaugeBarColor(
                        stat.tier
                      )}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Entry Button to Open Player Detail Modal */}
            <button
              type="button"
              onClick={() => setIsDetailModalOpen(true)}
              className="mt-3 w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
            >
              <span>📊 선수 상세 프로필 및 시즌 통계 보기 ➔</span>
            </button>
          </div>
        </div>

        {/* Sticky Bottom Order Execution Section with Mobile Safe Area Padding */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-gray-200/80 bg-white px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-2"
        >
          {/* Slim '내 보유 현황' Bar directly above Order Quantity Selector */}
          <div className="flex h-9 items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5">
            {ownedQty > 0 ? (
              <div className="flex w-full items-center justify-between text-[11px] font-medium text-gray-600">
                <span>
                  내 보유:{" "}
                  <strong className="font-mono font-extrabold text-gray-900">
                    {ownedQty}주
                  </strong>
                </span>
                <span className="text-gray-300">|</span>
                <span>
                  평균단가:{" "}
                  <strong className="font-mono font-bold text-gray-800">
                    {avgBuyPrice.toLocaleString()} P
                  </strong>
                </span>
                <span className="text-gray-300">|</span>
                <span>
                  평가손익:{" "}
                  <strong
                    className={`font-mono font-extrabold ${
                      unrealizedPnL >= 0 ? "text-[#00985f]" : "text-blue-600"
                    }`}
                  >
                    {unrealizedPnL >= 0 ? "+" : ""}
                    {unrealizedPnL.toLocaleString()} P (
                    {unrealizedPnL >= 0 ? "+" : ""}
                    {unrealizedPct.toFixed(1)}%)
                  </strong>
                </span>
              </div>
            ) : (
              <span className="text-xs font-medium text-gray-400">
                현재 미보유 종목입니다 (첫 매수 가능)
              </span>
            )}
          </div>

          {/* Compact Resized Quantity Selector Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-extrabold text-gray-800 block">
                주문 수량 선택
              </span>
              <span className="text-[11px] text-gray-500">
                {tradeType === "BUY" ? "주문 가능" : "보유 수량"}:{" "}
                <strong className="font-mono text-gray-900">{maxQty}주</strong>
                {ownedQty > 0 && tradeType === "BUY" && (
                  <span className="ml-1 text-gray-400">
                    (보유 {ownedQty}주)
                  </span>
                )}
              </span>
            </div>

            {/* Compact Controller Cluster: [-] [w-20 Input] [+] [+5] [MAX] */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleAdjust(-1)}
                disabled={quantity <= 1}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 transition hover:bg-gray-100 active:scale-95 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <div className="relative w-20 shrink-0">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setQuantity(Number.isNaN(v) || v < 1 ? 1 : v);
                    setFeedback(null);
                  }}
                  className="h-9 w-full rounded-xl border border-gray-200 bg-[#f8f9fa] pr-5 pl-2 text-center font-mono text-sm font-black text-gray-900 focus:border-[#00985f] focus:bg-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">
                  주
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleAdjust(1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 transition hover:bg-gray-100 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleAdjust(5)}
                className="h-9 rounded-xl bg-[#f1f3f5] px-2.5 font-mono text-xs font-bold text-gray-700 transition hover:bg-gray-200 active:scale-95"
              >
                +5
              </button>

              <button
                type="button"
                onClick={handleSetMax}
                disabled={maxQty <= 0}
                className="h-9 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 font-mono text-xs font-extrabold text-[#00985f] transition hover:bg-emerald-100 active:scale-95 disabled:opacity-40"
              >
                MAX
              </button>
            </div>
          </div>

          {/* [보유 잔액 변화 안내] -> [총 필요 포인트] */}
          <div className="rounded-2xl bg-[#f8f9fa] border border-gray-200/80 px-3.5 py-2 space-y-1 text-xs">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              {user ? (
                <>
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3 w-3 text-gray-400" />
                    보유 {cash.toLocaleString()} P → 잔여{" "}
                    <strong
                      className={
                        balanceAfter < 0 ? "text-rose-600" : "text-gray-800"
                      }
                    >
                      {balanceAfter.toLocaleString()} P
                    </strong>
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <ShoppingBag className="h-3 w-3 text-gray-400" />
                    {ownedQty}주 →{" "}
                    <strong className="text-[#00985f]">{holdingsAfter}주</strong>
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1 text-gray-500 font-semibold">
                  <Wallet className="h-3 w-3 text-gray-400" />
                  로그인 후 보유 포인트 및 주문 가능 수량을 확인할 수 있습니다
                </span>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200/70 pt-1">
              <span className="font-bold text-gray-900">
                {tradeType === "BUY" ? "총 필요 포인트" : "총 매도 정산 포인트"}
              </span>
              <span
                className={`font-mono text-base font-black ${
                  tradeType === "BUY" ? "text-[#00985f]" : "text-blue-600"
                }`}
              >
                {totalAmount.toLocaleString()} P
              </span>
            </div>
          </div>

          {/* Error Alert (when order fails) */}
          {feedback && feedback.type === "error" && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{feedback.text}</span>
            </div>
          )}

          {/* [매수/매도 확정 버튼] with active:scale-95 transition-transform */}
          <button
            type="submit"
            disabled={!canExecute}
            className={`w-full rounded-2xl py-3 text-sm font-extrabold text-white shadow-md transition-transform active:scale-95 ${
              !canExecute
                ? "cursor-not-allowed bg-gray-300 text-gray-500 shadow-none"
                : tradeType === "BUY"
                ? "bg-[#00985f] hover:bg-[#007f4f]"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {tradeType === "BUY"
              ? `${player.name} ${quantity}주 매수 확정`
              : `${player.name} ${quantity}주 매도 확정`}
          </button>
        </form>
      </div>

      {/* Fullscreen Player Detail & Season Statistics Modal */}
      <PlayerDetailModal
        player={player}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />
    </div>
  );
}
