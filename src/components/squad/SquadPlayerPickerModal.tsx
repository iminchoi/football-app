"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  Check,
  Trash2,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { Player, PositionLine, getPositionLine } from "@/types";
import {
  formatPlayerDisplayName,
  matchesPlayerSearchQuery,
} from "@/lib/playerDisplayName";
import { type SquadFormationSlot } from "@/lib/squadFeed";
import PlayerAvatar from "@/components/PlayerAvatar";

export interface OwnedSquadCandidate {
  player: Player;
  quantity: number;
  avgBuyPrice: number;
}

interface SquadPlayerPickerModalProps {
  isOpen: boolean;
  activeSlot: SquadFormationSlot | null;
  currentSlotPlayerId: string | null;
  assignedSlotLabelByPlayerId: Readonly<Record<string, string>>;
  ownedPlayers: readonly OwnedSquadCandidate[];
  onSelectPlayer: (playerId: string) => void;
  onClearSlot: () => void;
  onClose: () => void;
  onGoToMarket: () => void;
}

type LineFilter = "ALL" | PositionLine;

export default function SquadPlayerPickerModal({
  isOpen,
  activeSlot,
  currentSlotPlayerId,
  assignedSlotLabelByPlayerId,
  ownedPlayers,
  onSelectPlayer,
  onClearSlot,
  onClose,
  onGoToMarket,
}: SquadPlayerPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [lineFilter, setLineFilter] = useState<LineFilter>("ALL");

  // Reset search & default filter whenever a new slot is opened
  useEffect(() => {
    if (!isOpen || !activeSlot) return;
    setSearchQuery("");
    setLineFilter("ALL");
  }, [isOpen, activeSlot]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const currentAssignedCandidate = useMemo(
    () =>
      currentSlotPlayerId
        ? ownedPlayers.find((c) => c.player.id === currentSlotPlayerId) ?? null
        : null,
    [currentSlotPlayerId, ownedPlayers]
  );

  const filteredCandidates = useMemo(() => {
    if (!activeSlot) return [];
    const q = searchQuery.trim().toLowerCase();

    return ownedPlayers
      .filter((item) => {
        if (
          lineFilter !== "ALL" &&
          getPositionLine(item.player.position) !== lineFilter
        ) {
          return false;
        }
        if (!q) return true;
        return (
          matchesPlayerSearchQuery(item.player, q) ||
          item.player.position.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // 1. Current slot occupant first
        const aCurrent = a.player.id === currentSlotPlayerId ? 0 : 1;
        const bCurrent = b.player.id === currentSlotPlayerId ? 0 : 1;
        if (aCurrent !== bCurrent) return aCurrent - bCurrent;

        // 2. Unassigned candidates ahead of already-placed duplicates
        const aUsedElsewhere =
          Boolean(assignedSlotLabelByPlayerId[a.player.id]) &&
          a.player.id !== currentSlotPlayerId
            ? 1
            : 0;
        const bUsedElsewhere =
          Boolean(assignedSlotLabelByPlayerId[b.player.id]) &&
          b.player.id !== currentSlotPlayerId
            ? 1
            : 0;
        if (aUsedElsewhere !== bUsedElsewhere) {
          return aUsedElsewhere - bUsedElsewhere;
        }

        // 3. Natural position line match for clicked slot prioritized
        const aNatural =
          getPositionLine(a.player.position) === activeSlot.line ? 0 : 1;
        const bNatural =
          getPositionLine(b.player.position) === activeSlot.line ? 0 : 1;
        if (aNatural !== bNatural) return aNatural - bNatural;

        // 4. Higher share count first
        return b.quantity - a.quantity;
      });
  }, [
    activeSlot,
    ownedPlayers,
    lineFilter,
    searchQuery,
    currentSlotPlayerId,
    assignedSlotLabelByPlayerId,
  ]);

  if (!isOpen || !activeSlot) return null;

  const isGkSlot = activeSlot.line === "GK";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={`${activeSlot.label} 슬롯 보유 선수 선택`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-black tracking-tight ${
                  isGkSlot
                    ? "bg-amber-100 text-amber-800"
                    : "bg-[#0B4631] text-white"
                }`}
              >
                {activeSlot.label}
              </span>
              <h2 className="text-sm font-black tracking-tight text-gray-900">
                보유 선수 배치
              </h2>
              {isGkSlot && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  <ShieldCheck className="h-3 w-3" />
                  GK 필수
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              실제 보유 수량이 1주 이상인 선수만 선택할 수 있습니다. (중복 배치 불가)
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current Slot Occupant Banner */}
        {currentAssignedCandidate && (
          <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/70 px-5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <PlayerAvatar player={currentAssignedCandidate.player} size={28} />
              <div className="min-w-0">
                <span className="block truncate text-xs font-extrabold text-gray-900">
                  현재 배치:{" "}
                  {formatPlayerDisplayName(
                    currentAssignedCandidate.player,
                    "full"
                  )}
                </span>
                <span className="text-[10px] font-semibold text-[#00985f]">
                  {currentAssignedCandidate.player.position} · 보유{" "}
                  {currentAssignedCandidate.quantity}주
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearSlot}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#E11D48] transition hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              슬롯 비우기
            </button>
          </div>
        )}

        {/* Search & Position Line Filters */}
        <div className="space-y-2.5 border-b border-gray-100 bg-[#F9FAFB] px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="보유 선수 이름, 팀명 또는 포지션 검색..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:border-[#00A878] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(["ALL", "GK", "DF", "MF", "FW"] as LineFilter[]).map((lf) => (
                <button
                  key={lf}
                  type="button"
                  onClick={() => setLineFilter(lf)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    lineFilter === lf
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {lf === "ALL" ? "전체" : lf}
                </button>
              ))}
            </div>
            <span className="font-mono text-[10px] font-bold text-gray-400 tabular-nums">
              보유 {filteredCandidates.length}명
            </span>
          </div>
        </div>

        {/* Owned Players Scrollable List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {ownedPlayers.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-xs font-extrabold text-gray-800">
                현재 보유 중인 선수가 없습니다.
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                시세/차트에서 선수를 매수한 뒤 스쿼드 슬롯에 배치해보세요.
              </p>
              <button
                type="button"
                onClick={onGoToMarket}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#00A878] px-3.5 py-2 text-xs font-extrabold text-white"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                시세/차트에서 매수하기
              </button>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="py-10 text-center text-xs font-medium text-gray-400">
              조건에 맞는 보유 선수가 없습니다.
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredCandidates.map(({ player, quantity }) => {
                const isCurrentSlotPlayer = player.id === currentSlotPlayerId;
                const otherSlotLabel =
                  !isCurrentSlotPlayer && assignedSlotLabelByPlayerId[player.id]
                    ? assignedSlotLabelByPlayerId[player.id]
                    : null;
                const isDuplicateBlocked = Boolean(otherSlotLabel);
                const playerLine = getPositionLine(player.position);
                const isNaturalFit = playerLine === activeSlot.line;

                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={isDuplicateBlocked}
                    onClick={() => onSelectPlayer(player.id)}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                      isCurrentSlotPlayer
                        ? "border-[#00A878] bg-emerald-50/75"
                        : isDuplicateBlocked
                        ? "cursor-not-allowed border-gray-100 bg-gray-50/80 opacity-60"
                        : "border-gray-200/80 bg-white hover:border-[#00A878] hover:bg-emerald-50/30"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar player={player} size={36} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-xs font-extrabold text-gray-900">
                            {formatPlayerDisplayName(player, "full")}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold ${
                              playerLine === "GK"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {player.position}
                          </span>
                          {isNaturalFit && !isDuplicateBlocked && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold text-[#00985f]">
                              추천
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
                          <span className="truncate">{player.teamName}</span>
                          <span>·</span>
                          <span className="font-mono font-bold text-gray-700 tabular-nums">
                            보유 {quantity}주
                          </span>
                          <span>·</span>
                          <span className="font-mono tabular-nums text-gray-500">
                            {player.currentPrice.toLocaleString()}P
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isCurrentSlotPlayer ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#00A878] px-2.5 py-1 text-[10px] font-extrabold text-white">
                          <Check className="h-3 w-3" />
                          배치됨
                        </span>
                      ) : isDuplicateBlocked ? (
                        <span className="inline-flex items-center rounded-lg bg-gray-200 px-2 py-1 font-mono text-[10px] font-bold text-gray-600">
                          {otherSlotLabel} 배치 중
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-[10px] font-extrabold text-gray-700">
                          선택
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
