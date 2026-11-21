"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Users,
  ArrowRight,
  Star,
} from "lucide-react";
import {
  ActiveMatchContext,
  Match,
  Player,
  Holding,
  TradeType,
  buildActiveMatchContext,
} from "@/types";
import {
  useTradeStore,
  doesPlayerBelongToTeam,
  isNationalTeamMatch,
  normalizeAccountKey,
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
} from "@/store/useTradeStore";
import { getAvailableShares } from "@/utils/tier";
import { resolvePlayerMatchStatus } from "@/lib/lineupStatus";
import { formatMinuteLabel } from "@/lib/priceEngine";
import { formatPlayerDisplayName } from "@/lib/playerDisplayName";
import {
  resolveMatchClock,
  resolveMatchScore,
  resolveSyncedMatch,
} from "@/lib/matchSync";
import {
  buildTeamLineupForMatch,
  FormationPitchContent,
} from "./FormationPitchModal";
import PlayerAvatar from "@/components/PlayerAvatar";

interface MatchAccordionCardProps {
  match: Match;
  players: Player[];
  holdings: Record<string, Holding>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectPlayerTrade: (
    player: Player,
    type: TradeType,
    matchContext?: ActiveMatchContext
  ) => void;
}

export default function MatchAccordionCard({
  match,
  players,
  holdings,
  isExpanded,
  onToggleExpand,
  onSelectPlayerTrade,
}: MatchAccordionCardProps) {
  const user = useTradeStore((s) => s.user);
  const storeMatches = useTradeStore((s) => s.matches);
  const storeHoldings = useTradeStore((s) => s.holdings);
  const accounts = useTradeStore((s) => s.accounts);
  const watchlist = useTradeStore((s) => s.watchlist);
  const toggleWatchlist = useTradeStore((s) => s.toggleWatchlist);
  const [selectedSide, setSelectedSide] = useState<"HOME" | "AWAY">("HOME");
  const [activeKeyPlayers, setActiveKeyPlayers] = useState<Player[]>([]);
  const [isInlinePitchOpen, setIsInlinePitchOpen] = useState<boolean>(
    match.id === "m-new-ars"
  );

  const syncedMatch = useMemo(
    () => resolveSyncedMatch(match, storeMatches),
    [match, storeMatches]
  );
  const clock = useMemo(() => resolveMatchClock(syncedMatch), [syncedMatch]);
  const score = useMemo(() => resolveMatchScore(syncedMatch), [syncedMatch]);

  const isUpcoming = clock.isUpcoming;

  const handleOpenPitch = () => {
    if (!isExpanded) onToggleExpand();
    setIsInlinePitchOpen(true);
  };

  const handleSummaryClick = () => {
    if (isUpcoming) {
      if (isExpanded && isInlinePitchOpen) {
        setIsInlinePitchOpen(false);
        onToggleExpand();
      } else {
        if (!isExpanded) onToggleExpand();
        setIsInlinePitchOpen(true);
      }
      return;
    }
    if (isExpanded && isInlinePitchOpen) {
      setIsInlinePitchOpen(false);
    }
    onToggleExpand();
  };

  // Build deduplicated 3 key players for Home and Away teams (prioritizing base players from store)
  const { homeKeyPlayers, awayKeyPlayers } = useMemo(() => {
    const isAMatch = isNationalTeamMatch(syncedMatch);
    const pickTop3 = (side: "HOME" | "AWAY"): Player[] => {
      const team = side === "HOME" ? syncedMatch.homeTeam : syncedMatch.awayTeam;
      const sameMatchPlayers = players.filter(
        (p) =>
          !p.id.startsWith("pitch-") &&
          p.matchId === syncedMatch.id &&
          doesPlayerBelongToTeam(p, team, isAMatch)
      );
      const dedupePlayers = (list: Player[]): Player[] => {
        const seenIds = new Set<string>();
        const seenNames = new Set<string>();
        const out: Player[] = [];
        for (const p of list) {
          const display = formatPlayerDisplayName(p, "full");
          if (seenIds.has(p.id) || seenNames.has(display)) continue;
          seenIds.add(p.id);
          seenNames.add(display);
          out.push(p);
        }
        return out;
      };

      const baseTeamPlayers = dedupePlayers(
        sameMatchPlayers.length > 0
          ? sameMatchPlayers
          : players.filter(
              (p) =>
                !p.id.startsWith("pitch-") &&
                doesPlayerBelongToTeam(p, team, isAMatch)
            )
      );

      if (baseTeamPlayers.length >= 3) {
        return baseTeamPlayers.slice(0, 3);
      }

      const lineup = buildTeamLineupForMatch(syncedMatch, side, players);
      const merged: Player[] = [...baseTeamPlayers];
      for (const candidate of lineup.startingLineup) {
        if (merged.length >= 3) break;
        const candidateDisplay = formatPlayerDisplayName(candidate, "full");
        if (
          !merged.some(
            (m) =>
              m.id === candidate.id ||
              formatPlayerDisplayName(m, "full") === candidateDisplay
          )
        ) {
          merged.push(candidate);
        }
      }
      return merged.slice(0, 3);
    };

    return {
      homeKeyPlayers: pickTop3("HOME"),
      awayKeyPlayers: pickTop3("AWAY"),
    };
  }, [players, syncedMatch]);

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

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all">
      {/* Clickable Match Summary Row (FotMob Clean Style) */}
      <div
        onClick={handleSummaryClick}
        className="cursor-pointer px-4 py-3.5 transition-colors hover:bg-gray-50/80 active:bg-gray-100/70"
      >
        {/* Top Row: Single Clean Status Pill ONLY + Lineup Toggle */}
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            {clock.isLive ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold border tabular-nums ${
                  clock.isHalfTime
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-emerald-50 text-[#00985f] border-emerald-200"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    clock.isHalfTime
                      ? "bg-amber-500"
                      : "bg-[#00985f] animate-ping"
                  }`}
                />
                {clock.cardLabel}
              </span>
            ) : clock.isFinished ? (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-600">
                {clock.cardLabel}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-600 font-mono">
                {clock.kickoffTime}
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
                {syncedMatch.homeTeam.name}
              </p>
              <span className="text-[10px] font-medium text-gray-400">
                {syncedMatch.homeTeam.shortName}
              </span>
            </div>
            {syncedMatch.homeTeam.crest ? (
              <img
                src={syncedMatch.homeTeam.crest}
                alt={syncedMatch.homeTeam.name}
                className="h-8 w-8 shrink-0 object-contain"
              />
            ) : (
              <div
                style={{ backgroundColor: syncedMatch.homeTeam.color }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm"
              >
                {syncedMatch.homeTeam.shortName}
              </div>
            )}
          </div>

          {/* Center Score or Kickoff */}
          <div className="min-w-[68px] text-center">
            {clock.isUpcoming ? (
              <div className="rounded-xl bg-gray-100 px-3 py-1.5 font-mono text-xs font-bold text-gray-700">
                {clock.kickoffTime}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-[#f1f3f5] px-3 py-1.5 font-mono text-base font-black text-gray-900 tabular-nums">
                <span>{score.homeScore}</span>
                <span className="text-gray-400">:</span>
                <span>{score.awayScore}</span>
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-start gap-2.5 text-left min-w-0">
            {syncedMatch.awayTeam.crest ? (
              <img
                src={syncedMatch.awayTeam.crest}
                alt={syncedMatch.awayTeam.name}
                className="h-8 w-8 shrink-0 object-contain"
              />
            ) : (
              <div
                style={{ backgroundColor: syncedMatch.awayTeam.color }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm"
              >
                {syncedMatch.awayTeam.shortName}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                {syncedMatch.awayTeam.name}
              </p>
              <span className="text-[10px] font-medium text-gray-400">
                {syncedMatch.awayTeam.shortName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stage 1 Expanded View: Unified Inline Pitch & Key Players Summary */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-[#F7F9F8] px-2.5 sm:px-3.5 py-3">
          {isInlinePitchOpen || isUpcoming ? (
            <FormationPitchContent
              match={syncedMatch}
              players={players}
              holdings={holdings}
              onSelectPlayerTrade={onSelectPlayerTrade}
              onCollapseInline={() => {
                setIsInlinePitchOpen(false);
                if (isUpcoming) onToggleExpand();
              }}
            />
          ) : (
            <>
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
                    {syncedMatch.homeTeam.shortName} 주요 선수 ({homeKeyPlayers.length})
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
                    {syncedMatch.awayTeam.shortName} 주요 선수 ({awayKeyPlayers.length})
                  </button>
                </div>

                <span className="text-[10px] font-medium text-gray-400">
                  핵심 에이스 요약
                </span>
              </div>

              {/* Compact Key Player Rows: [등번호] [선수명] [포지션] [잔여/보유] [현재 시세] [등락률(%)] [매수 버튼] */}
              <div className="space-y-1.5">
                {activeKeyPlayers.slice(0, 3).map((player) => {
                  const base = player.openPrice ?? player.basePrice ?? player.initialPrice;
                  const diff = calculateDiffFromOpen(player.currentPrice, base);
                  const changePct = calculateChangePercentFromOpen(
                    player.currentPrice,
                    base
                  ).toFixed(2);
                  const isUp = diff > 0;
                  const isDown = diff < 0;
                  const holding = holdings[player.id];
                  const isWatched = watchlist.includes(player.id);
                  const availableShares = getAvailableShares(
                    player,
                    storeHoldings,
                    accounts,
                    user ? normalizeAccountKey(user.id) : undefined
                  );
                  const isSoldOut = availableShares === 0;

                  const isFinished = clock.isFinished;
                  const matchCtx = buildActiveMatchContext(syncedMatch);
                  const playerStatus = resolvePlayerMatchStatus({
                    player,
                    match: syncedMatch,
                    teamSide: selectedSide,
                  });

                  return (
                    <div
                      key={`${player.id}-${player.position}`}
                      onClick={() => onSelectPlayerTrade(player, "BUY", matchCtx)}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2 transition hover:border-[#00A878]/50 active:scale-[0.99]"
                    >
                      {/* Left: [☆] [등번호] [선수명] [포지션] [잔여/보유] */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWatchlist(player.id);
                          }}
                          title={isWatched ? "관심선수 해제" : "관심선수 등록"}
                          className="shrink-0 rounded-full p-0.5 text-gray-300 transition hover:bg-gray-100 active:scale-90"
                        >
                          <Star
                            className={`h-3.5 w-3.5 ${
                              isWatched
                                ? "fill-amber-400 text-amber-400"
                                : "text-gray-300 hover:text-gray-400"
                            }`}
                          />
                        </button>

                        <PlayerAvatar player={player} size={30} />

                        <span className="truncate text-xs font-extrabold text-gray-900">
                          {formatPlayerDisplayName(player, "full")}
                        </span>

                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                          {player.position}
                        </span>

                        {playerStatus.goals > 0 && (
                          <span className="shrink-0 text-[10px] font-bold">
                            ⚽{playerStatus.goals > 1 ? playerStatus.goals : ""}
                          </span>
                        )}
                        {playerStatus.assists > 0 && (
                          <span className="shrink-0 text-[10px] font-bold text-sky-700">
                            🅰️{playerStatus.assists > 1 ? playerStatus.assists : ""}
                          </span>
                        )}
                        {playerStatus.yellowCards > 0 &&
                          Array.from({
                            length: Math.min(2, playerStatus.yellowCards),
                          }).map((_, idx) => (
                            <span
                              key={`yc-${idx}`}
                              title="옐로카드"
                              className="inline-block h-[10px] w-[7px] shrink-0 rounded-[1.5px] border border-amber-500/60 bg-[#FACC15]"
                            />
                          ))}
                        {playerStatus.redCards > 0 && (
                          <span
                            title="레드카드"
                            className="inline-block h-[10px] w-[7px] shrink-0 rounded-[1.5px] border border-rose-700/60 bg-[#EF4444]"
                          />
                        )}
                        {playerStatus.subInMinute !== undefined && (
                          <span
                            title={`${formatMinuteLabel(playerStatus.subInMinute)} 교체 투입`}
                            className="shrink-0 font-mono text-[9px] font-extrabold text-[#00A878]"
                          >
                            {formatMinuteLabel(playerStatus.subInMinute)}→
                          </span>
                        )}
                        {playerStatus.subOutMinute !== undefined && (
                          <span
                            title={`${formatMinuteLabel(playerStatus.subOutMinute)} 교체 아웃`}
                            className="shrink-0 font-mono text-[9px] font-extrabold text-[#E11D48]"
                          >
                            {formatMinuteLabel(playerStatus.subOutMinute)}←
                          </span>
                        )}

                        {isSoldOut ? (
                          <span className="shrink-0 rounded bg-[#F07868]/15 px-1.5 py-0.5 text-[9px] font-black text-[#F07868]">
                            품절
                          </span>
                        ) : availableShares <= 50 ? (
                          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-700 border border-amber-200">
                            잔여 {availableShares}주
                          </span>
                        ) : null}

                        {holding && holding.quantity > 0 && (
                          <span className="shrink-0 rounded-full bg-[#00A878]/10 px-1.5 py-0.2 text-[9px] font-extrabold text-[#00A878] border border-[#00A878]/25">
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
                                ? "text-[#00A878]"
                                : isDown
                                ? "text-[#F07868]"
                                : "text-[#A8B2BC]"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {changePct}%
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={isFinished || isSoldOut}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isFinished) return;
                            onSelectPlayerTrade(player, "BUY", matchCtx);
                          }}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold shadow-sm transition ${
                            isFinished || isSoldOut
                              ? "cursor-not-allowed bg-gray-200 text-gray-500 shadow-none"
                              : "bg-[#00A878] text-white hover:opacity-95 active:scale-95"
                          }`}
                        >
                          {isFinished ? "마감" : isSoldOut ? "품절" : "매수"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stage 2 Trigger CTA: [전체 라인업 및 포메이션 보기 ➔] */}
              <button
                type="button"
                onClick={handleOpenPitch}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#00A878]/30 bg-[#E8F5EF] py-2.5 text-xs font-extrabold text-[#00A878] transition hover:bg-[#00A878] hover:text-white active:scale-[0.99]"
              >
                <span>전체 라인업 및 포메이션 보기</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
