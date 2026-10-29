"use client";

import React, { useState } from "react";
import {
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  TrendingUp,
} from "lucide-react";
import { useTradeStore } from "@/store/useTradeStore";
import { Player, TradeType } from "@/types";

interface MarketChartTabViewProps {
  onSelectPlayerTrade: (player: Player, type: TradeType) => void;
}

export default function MarketChartTabView({
  onSelectPlayerTrade,
}: MarketChartTabViewProps) {
  const { players, holdings } = useTradeStore();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    players[0]?.id ?? "p-son"
  );
  const [rankFilter, setRankFilter] = useState<"GAINERS" | "PRICE" | "RATING">(
    "GAINERS"
  );

  const activePlayer =
    players.find((p) => p.id === selectedPlayerId) ?? players[0];

  // Featured popular players for quick chart switcher
  const featuredIds = [
    "p-son",
    "p-haaland",
    "p-bellingham",
    "p-lee",
    "p-salah",
    "p-kim",
  ];
  const featuredPlayers = players.filter((p) => featuredIds.includes(p.id));

  // Calculate SVG Line Chart coordinates for activePlayer
  const history = activePlayer.priceHistory;
  const prices = history.map((h) => h.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = Math.max(200, maxP - minP);

  const chartW = 380;
  const chartH = 140;
  const padX = 16;
  const padY = 20;

  const coords = history.map((pt, idx) => {
    const x =
      padX +
      (idx / Math.max(1, history.length - 1)) * (chartW - padX * 2);
    const y =
      chartH -
      padY -
      ((pt.price - minP) / range) * (chartH - padY * 2);
    return { x, y, ...pt };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPoints =
    coords.length > 0
      ? `${coords[0].x},${chartH - padY} ${polylinePoints} ${
          coords[coords.length - 1].x
        },${chartH - padY}`
      : "";

  const activeDiff = activePlayer.currentPrice - activePlayer.initialPrice;
  const activePct = ((activeDiff / activePlayer.initialPrice) * 100).toFixed(2);
  const isActiveUp = activeDiff >= 0;

  // Sort all players for the ranking list
  const rankedPlayers = [...players].sort((a, b) => {
    if (rankFilter === "GAINERS") {
      const rateA = (a.currentPrice - a.initialPrice) / a.initialPrice;
      const rateB = (b.currentPrice - b.initialPrice) / b.initialPrice;
      return rateB - rateA;
    }
    if (rankFilter === "PRICE") {
      return b.currentPrice - a.currentPrice;
    }
    return b.stats.rating - a.stats.rating;
  });

  return (
    <div className="px-4 pt-4 pb-8 space-y-5">
      {/* 1. Interactive Featured Player Chart Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-[#00985f]" />
            <h2 className="text-sm font-extrabold text-gray-900">
              인기 선수 실시간 시세 차트
            </h2>
          </div>
          <span className="text-[11px] font-medium text-gray-400">
            5초 주기 자동 갱신
          </span>
        </div>

        {/* Horizontal Player Chip Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2">
          {featuredPlayers.map((p) => {
            const isSelected = p.id === activePlayer.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlayerId(p.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                  isSelected
                    ? "bg-[#111827] text-white font-bold shadow-sm"
                    : "bg-[#f1f3f5] text-gray-600 font-medium hover:bg-gray-200"
                }`}
              >
                <span>{p.name}</span>
                <span
                  className={`font-mono text-[10px] ${
                    isSelected ? "text-emerald-300" : "text-gray-400"
                  }`}
                >
                  {p.teamShort}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Player Header Info */}
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2.5">
            <div
              style={{ backgroundColor: activePlayer.teamColor }}
              className="flex h-11 w-11 flex-col items-center justify-center rounded-xl text-white font-mono shadow-sm"
            >
              <span className="text-[9px] font-semibold opacity-80 leading-none">
                {activePlayer.teamShort}
              </span>
              <span className="text-sm font-black">
                {activePlayer.backNumber}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-extrabold text-gray-900">
                  {activePlayer.name}
                </h3>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                  {activePlayer.position}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#00985f]">
                  <Star className="h-2.5 w-2.5 fill-[#00985f]" />
                  {activePlayer.stats.rating.toFixed(1)}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {activePlayer.englishName} · {activePlayer.teamName}
              </p>
            </div>
          </div>

          <div className="text-right font-mono">
            <div className="text-lg font-black text-gray-900">
              {activePlayer.currentPrice.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-gray-400">P</span>
            </div>
            <div
              className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                isActiveUp ? "text-[#00985f]" : "text-rose-600"
              }`}
            >
              {isActiveUp ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              <span>
                {isActiveUp ? "+" : ""}
                {activeDiff.toLocaleString()}P ({isActiveUp ? "+" : ""}
                {activePct}%)
              </span>
            </div>
          </div>
        </div>

        {/* SVG Line Chart Box */}
        <div className="mt-3 rounded-xl bg-[#f8f9fa] border border-gray-100 p-3">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-36 overflow-visible"
          >
            <defs>
              <linearGradient id="chartGradUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00985f" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#00985f" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="chartGradDown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e11d48" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Reference Grid Lines */}
            {[0.2, 0.5, 0.8].map((ratio, idx) => (
              <line
                key={idx}
                x1={padX}
                x2={chartW - padX}
                y1={chartH * ratio}
                y2={chartH * ratio}
                stroke="#e5e7eb"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            ))}

            {/* Shaded Area under Line */}
            {areaPoints && (
              <polygon
                points={areaPoints}
                fill={isActiveUp ? "url(#chartGradUp)" : "url(#chartGradDown)"}
              />
            )}

            {/* Main Price Line */}
            <polyline
              fill="none"
              stroke={isActiveUp ? "#00985f" : "#e11d48"}
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylinePoints}
            />

            {/* Data Points + Labels */}
            {coords.map((c, idx) => {
              const isLast = idx === coords.length - 1;
              return (
                <g key={idx}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={isLast ? 4.5 : 2.5}
                    fill={isLast ? (isActiveUp ? "#00985f" : "#e11d48") : "#fff"}
                    stroke={isActiveUp ? "#00985f" : "#e11d48"}
                    strokeWidth="2"
                  />
                  {/* Time Label at Bottom */}
                  <text
                    x={c.x}
                    y={chartH - 3}
                    textAnchor="middle"
                    className="fill-gray-400 text-[9px] font-mono"
                  >
                    {c.timeLabel}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Latest Match Event & Stats Footer */}
          <div className="mt-2 flex items-center justify-between border-t border-gray-200/70 pt-2.5 text-xs">
            <span className="truncate text-gray-600 font-medium">
              {activePlayer.lastEvent.text}
            </span>
            <button
              type="button"
              onClick={() => onSelectPlayerTrade(activePlayer, "BUY")}
              className="shrink-0 rounded-xl bg-[#00985f] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#007f4f]"
            >
              즉시 주문
            </button>
          </div>
        </div>
      </div>

      {/* 2. All Players Ranking Section */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-[#00985f]" />
            <h2 className="text-sm font-extrabold text-gray-900">
              실시간 선수 등락률 랭킹
            </h2>
          </div>

          {/* Sort Mode Selector */}
          <div className="inline-flex rounded-xl bg-gray-100 p-0.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setRankFilter("GAINERS")}
              className={`rounded-lg px-2 py-1 transition ${
                rankFilter === "GAINERS"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              상승률순
            </button>
            <button
              type="button"
              onClick={() => setRankFilter("PRICE")}
              className={`rounded-lg px-2 py-1 transition ${
                rankFilter === "PRICE"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              고가순
            </button>
            <button
              type="button"
              onClick={() => setRankFilter("RATING")}
              className={`rounded-lg px-2 py-1 transition ${
                rankFilter === "RATING"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              평점순
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {rankedPlayers.map((player, index) => {
            const diff = player.currentPrice - player.initialPrice;
            const pct = ((diff / player.initialPrice) * 100).toFixed(2);
            const isUp = diff > 0;
            const isDown = diff < 0;
            const holding = holdings[player.id];

            return (
              <div
                key={player.id}
                onClick={() => {
                  setSelectedPlayerId(player.id);
                  onSelectPlayerTrade(player, "BUY");
                }}
                className="flex cursor-pointer items-center justify-between gap-2 py-3 transition hover:bg-gray-50/80"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-5 text-center font-mono text-xs font-extrabold ${
                      index < 3 ? "text-[#00985f]" : "text-gray-400"
                    }`}
                  >
                    {index + 1}
                  </span>

                  <div
                    style={{ backgroundColor: player.teamColor }}
                    className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-white font-mono"
                  >
                    <span className="text-[8px] font-semibold opacity-80 leading-none">
                      {player.teamShort}
                    </span>
                    <span className="text-xs font-black">
                      {player.backNumber}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-900 truncate">
                        {player.name}
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.2 text-[10px] font-bold text-gray-600">
                        {player.position}
                      </span>
                      {holding && holding.quantity > 0 && (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-[#00985f]">
                          {holding.quantity}주
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">
                      평점 {player.stats.rating.toFixed(1)} ·{" "}
                      {player. stats.goals}골 {player.stats.assists}도움
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="text-right font-mono">
                    <p className="text-sm font-black text-gray-900">
                      {player.currentPrice.toLocaleString()} P
                    </p>
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.2 text-[11px] font-bold ${
                        isUp
                          ? "bg-emerald-50 text-[#00985f]"
                          : isDown
                          ? "bg-rose-50 text-rose-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {isUp ? "+" : ""}
                      {pct}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
