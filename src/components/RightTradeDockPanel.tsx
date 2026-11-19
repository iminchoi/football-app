"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Star,
  AlertTriangle,
  Lock,
  LogIn,
  CheckCircle2,
  Minus,
  Plus,
} from "lucide-react";
import {
  useTradeStore,
  roundToTen,
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
  getAvailableShares,
  normalizeAccountKey,
} from "@/store/useTradeStore";
import { TradeType } from "@/types";
import { getTierConfig } from "@/utils/tier";
import MatchTimelineChart from "@/components/market/MatchTimelineChart";
import FullScreenCandleChartModal from "@/components/market/FullScreenCandleChartModal";

interface RightTradeDockPanelProps {
  playerId: string | null;
  tradeType: TradeType;
  onChangeTradeType: (type: TradeType) => void;
  onClose: () => void;
  onRequireAuth: () => void;
}

export default function RightTradeDockPanel({
  playerId,
  tradeType,
  onChangeTradeType,
  onClose,
  onRequireAuth,
}: RightTradeDockPanelProps) {
  const user = useTradeStore((s) => s.user);
  const cash = useTradeStore((s) => s.cash);
  const players = useTradeStore((s) => s.players);
  const holdings = useTradeStore((s) => s.holdings);
  const accounts = useTradeStore((s) => s.accounts);
  const watchlist = useTradeStore((s) => s.watchlist);
  const toggleWatchlist = useTradeStore((s) => s.toggleWatchlist);
  const buyPlayer = useTradeStore((s) => s.buyPlayer);
  const sellPlayer = useTradeStore((s) => s.sellPlayer);

  const [quantity, setQuantity] = useState<number>(1);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isCandleModalOpen, setIsCandleModalOpen] = useState<boolean>(false);

  useEffect(() => {
    setQuantity(1);
    setFeedback(null);
  }, [playerId, tradeType]);

  const player = playerId
    ? players.find((p) => p.id === playerId) ?? null
    : null;

  if (!player) return null;

  const basePrice = roundToTen(
    player.basePrice ?? player.initialPrice ?? player.currentPrice
  );
  const openPrice = roundToTen(
    player.openPrice ?? player.priceHistory[0]?.price ?? basePrice
  );
  const capPrice = roundToTen(basePrice * 1.3);
  const floorPrice = roundToTen(basePrice * 0.7);
  const isAtUpperLimit = player.currentPrice >= capPrice;
  const isAtLowerLimit = player.currentPrice <= floorPrice;

  const diff = calculateDiffFromOpen(player.currentPrice, openPrice);
  const pct = calculateChangePercentFromOpen(player.currentPrice, openPrice);
  const isUp = diff > 0;
  const isDown = diff < 0;
  const isWatched = watchlist.includes(player.id);

  const tierCfg = getTierConfig(basePrice);
  const availableShares = getAvailableShares(
    player,
    holdings,
    accounts,
    user ? normalizeAccountKey(user.id) : undefined
  );
  const holdingQty = user ? holdings[player.id]?.quantity ?? 0 : 0;

  const maxBuyQty = user
    ? Math.min(
        availableShares,
        Math.floor(cash / Math.max(1, player.currentPrice))
      )
    : 0;
  const maxQty = tradeType === "BUY" ? maxBuyQty : holdingQty;
  const totalAmount = roundToTen(player.currentPrice * quantity);

  const handleSubmitOrder = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (quantity <= 0) {
      setFeedback({ type: "error", text: "1주 이상 입력해주세요." });
      return;
    }
    if (tradeType === "BUY") {
      if (isAtUpperLimit) {
        setFeedback({
          type: "error",
          text: "상한가(+30%) 도달로 추가 매수가 제한됩니다.",
        });
        return;
      }
      const res = buyPlayer(player.id, quantity);
      setFeedback({
        type: res.success ? "success" : "error",
        text: res.message,
      });
    } else {
      if (isAtLowerLimit) {
        setFeedback({
          type: "error",
          text: "하한가(-30%) 도달로 매도가 제한됩니다.",
        });
        return;
      }
      const res = sellPlayer(player.id, quantity);
      setFeedback({
        type: res.success ? "success" : "error",
        text: res.message,
      });
    }
  };

  return (
    <>
      <aside className="hidden lg:flex w-[380px] shrink-0 sticky top-[64px] max-h-[calc(100vh-64px)] flex-col border-l border-gray-200/80 bg-[#FFFFFF]">
        {/* Docked Panel Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              style={{ backgroundColor: player.teamColor }}
              className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-white font-mono"
            >
              <span className="text-[8px] font-semibold opacity-85 leading-none">
                {player.teamShort}
              </span>
              <span className="text-xs font-black">{player.backNumber}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-extrabold text-gray-900">
                  {player.name}
                </h3>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                  {player.position}
                </span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#00A878]">
                  {tierCfg.tier}티어
                </span>
              </div>
              <p className="truncate text-[11px] text-gray-500">
                {player.teamName} · 평점 {player.stats.rating.toFixed(1)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => toggleWatchlist(player.id)}
              title={isWatched ? "관심선수 해제" : "관심선수 등록"}
              className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100"
            >
              <Star
                className={`h-4 w-4 ${
                  isWatched ? "fill-amber-400 text-amber-400" : "text-gray-300"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="트레이딩 패널 닫기"
              className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Single Inner Scrollable Container */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 space-y-3.5">
          {/* Price Summary */}
          <div className="flex items-baseline justify-between">
            <div>
              <span className="font-mono text-2xl font-black tracking-tight text-gray-900">
                {player.currentPrice.toLocaleString()}
              </span>
              <span className="ml-0.5 text-xs font-bold text-gray-500">P</span>
            </div>
            <span
              className={`rounded-lg px-2 py-0.5 font-mono text-xs font-extrabold ${
                isUp
                  ? "bg-[#00A878]/10 text-[#00A878]"
                  : isDown
                  ? "bg-[#F07868]/10 text-[#F07868]"
                  : "bg-gray-100 text-[#A8B2BC]"
              }`}
            >
              {isUp ? "+" : ""}
              {diff.toLocaleString()}P ({isUp ? "+" : ""}
              {pct.toFixed(2)}%)
            </span>
          </div>

          {/* Match Timeline & Candle Summary */}
          <MatchTimelineChart
            player={player}
            onOpenFullScreenCandle={() => setIsCandleModalOpen(true)}
          />

          {/* Instant Order Form */}
          <div className="rounded-2xl border border-gray-200/90 bg-[#F7F9F8] p-3.5 space-y-3">
            <div className="grid grid-cols-2 rounded-xl bg-gray-200/80 p-1 text-xs font-extrabold">
              <button
                type="button"
                onClick={() => onChangeTradeType("BUY")}
                className={`rounded-lg py-2 transition ${
                  tradeType === "BUY"
                    ? "bg-[#00A878] text-white shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                매수
              </button>
              <button
                type="button"
                onClick={() => onChangeTradeType("SELL")}
                className={`rounded-lg py-2 transition ${
                  tradeType === "SELL"
                    ? "bg-[#F07868] text-white shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                매도
              </button>
            </div>

            {/* Price Cap / Floor Guard Notice */}
            {((tradeType === "BUY" && isAtUpperLimit) ||
              (tradeType === "SELL" && isAtLowerLimit)) && (
              <div className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {tradeType === "BUY"
                    ? `상한가(+30%, ${capPrice.toLocaleString()}P) 도달로 매수가 제한됩니다.`
                    : `하한가(-30%, ${floorPrice.toLocaleString()}P) 도달로 매도가 제한됩니다.`}
                </span>
              </div>
            )}

            {/* Quantity Stepper */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
              <span className="text-xs font-bold text-gray-500">주문 수량</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, maxQty || 999)}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-12 text-center font-mono text-sm font-black text-gray-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((q) => Math.min(Math.max(1, maxQty || 999), q + 1))
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Quick % Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "10%", ratio: 0.1 },
                { label: "25%", ratio: 0.25 },
                { label: "50%", ratio: 0.5 },
                { label: "최대", ratio: 1 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  disabled={!user || maxQty <= 0}
                  onClick={() =>
                    setQuantity(Math.max(1, Math.floor(maxQty * btn.ratio)))
                  }
                  className="rounded-lg border border-gray-200 bg-white py-1.5 text-[11px] font-bold text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Balance & Supply Info */}
            <div className="space-y-1 text-[11px] font-medium text-gray-500">
              <div className="flex justify-between">
                <span>
                  {tradeType === "BUY" ? "주문 가능 포인트" : "보유 수량"}
                </span>
                <span className="font-mono font-bold text-gray-800">
                  {user
                    ? tradeType === "BUY"
                      ? `${cash.toLocaleString()}P`
                      : `${holdingQty}주`
                    : "로그인 필요"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>시장 잔여 유통량</span>
                <span className="font-mono font-bold text-gray-800">
                  {availableShares.toLocaleString()}주
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200/80 pt-1.5 text-xs font-extrabold text-gray-900">
                <span>예상 주문 금액</span>
                <span className="font-mono">{totalAmount.toLocaleString()}P</span>
              </div>
            </div>

            {feedback && (
              <div
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold ${
                  feedback.type === "success"
                    ? "bg-emerald-50 text-[#00A878] border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            {user ? (
              <button
                type="button"
                disabled={
                  (tradeType === "BUY" &&
                    (isAtUpperLimit || availableShares <= 0)) ||
                  (tradeType === "SELL" &&
                    (isAtLowerLimit || holdingQty <= 0))
                }
                onClick={handleSubmitOrder}
                className={`flex h-11 w-full items-center justify-center rounded-xl text-sm font-extrabold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-45 ${
                  tradeType === "BUY"
                    ? "bg-[#00A878] hover:bg-[#00985f]"
                    : "bg-[#F07868] hover:bg-[#e56756]"
                }`}
              >
                {tradeType === "BUY"
                  ? `${quantity}주 매수하기`
                  : `${quantity}주 매도하기`}
              </button>
            ) : (
              <button
                type="button"
                onClick={onRequireAuth}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gray-900 text-xs font-extrabold text-white transition hover:bg-gray-800"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>로그인 후 즉시 주문하기</span>
                <LogIn className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <FullScreenCandleChartModal
        player={player}
        isOpen={isCandleModalOpen}
        onClose={() => setIsCandleModalOpen(false)}
        onSelectTrade={(p, type) => {
          onChangeTradeType(type);
          setIsCandleModalOpen(false);
        }}
      />
    </>
  );
}
