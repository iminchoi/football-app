"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Coins,
  Flame,
  RotateCcw,
  X,
  CheckCircle2,
  ChevronUp,
} from "lucide-react";
import { useTradeStore, roundToTen } from "@/store/useTradeStore";

export default function AdminPanel() {
  const user = useTradeStore((s) => s.user);
  const players = useTradeStore((s) => s.players);
  const holdings = useTradeStore((s) => s.holdings);
  const addAdminCash = useTradeStore((s) => s.addAdminCash);
  const triggerForceGoalEvent = useTradeStore((s) => s.triggerForceGoalEvent);
  const resetAll = useTradeStore((s) => s.resetAll);

  const [isOpen, setIsOpen] = useState(false);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");
  const [statusLog, setStatusLog] = useState<string | null>(null);

  // Only render when logged in as admin
  if (user?.role !== "admin") {
    return null;
  }

  const showTempLog = (msg: string) => {
    setStatusLog(msg);
  };

  // 1. [포인트 100만 P 즉시 충전]
  const handleChargeOneMillion = () => {
    const { added, nextCash } = addAdminCash(1000000);
    showTempLog(
      `💰 +${added.toLocaleString()} P 충전 완료! (보유: ${nextCash.toLocaleString()} P)`
    );
  };

  // 2. [임의 골 이벤트 강제 발생]
  const handleForceGoal = () => {
    const res = triggerForceGoalEvent(targetPlayerId || undefined);
    if (!res) {
      showTempLog("⚠️ 이벤트를 발생시킬 선수가 없습니다.");
      return;
    }
    if (res.capped) {
      showTempLog(
        `🔥 ${res.player.name} 이미 상한가(+30% · ${res.nextPrice.toLocaleString()}P) 도달! 득점(+1골) 및 경기 스코어 반영됨`
      );
      return;
    }
    showTempLog(
      `⚽ ${res.player.name} 골 급등! ${res.prevPrice.toLocaleString()}P → ${res.nextPrice.toLocaleString()}P (+${res.ratePct.toFixed(
        1
      )}%) · 스코어 반영`
    );
  };

  // 3. [로컬 데이터 전체 초기화]
  const handleFullReset = () => {
    if (
      window.confirm(
        "[ADMIN] 로컬 스토리지 데이터(보유 선수, 거래 내역, 시세, 보유 포인트)를 모두 초기 상태로 초기화하시겠습니까?"
      )
    ) {
      resetAll();
      showTempLog("🔄 로컬 데이터 전체 초기화 완료 (100,000 P 리셋)");
    }
  };

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 pointer-events-none px-4 flex flex-col items-end">
      {/* Expanded Admin Debug Menu */}
      {isOpen && (
        <div className="pointer-events-auto mb-2.5 w-76 overflow-hidden rounded-2xl border border-rose-500/30 bg-gray-900/95 p-3.5 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-white">
                ADMIN
              </span>
              <span className="text-xs font-extrabold text-gray-100">
                디버그 컨트롤 툴바
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Target Player Selector for Force Goal */}
          <div className="mt-2.5">
            <label className="block text-[10px] font-bold text-gray-400 mb-1">
              골 이벤트 대상 선수 선택 (선택사항)
            </label>
            <select
              value={targetPlayerId}
              onChange={(e) => setTargetPlayerId(e.target.value)}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-[11px] font-semibold text-gray-100 focus:border-rose-500 focus:outline-none"
            >
              <option value="">🎯 자동 선택 (보유 선수 · 미상한가 우선)</option>
              {players.map((p) => {
                const owned = holdings[p.id]?.quantity ?? 0;
                const base = roundToTen(p.basePrice ?? p.initialPrice ?? 10000);
                const isAtCap = p.currentPrice >= roundToTen(base * 1.3);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.teamShort}) · {p.currentPrice.toLocaleString()}P
                    {owned > 0 ? ` [보유 ${owned}주]` : ""}
                    {isAtCap ? " [상한가]" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 3 Admin Action Buttons */}
          <div className="mt-2.5 space-y-2">
            <button
              type="button"
              onClick={handleChargeOneMillion}
              className="flex w-full items-center justify-between rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]"
            >
              <span className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" />
                <span>포인트 100만 P 즉시 충전</span>
              </span>
              <span className="font-mono text-[10px] opacity-90">+1,000,000P</span>
            </button>

            <button
              type="button"
              onClick={handleForceGoal}
              className="flex w-full items-center justify-between rounded-xl bg-amber-500 px-3 py-2.5 text-xs font-extrabold text-gray-950 shadow-sm transition hover:bg-amber-400 active:scale-[0.98]"
            >
              <span className="flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5" />
                <span>임의 골 이벤트 강제 발생</span>
              </span>
              <span className="font-mono text-[10px] font-black">시세 급등</span>
            </button>

            <button
              type="button"
              onClick={handleFullReset}
              className="flex w-full items-center justify-between rounded-xl border border-rose-500/50 bg-rose-600/20 px-3 py-2.5 text-xs font-extrabold text-rose-300 transition hover:bg-rose-600 hover:text-white active:scale-[0.98]"
            >
              <span className="flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                <span>로컬 데이터 전체 초기화</span>
              </span>
              <span className="font-mono text-[10px]">RESET</span>
            </button>
          </div>

          {/* Status Feedback Log */}
          {statusLog && (
            <div className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-gray-800/90 px-2.5 py-2 text-[11px] font-semibold text-emerald-300 border border-gray-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
              <span className="leading-snug">{statusLog}</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Admin Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-2.5 text-xs font-black text-white shadow-lg shadow-rose-600/30 ring-2 ring-white transition hover:bg-rose-500 active:scale-95"
      >
        <ShieldAlert className="h-4 w-4" />
        <span>ADMIN 도구</span>
        <ChevronUp
          className={`h-3.5 w-3.5 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
    </div>
  );
}
