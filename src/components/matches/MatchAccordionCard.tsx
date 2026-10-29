"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Users,
  ArrowRight,
  Clock,
  Eye,
} from "lucide-react";
import { Match, Player, Holding, TradeType } from "@/types";
import { buildTeamLineupForMatch } from "./FormationPitchModal";

interface MatchAccordionCardProps {
  match: Match;
  players: Player[];
  holdings: Record<string, Holding>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectPlayerTrade: (player: Player, type: TradeType) => void;
  onOpenPitchView: (match: Match) => void;
}

export default function MatchAccordionCard({
  match,
  players,
  holdings,
  isExpanded,
  onToggleExpand,
  onSelectPlayerTrade,
  onOpenPitchView,
}: MatchAccordionCardProps) {
  const [selectedSide, setSelectedSide] = useState<"HOME" | "AWAY">("HOME");
  const [activeKeyPlayers, setActiveKeyPlayers] = useState<Player[]>([]);
  const [showUpcomingPreview, setShowUpcomingPreview] = useState<boolean>(false);

  const isUpcoming =
    match.status === "UPCOMING" ||
    match.rawStatus === "TIMED" ||
    match.rawStatus === "SCHEDULED";

  // Build deduplicated 3 key players (FW / MF aces) for Home and Away teams
  const { homeKeyPlayers, awayKeyPlayers } = useMemo(() => {
    const homeLineup = buildTeamLineupForMatch(match, "HOME", players);
    const awayLineup = buildTeamLineupForMatch(match, "AWAY", players);

    return {
      homeKeyPlayers: homeLineup.startingLineup.slice(0, 3),
      awayKeyPlayers: awayLineup.startingLineup.slice(0, 3),
    };
  }, [players, match]);

  // Replace (never append) activeKeyPlayers when switching team tab
  const handleSelectTeam = (side: "HOME" | "AWAY") => {
    setSelectedSide(side);
    const targetList = side === "HOME" ? homeKeyPlayers : awayKeyPlayers;
    setActiveKeyPlayers(targetList.slice(0, 3));
  };

  useEffect(() => {
    const targetList =
      selectedSide === "HOME" ? homeKeyPlayers : awayKeyPlayers;
    setActiveKeyPlayers(targetList.slice(0, 3));
  }, [selectedSide, homeKeyPlayers, awayKeyPlayers]);

  const formatLiveLabel = (min?: number) => {
    const m = min ?? 45;
    return m <= 45 ? `전반 ${m}'` : `후반 ${m}'`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all">
      {/* Clickable Match Summary Row (FotMob Clean Style) */}
      <div
        onClick={onToggleExpand}
        className="cursor-pointer px-4 py-3.5 transition-colors hover:bg-gray-50/80 active:bg-gray-100/70"
      >
        {/* Top Row: Single Clean Status Pill ONLY + Lineup Toggle */}
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            {match.status === "LIVE" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-extrabold text-[#00985f] border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00985f] animate-ping" />
                {formatLiveLabel(match.minute)}
              </span>
            ) : match.status === "FT" ? (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-600">
                종료 (FT)
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-600 font-mono">
                {match.kickoffTime}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] font-bold text-[#00985f]">
            <Users className="h-3.5 w-3.5" />
            <span>라인업/시세</span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </div>

        {/* Center Scoreboard Grid (Home vs Score/Time vs Away) */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1">
          {/* Home Team */}
          <div className="flex items-center justify-end gap-2.5 text-right min-w-0">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                {match.homeTeam.name}
              </p>
              <span className="text-[10px] font-medium text-gray-400">
                {match.homeTeam.shortName}
              </span>
            </div>
            {match.homeTeam.crest ? (
              <img
                src={match.homeTeam.crest}
                alt={match.homeTeam.name}
                className="h-8 w-8 shrink-0 object-contain"
              />
            ) : (
              <div
                style={{ backgroundColor: match.homeTeam.color }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm"
              >
                {match.homeTeam.shortName}
              </div>
            )}
          </div>

          {/* Center Score or Kickoff */}
          <div className="min-w-[68px] text-center">
            {match.status === "UPCOMING" ? (
              <div className="rounded-xl bg-gray-100 px-3 py-1.5 font-mono text-xs font-bold text-gray-700">
                {match.kickoffTime}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-[#f1f3f5] px-3 py-1.5 font-mono text-base font-black text-gray-900">
                <span>{match.homeTeam.score ?? 0}</span>
                <span className="text-gray-400">:</span>
                <span>{match.awayTeam.score ?? 0}</span>
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-start gap-2.5 text-left min-w-0">
            {match.awayTeam.crest ? (
              <img
                src={match.awayTeam.crest}
                alt={match.awayTeam.name}
                className="h-8 w-8 shrink-0 object-contain"
              />
            ) : (
              <div
                style={{ backgroundColor: match.awayTeam.color }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm"
              >
                {match.awayTeam.shortName}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                {match.awayTeam.name}
              </p>
              <span className="text-[10px] font-medium text-gray-400">
                {match.awayTeam.shortName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stage 1 Expanded View */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-[#f8f9fa] px-3.5 py-3">
          {/* Status Branch: If TIMED / SCHEDULED (Before Kickoff) */}
          {isUpcoming && !showUpcomingPreview ? (
            <div className="rounded-2xl border border-gray-200/90 bg-white p-4 text-center">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200/70">
                <Clock className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-gray-800 leading-relaxed">
                경기 시작 전입니다. 공식 라인업은 킥오프 약 45분 전에 발표됩니다.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenPitchView(match)}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-[#00985f] px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#007f4f] active:scale-95"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>예상 라인업 미리보기 (피치 뷰)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpcomingPreview(true)}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-1 rounded-xl border border-gray-200 bg-[#f8f9fa] px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
                >
                  <span>주요 선수 시세 요약 보기</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {isUpcoming && (
                <div className="mb-2.5 flex items-center justify-between rounded-xl bg-amber-50/90 border border-amber-200/70 px-3 py-1.5 text-[11px] text-amber-900">
                  <span className="font-semibold">
                    🕒 공식 라인업 발표 전 · 예상 선발 기준 시세
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowUpcomingPreview(false)}
                    className="font-bold text-amber-700 underline"
                  >
                    접기
                  </button>
                </div>
              )}

              {/* Home / Away Key Players Tab Header */}
              <div className="mb-2.5 flex items-center justify-between">
                <div className="grid grid-cols-2 rounded-xl bg-gray-200/75 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => handleSelectTeam("HOME")}
                    className={`rounded-lg px-3 py-1 transition ${
                      selectedSide === "HOME"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {match.homeTeam.shortName} 주요 선수 ({homeKeyPlayers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTeam("AWAY")}
                    className={`rounded-lg px-3 py-1 transition ${
                      selectedSide === "AWAY"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {match.awayTeam.shortName} 주요 선수 ({awayKeyPlayers.length})
                  </button>
                </div>

                <span className="text-[10px] font-medium text-gray-400">
                  핵심 에이스 요약
                </span>
              </div>

              {/* Compact Key Player Rows: [등번호] [선수명] [포지션] [현재 시세] [등락률(%)] [매수 버튼] */}
              <div className="space-y-1.5">
                {activeKeyPlayers.slice(0, 3).map((player) => {
                  const base = player.basePrice ?? player.initialPrice;
                  const diff = player.currentPrice - base;
                  const changePct = ((diff / base) * 100).toFixed(2);
                  const isUp = diff > 0;
                  const isDown = diff < 0;
                  const holding = holdings[player.id];

                  return (
                    <div
                      key={`${player.id}-${player.position}`}
                      onClick={() => onSelectPlayerTrade(player, "BUY")}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2 transition hover:border-[#00985f]/50 active:scale-[0.99]"
                    >
                      {/* Left: [등번호] [선수명] [포지션] */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          style={{ backgroundColor: player.teamColor }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-black text-white shadow-sm"
                        >
                          {player.backNumber}
                        </span>

                        <span className="truncate text-xs font-extrabold text-gray-900">
                          {player.name}
                        </span>

                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                          {player.position}
                        </span>

                        {holding && holding.quantity > 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9px] font-extrabold text-[#00985f] border border-emerald-200">
                            {holding.quantity}주
                          </span>
                        )}
                      </div>

                      {/* Right: [현재 시세] [등락률(%)] [매수 버튼] */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="flex items-baseline gap-1.5 font-mono">
                          <span className="text-xs font-black text-gray-900">
                            {player.currentPrice.toLocaleString()}P
                          </span>
                          <span
                            className={`text-[11px] font-bold ${
                              isUp
                                ? "text-[#00985f]"
                                : isDown
                                ? "text-rose-600"
                                : "text-gray-400"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {changePct}%
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPlayerTrade(player, "BUY");
                          }}
                          className="rounded-lg bg-[#00985f] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#007f4f] active:scale-95"
                        >
                          매수
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stage 2 Trigger CTA: [전체 라인업 및 포메이션 보기 ➔] */}
              <button
                type="button"
                onClick={() => onOpenPitchView(match)}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 py-2.5 text-xs font-extrabold text-[#00985f] transition hover:bg-[#00985f] hover:text-white active:scale-[0.99]"
              >
                <span>
                  {isUpcoming
                    ? "예상 라인업 포메이션 피치 뷰 보기"
                    : "전체 라인업 및 포메이션 보기"}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
