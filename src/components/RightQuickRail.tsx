"use client";

import React, { useState } from "react";
import { Briefcase, Star, Clock, X } from "lucide-react";
import {
  useTradeStore,
  roundToTen,
  calculateChangePercentFromOpen,
} from "@/store/useTradeStore";
import { Player } from "@/types";
import { formatPlayerDisplayName } from "@/lib/playerDisplayName";
import PlayerAvatar from "@/components/PlayerAvatar";

type QuickRailTab = "INVEST" | "WATCHLIST" | "RECENT" | null;

interface RightQuickRailProps {
  recentPlayerIds: string[];
  onSelectPlayer: (player: Player) => void;
  onOpenAuthModal: () => void;
}

export default function RightQuickRail({
  recentPlayerIds,
  onSelectPlayer,
  onOpenAuthModal,
}: RightQuickRailProps) {
  const user = useTradeStore((s) => s.user);
  const cash = useTradeStore((s) => s.cash);
  const players = useTradeStore((s) => s.players);
  const holdings = useTradeStore((s) => s.holdings);
  const watchlist = useTradeStore((s) => s.watchlist);

  const [activeRail, setActiveRail] = useState<QuickRailTab>(null);

  const toggleRail = (tab: Exclude<QuickRailTab, null>) => {
    setActiveRail((prev) => (prev === tab ? null : tab));
  };

  const holdingPlayers = user
    ? Object.values(holdings)
        .filter((h) => h.quantity > 0)
        .map((h) => ({
          holding: h,
          player: players.find((p) => p.id === h.playerId),
        }))
        .filter(
          (item): item is { holding: (typeof holdings)[string]; player: Player } =>
            Boolean(item.player)
        )
    : [];

  const watchlistPlayers = watchlist
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));

  const recentPlayers = recentPlayerIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));

  const railButtons: {
    key: Exclude<QuickRailTab, null>;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    {
      key: "INVEST",
      label: "내 투자",
      icon: Briefcase,
      count: holdingPlayers.length || undefined,
    },
    {
      key: "WATCHLIST",
      label: "관심 선수",
      icon: Star,
      count: watchlistPlayers.length || undefined,
    },
    {
      key: "RECENT",
      label: "최근 본",
      icon: Clock,
      count: recentPlayers.length || undefined,
    },
  ];

  const renderPlayerRow = (player: Player, subtitle?: string) => {
    const open = roundToTen(player.openPrice ?? player.initialPrice);
    const pct = calculateChangePercentFromOpen(player.currentPrice, open);
    const isUp = pct > 0;
    const isDown = pct < 0;

    return (
      <button
        key={player.id}
        type="button"
        onClick={() => onSelectPlayer(player)}
        className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition hover:bg-[#F7F9F8]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <PlayerAvatar player={player} size={30} />
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-gray-900">
              {formatPlayerDisplayName(player, "full")}
            </p>
            <p className="truncate text-[10px] text-gray-400">
              {subtitle ?? `${player.teamShort} · ${player.position}`}
            </p>
          </div>
        </div>

        <div className="text-right font-mono shrink-0">
          <p className="text-xs font-black text-gray-900">
            {player.currentPrice.toLocaleString()}P
          </p>
          <p
            className={`text-[10px] font-bold ${
              isUp
                ? "text-[#00A878]"
                : isDown
                ? "text-[#F07868]"
                : "text-[#A8B2BC]"
            }`}
          >
            {isUp ? "+" : ""}
            {pct.toFixed(2)}%
          </p>
        </div>
      </button>
    );
  };

  return (
    <div className="hidden lg:flex shrink-0 sticky top-[64px] h-[calc(100vh-64px)]">
      {/* Slide-out Quick Drawer */}
      {activeRail !== null && (
        <div className="flex w-[280px] flex-col border-l border-gray-200/80 bg-[#FFFFFF]">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-xs font-extrabold text-gray-900">
              {activeRail === "INVEST"
                ? "내 투자 자산"
                : activeRail === "WATCHLIST"
                ? "관심 선수"
                : "최근 본 선수"}
            </h3>
            <button
              type="button"
              onClick={() => setActiveRail(null)}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-1.5">
            {activeRail === "INVEST" && (
              <>
                {!user ? (
                  <div className="rounded-2xl bg-[#F7F9F8] p-4 text-center">
                    <p className="text-xs font-semibold text-gray-500">
                      로그인 후 보유 종목을 확인할 수 있습니다.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenAuthModal}
                      className="mt-3 rounded-xl bg-[#00A878] px-4 py-2 text-xs font-extrabold text-white"
                    >
                      로그인하기
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 rounded-xl bg-[#F7F9F8] px-3 py-2.5">
                      <span className="text-[10px] font-semibold text-gray-500">
                        보유 현금 포인트
                      </span>
                      <p className="font-mono text-sm font-black text-gray-900">
                        {cash.toLocaleString()}P
                      </p>
                    </div>
                    {holdingPlayers.length === 0 ? (
                      <p className="py-8 text-center text-xs text-gray-400">
                        보유 중인 선수가 없습니다.
                      </p>
                    ) : (
                      holdingPlayers.map(({ holding, player }) =>
                        renderPlayerRow(
                          player,
                          `${holding.quantity}주 · 평균 ${roundToTen(
                            holding.avgBuyPrice
                          ).toLocaleString()}P`
                        )
                      )
                    )}
                  </>
                )}
              </>
            )}

            {activeRail === "WATCHLIST" &&
              (watchlistPlayers.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">
                  관심 등록한 선수가 없습니다.
                </p>
              ) : (
                watchlistPlayers.map((p) => renderPlayerRow(p))
              ))}

            {activeRail === "RECENT" &&
              (recentPlayers.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">
                  최근 조회한 선수가 없습니다.
                </p>
              ) : (
                recentPlayers.map((p) => renderPlayerRow(p))
              ))}
          </div>
        </div>
      )}

      {/* Rightmost Slim Vertical Quick Rail (w-16) */}
      <div className="flex w-16 flex-col items-center border-l border-gray-200/80 bg-[#FFFFFF] py-3 gap-2">
        {railButtons.map((btn) => {
          const Icon = btn.icon;
          const isActive = activeRail === btn.key;
          return (
            <button
              key={btn.key}
              type="button"
              onClick={() => toggleRail(btn.key)}
              className={`relative flex w-12 flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[10px] font-bold transition ${
                isActive
                  ? "bg-emerald-50 text-[#00A878]"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{btn.label}</span>
              {btn.count !== undefined && (
                <span className="absolute right-1.5 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#00A878] px-1 text-[9px] font-black text-white">
                  {btn.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
