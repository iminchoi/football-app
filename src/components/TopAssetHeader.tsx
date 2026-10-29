"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  User,
  LogOut,
  LogIn,
  Lock,
  ChevronRight,
} from "lucide-react";
import { useTradeStore, roundToTen } from "@/store/useTradeStore";
import { INITIAL_CASH } from "@/data/dummyData";

interface TopAssetHeaderProps {
  countdown: number;
  onOpenAuthModal: () => void;
}

export default function TopAssetHeader({
  countdown,
  onOpenAuthModal,
}: TopAssetHeaderProps) {
  const user = useTradeStore((s) => s.user);
  const cash = useTradeStore((s) => s.cash);
  const realizedPnL = useTradeStore((s) => s.realizedPnL);
  const players = useTradeStore((s) => s.players);
  const holdings = useTradeStore((s) => s.holdings);
  const logout = useTradeStore((s) => s.logout);
  const setActiveTab = useTradeStore((s) => s.setActiveTab);

  let holdingsValue = 0;
  let holdingsInvested = 0;

  for (const h of Object.values(holdings)) {
    if (h.quantity <= 0) continue;
    const p = players.find((pl) => pl.id === h.playerId);
    if (!p) continue;
    holdingsValue += roundToTen(p.currentPrice) * h.quantity;
    holdingsInvested += roundToTen(h.avgBuyPrice) * h.quantity;
  }

  const totalAssets = roundToTen(cash + holdingsValue);
  const unrealizedPnL = roundToTen(holdingsValue - holdingsInvested);
  const totalTradingProfit = roundToTen(unrealizedPnL + (realizedPnL ?? 0));
  const basePrincipal = holdingsInvested > 0 ? holdingsInvested : INITIAL_CASH;
  const profitPercent = ((totalTradingProfit / basePrincipal) * 100).toFixed(2);
  const isUp = totalTradingProfit > 0;
  const isDown = totalTradingProfit < 0;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200/80 px-4 pt-3 pb-3">
      {/* Row 1: FotMob-inspired Brand Header + Live Pulse + Right Auth/Profile Area */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#00985f] text-white font-black text-sm tracking-tighter shadow-sm">
            PT
          </div>
          <span className="text-[17px] font-extrabold tracking-tight text-gray-900">
            Pitch<span className="text-[#00985f]">Trade</span>
          </span>
          <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#00985f] border border-emerald-200/60 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00985f] animate-pulse" />
            {countdown}s
          </span>
        </div>

        {/* Right: [로그인 / 프로필] 영역 */}
        {user ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenAuthModal}
              title="계정 전환 모달 열기"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-[#f8f9fa] px-2.5 py-1 text-xs font-extrabold text-gray-800 transition hover:border-gray-300"
            >
              <User className="h-3.5 w-3.5 text-[#00985f]" />
              <span className="max-w-[90px] truncate">{user.name}</span>
              {user.role === "admin" && (
                <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white shadow-xs">
                  ADMIN
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={logout}
              title="로그아웃"
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95"
            >
              <LogOut className="h-3 w-3" />
              <span>로그아웃</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#00985f] px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#007f4f] active:scale-95"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>로그인 / 프로필</span>
          </button>
        )}
      </div>

      {/* Row 2: Asset Summary Card (Blind when user === null) */}
      {user ? (
        <div
          onClick={() => setActiveTab("PORTFOLIO")}
          className="mt-2.5 cursor-pointer rounded-2xl bg-[#f8f9fa] border border-gray-200/90 px-3.5 py-2.5 transition hover:border-emerald-500/40"
        >
          <div className="flex items-center justify-between">
            {/* Left: Total Evaluated Assets */}
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                <span>총 평가 자산</span>
                <span className="text-gray-300">|</span>
                <span>{user.name} 님</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-mono text-xl font-black tracking-tight text-gray-900">
                  {totalAssets.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-gray-500">P</span>
              </div>
            </div>

            {/* Right: Return Badge */}
            <div className="text-right">
              <span className="text-[11px] font-medium text-gray-500 block">
                트레이딩 손익률
              </span>
              <div
                className={`mt-0.5 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-xs font-bold ${
                  isUp
                    ? "bg-emerald-50 text-[#00985f]"
                    : isDown
                    ? "bg-rose-50 text-rose-600"
                    : "bg-gray-200/70 text-gray-600"
                }`}
              >
                {isUp ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : isDown ? (
                  <TrendingDown className="h-3.5 w-3.5" />
                ) : null}
                <span>
                  {isUp ? "+" : ""}
                  {profitPercent}% ({isUp ? "+" : ""}
                  {totalTradingProfit.toLocaleString()}P)
                </span>
              </div>
            </div>
          </div>

          {/* Sub-row: Available Cash Points vs Player Holdings Value */}
          <div className="mt-2 flex items-center justify-between border-t border-gray-200/70 pt-2 text-xs">
            <div className="flex items-center gap-1.5 text-gray-600">
              <Wallet className="h-3.5 w-3.5 text-[#00985f]" />
              <span>보유 포인트(현금)</span>
              <strong className="font-mono font-bold text-gray-900">
                {cash.toLocaleString()} P
              </strong>
            </div>

            <div className="text-gray-500">
              <span>선수 평가액 </span>
              <strong className="font-mono font-semibold text-gray-800">
                {holdingsValue.toLocaleString()} P
              </strong>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenAuthModal}
          className="mt-2.5 flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-100/90 px-4 py-3.5 text-left transition hover:border-gray-300 hover:bg-gray-200/60 active:scale-[0.995]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-gray-500">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-gray-700">
                로그인하여 자산 확인
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                보유 포인트 및 실시간 수익률은 로그인 후 표시됩니다
              </p>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-gray-700 shadow-xs border border-gray-200">
            <span>로그인 필요</span>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          </span>
        </button>
      )}
    </header>
  );
}
