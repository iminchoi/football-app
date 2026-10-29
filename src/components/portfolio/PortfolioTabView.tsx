"use client";

import React, { useState } from "react";
import {
  Briefcase,
  History,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ShoppingBag,
  RotateCcw,
  Wallet,
  Award,
  ChevronRight,
  Lock,
  LogIn,
} from "lucide-react";
import { useTradeStore, roundToTen } from "@/store/useTradeStore";
import { INITIAL_CASH } from "@/data/dummyData";
import { Player, TradeType } from "@/types";

interface PortfolioTabViewProps {
  onSelectPlayerTrade: (player: Player, type: TradeType) => void;
  onOpenAuthModal?: () => void;
}

export default function PortfolioTabView({
  onSelectPlayerTrade,
  onOpenAuthModal,
}: PortfolioTabViewProps) {
  const user = useTradeStore((s) => s.user);
  const cash = useTradeStore((s) => s.cash);
  const realizedPnL = useTradeStore((s) => s.realizedPnL);
  const players = useTradeStore((s) => s.players);
  const holdings = useTradeStore((s) => s.holdings);
  const transactions = useTradeStore((s) => s.transactions);
  const setActiveTab = useTradeStore((s) => s.setActiveTab);
  const resetAll = useTradeStore((s) => s.resetAll);
  const [subTab, setSubTab] = useState<"HOLDINGS" | "HISTORY">("HOLDINGS");

  const handleResetPortfolio = () => {
    if (
      window.confirm(
        "보유 자산(100,000 P)과 모든 보유 선수 및 거래 내역을 초기 상태로 리셋하시겠습니까?"
      )
    ) {
      resetAll();
    }
  };

  const holdingItems = Object.values(holdings)
    .map((h) => {
      const player = players.find((p) => p.id === h.playerId);
      if (!player || h.quantity <= 0) return null;

      const avgPrice = roundToTen(h.avgBuyPrice);
      const curPrice = roundToTen(player.currentPrice);
      const invested = roundToTen(avgPrice * h.quantity);
      const currentVal = roundToTen(curPrice * h.quantity);
      const profit = roundToTen(currentVal - invested);
      const profitRate =
        invested > 0 ? Number(((profit / invested) * 100).toFixed(2)) : 0;

      return {
        holding: h,
        player,
        avgPrice,
        curPrice,
        invested,
        currentVal,
        profit,
        profitRate,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const totalInvested = holdingItems.reduce((s, i) => s + i.invested, 0);
  const totalValuation = holdingItems.reduce((s, i) => s + i.currentVal, 0);
  const totalAssets = roundToTen(cash + totalValuation);

  // 총 평가 손익 및 전체 수익률
  const totalUnrealizedProfit = roundToTen(totalValuation - totalInvested);
  const totalUnrealizedRate =
    totalInvested > 0
      ? Number(((totalUnrealizedProfit / totalInvested) * 100).toFixed(2))
      : 0;

  const isTotalUp = totalUnrealizedProfit > 0;
  const isTotalDown = totalUnrealizedProfit < 0;

  const safeRealizedPnL = roundToTen(realizedPnL ?? 0);
  const isRealizedUp = safeRealizedPnL > 0;
  const isRealizedDown = safeRealizedPnL < 0;

  const cashPercent =
    totalAssets > 0 ? Math.round((cash / totalAssets) * 100) : 100;
  const stockPercent = 100 - cashPercent;

  if (!user) {
    return (
      <div className="px-4 pt-6 pb-8">
        <div className="rounded-3xl border border-gray-200 bg-white py-14 px-6 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-base font-extrabold text-gray-900">
            로그인이 필요한 서비스입니다
          </h2>
          <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
            마이 포트폴리오 자산 현황, 보유 선수 평가 손익 및<br />
            포인트 거래 내역은 로그인 후 확인하실 수 있습니다.
          </p>
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#00985f] px-6 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#007f4f] active:scale-95"
          >
            <LogIn className="h-4 w-4" />
            <span>로그인하여 자산 확인</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      {/* 1. 상단 총 자산 요약 대시보드 카드 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Top Row: Title + Cumulative Realized PnL Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-[#00985f]">
              <Wallet className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-extrabold text-gray-800">
              총 보유 자산 대시보드
            </span>
          </div>

          {/* 누적 실현 손익(realizedPnL) 뱃지 */}
          <div
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold border ${
              isRealizedUp
                ? "bg-emerald-50 text-[#00985f] border-emerald-200"
                : isRealizedDown
                ? "bg-rose-50 text-rose-600 border-rose-200"
                : "bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            <Award className="h-3 w-3 shrink-0" />
            <span>누적 실현 손익</span>
            <span className="font-mono">
              {isRealizedUp ? "+" : ""}
              {safeRealizedPnL.toLocaleString()} P
            </span>
          </div>
        </div>

        {/* Main Asset Value & Total Unrealized PnL / Return Rate */}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium text-gray-400">
              총 보유 자산 (현금 + 선수 평가액)
            </p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-mono text-2xl font-black tracking-tight text-gray-900">
                {totalAssets.toLocaleString()}
              </span>
              <span className="text-xs font-extrabold text-gray-500">P</span>
            </div>
          </div>

          {/* 총 평가 손익 및 전체 수익률 */}
          <div className="text-right">
            <span className="text-[11px] font-medium text-gray-400 block">
              총 평가 손익 · 수익률
            </span>
            <div
              className={`mt-1 inline-flex items-center gap-1 rounded-xl px-2.5 py-1 font-mono text-xs font-extrabold ${
                isTotalUp
                  ? "bg-emerald-50 text-[#00985f]"
                  : isTotalDown
                  ? "bg-rose-50 text-rose-600"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {isTotalUp ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : isTotalDown ? (
                <TrendingDown className="h-3.5 w-3.5" />
              ) : null}
              <span>
                {isTotalUp ? "+" : ""}
                {totalUnrealizedProfit.toLocaleString()} P (
                {isTotalUp ? "+" : ""}
                {totalUnrealizedRate.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Allocation Progress Bar */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
            <span className="font-semibold text-gray-700">자산 구성 비중</span>
            <span className="font-mono">
              선수 {stockPercent}% · 현금 {cashPercent}%
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              style={{ width: `${stockPercent}%` }}
              className="bg-[#00985f] transition-all duration-500"
            />
            <div
              style={{ width: `${cashPercent}%` }}
              className="bg-gray-300 transition-all duration-500"
            />
          </div>
        </div>

        {/* 3 Key Breakdown Metrics: Cash + Player Valuation + Invested Principal */}
        <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl bg-[#f8f9fa] p-2.5 text-center border border-gray-100">
          <div>
            <span className="text-[11px] text-gray-400 block">
              보유 현금(Cash)
            </span>
            <span className="mt-0.5 font-mono text-xs font-extrabold text-gray-900 block">
              {cash.toLocaleString()} P
            </span>
          </div>
          <div className="border-x border-gray-200/70">
            <span className="text-[11px] text-gray-400 block">
              선수 총 평가액
            </span>
            <span className="mt-0.5 font-mono text-xs font-extrabold text-[#00985f] block">
              {totalValuation.toLocaleString()} P
            </span>
          </div>
          <div>
            <span className="text-[11px] text-gray-400 block">총 매입원금</span>
            <span className="mt-0.5 font-mono text-xs font-bold text-gray-700 block">
              {totalInvested.toLocaleString()} P
            </span>
          </div>
        </div>

        {/* Reset Assets & History Button */}
        <div className="mt-3 border-t border-gray-100 pt-2.5 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            종목 터치 시 즉시 <strong className="text-gray-600">매도 창</strong>이
            열립니다
          </span>
          <button
            type="button"
            onClick={handleResetPortfolio}
            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 transition hover:bg-rose-600 hover:text-white active:scale-95"
          >
            <RotateCcw className="h-3 w-3" />
            <span>초기화</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation: Holdings vs Point History */}
      <div className="grid grid-cols-2 rounded-xl bg-gray-200/75 p-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setSubTab("HOLDINGS")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
            subTab === "HOLDINGS"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>보유 선수 ({holdingItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab("HISTORY")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
            subTab === "HISTORY"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>거래/포인트 내역 ({transactions.length})</span>
        </button>
      </div>

      {/* 2 & 3. 보유 선수 목록 or 미보유 시 Empty State */}
      {subTab === "HOLDINGS" ? (
        holdingItems.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-12 px-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="text-sm font-extrabold text-gray-800">
              보유 중인 선수가 없습니다
            </p>
            <p className="mt-1 text-xs text-gray-500">
              실시간 경기 라인업과 시세 차트에서 유망한 선수를 매수해보세요!
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("MATCHES")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#00985f] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#007f4f] active:scale-95"
            >
              <span>경기 보러가기</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {holdingItems.map(
              ({
                holding,
                player,
                avgPrice,
                curPrice,
                invested,
                currentVal,
                profit,
                profitRate,
              }) => {
                const isUp = profit > 0;
                const isDown = profit < 0;

                return (
                  <div
                    key={player.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectPlayerTrade(player, "SELL")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectPlayerTrade(player, "SELL");
                      }
                    }}
                    className="group cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition hover:border-[#00985f]/50 hover:shadow-md active:scale-[0.995]"
                  >
                    {/* Top Row: 선수 프로필 + 보유 주수 & 평가 손익 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          style={{ backgroundColor: player.teamColor }}
                          className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-white font-mono shadow-sm"
                        >
                          <span className="text-[9px] font-semibold opacity-85 leading-none">
                            {player.teamShort}
                          </span>
                          <span className="text-xs font-black mt-0.5">
                            {player.backNumber}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-extrabold text-gray-900 truncate">
                              {player.name}
                            </h3>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                              {player.position}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-[#00985f] border border-emerald-200/60">
                              {holding.quantity}주 보유
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-gray-400 truncate">
                            {player.teamName} · 평가액{" "}
                            <span className="font-mono font-semibold text-gray-600">
                              {currentVal.toLocaleString()} P
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Right: 평가 손익 및 수익률 */}
                      <div className="text-right font-mono shrink-0">
                        <div className="flex items-center justify-end gap-0.5">
                          <span
                            className={`text-sm font-black ${
                              isUp
                                ? "text-[#00985f]"
                                : isDown
                                ? "text-rose-600"
                                : "text-gray-700"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {profit.toLocaleString()} P
                          </span>
                          <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-[#00985f] transition" />
                        </div>
                        <span
                          className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
                            isUp
                              ? "bg-emerald-50 text-[#00985f]"
                              : isDown
                              ? "bg-rose-50 text-rose-600"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {isUp ? "+" : ""}
                          {profitRate.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: 보유 주수 · 평단가 · 현재가 · 매입원금 */}
                    <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl bg-[#f8f9fa] px-3 py-2 text-[11px] border border-gray-100">
                      <div>
                        <span className="text-gray-400 block">보유 주수</span>
                        <strong className="font-mono text-gray-900">
                          {holding.quantity}주
                        </strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block">평단가</span>
                        <strong className="font-mono text-gray-800">
                          {avgPrice.toLocaleString()} P
                        </strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block">현재가</span>
                        <strong
                          className={`font-mono ${
                            curPrice > avgPrice
                              ? "text-[#00985f]"
                              : curPrice < avgPrice
                              ? "text-rose-600"
                              : "text-gray-900"
                          }`}
                        >
                          {curPrice.toLocaleString()} P
                        </strong>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-400 block">매수 원금</span>
                        <strong className="font-mono text-gray-700">
                          {invested.toLocaleString()} P
                        </strong>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlayerTrade(player, "BUY");
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 py-2 text-xs font-bold text-[#00985f] transition hover:bg-[#00985f] hover:text-white"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span>추가 매수</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlayerTrade(player, "SELL");
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl bg-rose-50 border border-rose-200 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-600 hover:text-white"
                      >
                        <TrendingDown className="h-3.5 w-3.5" />
                        <span>매도하기</span>
                      </button>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )
      ) : (
        /* SubTab 2: Point Transaction History */
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {transactions.length === 0 ? (
            <div className="py-12 px-4 text-center text-xs text-gray-400">
              아직 매수/매도 포인트 거래 내역이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((tx) => {
                const isBuy = tx.type === "BUY";
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-extrabold text-[11px] ${
                          isBuy
                            ? "bg-emerald-50 text-[#00985f] border border-emerald-200"
                            : "bg-rose-50 text-rose-600 border border-rose-200"
                        }`}
                      >
                        {isBuy ? "매수" : "매도"}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-gray-900">
                            {tx.playerName}{" "}
                            <span className="font-mono font-semibold text-gray-500">
                              {tx.quantity}주
                            </span>
                          </p>
                          {!isBuy && tx.realizedPnL !== undefined && (
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                tx.realizedPnL > 0
                                  ? "bg-emerald-50 text-[#00985f]"
                                  : tx.realizedPnL < 0
                                  ? "bg-rose-50 text-rose-600"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              실현 {tx.realizedPnL > 0 ? "+" : ""}
                              {tx.realizedPnL.toLocaleString()}P
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 font-mono">
                          {tx.timestamp} · 단가 {tx.unitPrice.toLocaleString()}P
                        </p>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <p
                        className={`font-bold ${
                          isBuy ? "text-gray-900" : "text-[#00985f]"
                        }`}
                      >
                        {isBuy ? "-" : "+"}
                        {tx.totalAmount.toLocaleString()} P
                      </p>
                      <p className="text-[10px] text-gray-400">
                        잔액 {tx.balanceAfter.toLocaleString()} P
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
