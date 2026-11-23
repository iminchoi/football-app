"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Sparkles,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
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
  roundToTen,
  doesPlayerBelongToTeam,
  isNationalTeamMatch,
  calculateChangePercentFromOpen,
} from "@/store/useTradeStore";
import { formatMinuteLabel, type PlayerEvent } from "@/lib/priceEngine";
import {
  findLineupEntryForPlayer,
  reconcileTeamGoalMarkers,
  resolveMatchManagers,
  resolvePlayerMatchStatus,
  type PlayerMatchLineupStatus,
} from "@/lib/lineupStatus";
import {
  formatPlayerDisplayName,
  resolvePlayerDisplayName,
} from "@/lib/playerDisplayName";
import {
  resolveMatchClock,
  resolveMatchScore,
  resolveSyncedMatch,
} from "@/lib/matchSync";
import {
  buildFormationRows,
  buildTeamLineupForMatch,
  FORMATION_4231_SLOTS,
  FORMATION_433_SLOTS,
  isPositionAllowedInSlot,
  normalizeSupportedFormation,
  resolvePitchFormationLabel,
  STARTING_11_TEMPLATE,
  type FormationSlotSpec,
  type SupportedFormation,
} from "@/lib/lineupBuilder";
import PlayerAvatar from "@/components/PlayerAvatar";

export {
  buildFormationRows,
  buildTeamLineupForMatch,
  FORMATION_4231_SLOTS,
  FORMATION_433_SLOTS,
  isPositionAllowedInSlot,
  normalizeSupportedFormation,
  resolvePitchFormationLabel,
  STARTING_11_TEMPLATE,
};
export type { FormationSlotSpec, SupportedFormation };

interface FormationPitchModalProps {
  match: Match | null;
  players: Player[];
  holdings: Record<string, Holding>;
  onClose: () => void;
  onSelectPlayerTrade: (
    player: Player,
    type: TradeType,
    matchContext?: ActiveMatchContext
  ) => void;
}

interface MatchCardBadgesProps {
  yellowCards: number;
  redCards: number;
  size?: "xs" | "sm";
}

function MatchCardBadges({
  yellowCards,
  redCards,
  size = "xs",
}: MatchCardBadgesProps) {
  if (yellowCards <= 0 && redCards <= 0) return null;
  const cardDim =
    size === "xs"
      ? "h-[10px] w-[7px] rounded-[1.5px]"
      : "h-[12px] w-[8.5px] rounded-[2px]";
  const yellowCount = Math.min(2, yellowCards);
  const redCount = Math.min(1, redCards);

  return (
    <span
      data-testid="match-card-badges"
      className="inline-flex shrink-0 items-center gap-0.5"
      aria-label={[
        yellowCount > 0 ? `옐로카드 ${yellowCount}장` : "",
        redCount > 0 ? `레드카드 ${redCount}장` : "",
      ]
        .filter(Boolean)
        .join(", ")}
    >
      {Array.from({ length: yellowCount }).map((_, idx) => (
        <span
          key={`yc-${idx}`}
          data-testid="yellow-card-badge"
          title="옐로카드"
          className={`inline-block ${cardDim} border border-amber-500/60 bg-[#FACC15] shadow-[0_1px_1px_rgba(0,0,0,0.16)]`}
        />
      ))}
      {Array.from({ length: redCount }).map((_, idx) => (
        <span
          key={`rc-${idx}`}
          data-testid="red-card-badge"
          title="레드카드"
          className={`inline-block ${cardDim} border border-rose-700/60 bg-[#EF4444] shadow-[0_1px_1px_rgba(0,0,0,0.18)]`}
        />
      ))}
    </span>
  );
}

interface SubTimeBadgeProps {
  direction: "IN" | "OUT";
  minute: number;
  compact?: boolean;
}

function SubTimeBadge({
  direction,
  minute,
  compact = false,
}: SubTimeBadgeProps) {
  const isIn = direction === "IN";
  const label = formatMinuteLabel(minute);

  return (
    <span
      data-testid={isIn ? "sub-in-badge" : "sub-out-badge"}
      title={isIn ? `${label} 교체 투입` : `${label} 교체 아웃`}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border font-mono font-extrabold tabular-nums leading-none whitespace-nowrap ${
        compact
          ? "px-1 py-0.5 text-[8px] sm:text-[9px] shadow-xs"
          : "px-1.5 py-0.5 text-[10px]"
      } ${
        isIn
          ? "border-emerald-200 bg-emerald-50 text-[#00A878]"
          : "border-rose-200 bg-white/95 text-[#E11D48]"
      }`}
    >
      <span>{label}</span>
      {isIn ? (
        <ArrowRight
          className={compact ? "h-2.5 w-2.5 text-[#00A878]" : "h-3 w-3 text-[#00A878]"}
          strokeWidth={2.75}
        />
      ) : (
        <ArrowLeft
          className={compact ? "h-2.5 w-2.5 text-[#E11D48]" : "h-3 w-3 text-[#E11D48]"}
          strokeWidth={2.75}
        />
      )}
    </span>
  );
}

interface PitchPlayerNodeProps {
  player: Player;
  teamColor: string;
  holdingQty: number;
  status: PlayerMatchLineupStatus;
  isUpcoming?: boolean;
  onSelect: (player: Player, type: TradeType) => void;
}

const PitchPlayerNode = React.memo(function PitchPlayerNode({
  player,
  teamColor,
  holdingQty,
  status,
  isUpcoming = false,
  onSelect,
}: PitchPlayerNodeProps) {
  const base = roundToTen(
    player.basePrice ?? player.openPrice ?? player.initialPrice ?? player.currentPrice
  );
  const open = isUpcoming
    ? base
    : roundToTen(player.openPrice ?? player.basePrice ?? player.initialPrice);
  const displayPrice = isUpcoming ? base : roundToTen(player.currentPrice);
  const diff = isUpcoming ? 0 : displayPrice - open;
  const pct = isUpcoming
    ? "0.00"
    : calculateChangePercentFromOpen(displayPrice, open).toFixed(2);
  const isUp = diff > 0;
  const isDown = diff < 0;
  const displayName = resolvePlayerDisplayName(player);

  return (
    <button
      type="button"
      title={displayName.full}
      onClick={() => onSelect(player, "BUY")}
      className="group relative flex min-w-0 flex-1 max-w-[74px] sm:max-w-[92px] flex-col items-center rounded-xl sm:rounded-2xl border border-gray-200/90 bg-[#FFFFFF] px-1 pt-1.5 pb-1.5 sm:px-2 sm:pt-2 sm:pb-2 shadow-xs transition hover:-translate-y-0.5 hover:border-[#00A878] hover:shadow-sm focus:outline-none active:scale-95"
    >
      {/* Top Bar: Left (Holdings + Captain) / Right (Match Rating) — flex layout prevents corner overlap */}
      <div className="flex w-full items-center justify-between gap-0.5 min-h-[14px]">
        <div className="flex items-center gap-0.5 min-w-0">
          {holdingQty > 0 && (
            <span className="flex h-3.5 min-w-[14px] sm:h-4 sm:min-w-[16px] items-center justify-center rounded-full bg-[#00A878] px-1 text-[8px] sm:text-[9px] font-black text-white">
              {holdingQty}
            </span>
          )}
          {status.isCaptain && (
            <span
              data-testid="captain-badge"
              title="주장"
              className="flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-gray-900 px-1 text-[8px] font-black text-white leading-none"
            >
              C
            </span>
          )}
        </div>

        <span className="rounded bg-[#F7F9F8] px-1 py-0.5 font-mono text-[8px] sm:text-[9px] font-extrabold text-gray-700 tabular-nums border border-gray-200/70 leading-none">
          {player.stats.rating.toFixed(1)}
        </span>
      </div>

      {/* Avatar Area with Dedicated Non-Overlapping Corner Anchors */}
      <div className="relative my-1 flex items-center justify-center">
        <PlayerAvatar
          player={player}
          teamColorOverride={teamColor}
          size={34}
        />

        {/* Avatar Top-Left: Sub-Out Minute + Red ← Icon */}
        {status.subOutMinute !== undefined && (
          <div className="pointer-events-none absolute -left-3.5 -top-1 z-10">
            <SubTimeBadge direction="OUT" minute={status.subOutMinute} compact />
          </div>
        )}

        {/* Avatar Left/Bottom-Left: Yellow / Red Card Badges (flex-gap prevents multi-card overlap) */}
        {(status.yellowCards > 0 || status.redCards > 0) && (
          <div className="pointer-events-none absolute -left-2.5 -bottom-0.5 z-10 flex items-center gap-0.5 rounded bg-white/90 px-0.5 py-0.5 shadow-xs border border-gray-200/70">
            <MatchCardBadges
              yellowCards={status.yellowCards}
              redCards={status.redCards}
              size="xs"
            />
          </div>
        )}

        {/* Avatar Bottom-Right: Goal / Assist Markers (separated from cards & rating) */}
        {(status.goals > 0 || status.assists > 0) && (
          <div
            data-testid="pitch-goal-assist-badges"
            className="pointer-events-none absolute -right-2.5 -bottom-0.5 z-10 flex items-center gap-0.5 rounded-full bg-white/95 px-1 py-0.5 text-[8px] font-black leading-none shadow-xs border border-gray-200/70"
          >
            {status.goals > 0 && (
              <span title={`득점 ${status.goals}`}>
                ⚽{status.goals > 1 ? status.goals : ""}
              </span>
            )}
            {status.assists > 0 && (
              <span title={`도움 ${status.assists}`} className="text-sky-700">
                🅰️{status.assists > 1 ? status.assists : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Middle: Player Name + Subtle Position Label */}
      <div className="flex w-full items-center justify-center gap-0.5 sm:gap-1 px-0.5">
        <span className="truncate text-[10px] sm:text-[11px] font-extrabold text-gray-900 leading-tight">
          {displayName.pitch}
        </span>
        <span className="shrink-0 text-[8px] sm:text-[9px] font-semibold text-gray-400 leading-tight">
          {player.position}
        </span>
      </div>

      {/* Bottom: Current Price + Change % */}
      <div className="mt-0.5 flex max-w-full items-center gap-0.5 sm:gap-1 font-mono text-[8.5px] sm:text-[9.5px] font-bold tabular-nums">
        <span className="truncate text-gray-800">
          {displayPrice.toLocaleString()}
        </span>
        <span
          className={`shrink-0 ${
            isUp
              ? "text-[#00A878]"
              : isDown
              ? "text-[#F07868]"
              : "text-[#A8B2BC]"
          }`}
        >
          {isUp ? "+" : isDown ? "-" : ""}
          {Math.abs(Number(pct)).toFixed(2)}%
        </span>
      </div>
    </button>
  );
});

interface BenchPlayerRowProps {
  sub: Player;
  teamColor: string;
  holdingQty: number;
  status: PlayerMatchLineupStatus;
  isUpcoming?: boolean;
  onSelect: (player: Player, type: TradeType) => void;
}

const BenchPlayerRow = React.memo(function BenchPlayerRow({
  sub,
  teamColor,
  holdingQty,
  status,
  isUpcoming = false,
  onSelect,
}: BenchPlayerRowProps) {
  const base = roundToTen(
    sub.basePrice ?? sub.openPrice ?? sub.initialPrice ?? sub.currentPrice
  );
  const open = isUpcoming
    ? base
    : roundToTen(sub.openPrice ?? sub.basePrice ?? sub.initialPrice);
  const hasPlayed =
    status.subInMinute !== undefined ||
    status.subOutMinute !== undefined ||
    status.goals > 0 ||
    status.assists > 0 ||
    status.yellowCards > 0 ||
    status.redCards > 0;
  const displayName = formatPlayerDisplayName(sub, "full");
  const displayPrice = isUpcoming
    ? base
    : hasPlayed
    ? roundToTen(sub.currentPrice)
    : open;
  const diff = isUpcoming ? 0 : displayPrice - open;
  const pct = isUpcoming
    ? "0.00"
    : hasPlayed
    ? calculateChangePercentFromOpen(displayPrice, open).toFixed(2)
    : "0.00";
  const isUp = diff > 0;
  const isDown = diff < 0;

  return (
    <div
      data-testid={`bench-row-${sub.id}`}
      onClick={() => onSelect(sub, "BUY")}
      className="flex cursor-pointer items-center justify-between gap-2 py-2.5 px-1 transition hover:bg-gray-50"
    >
      {/* Left: Avatar + Name + Position + Rating + Card Badges + Holdings */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <PlayerAvatar
          player={sub}
          teamColorOverride={teamColor}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-900 truncate">
              {displayName}
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 leading-none">
              {sub.position}
            </span>
            {!isUpcoming && (
              <span className="rounded bg-[#F7F9F8] border border-gray-200/80 px-1 py-0.5 font-mono text-[10px] font-extrabold text-gray-700 tabular-nums leading-none">
                {sub.stats.rating.toFixed(1)}
              </span>
            )}
            <MatchCardBadges
              yellowCards={status.yellowCards}
              redCards={status.redCards}
              size="sm"
            />
            {status.goals > 0 && (
              <span className="text-[10px] font-bold text-gray-800">
                ⚽{status.goals > 1 ? status.goals : ""}
              </span>
            )}
            {status.assists > 0 && (
              <span className="text-[10px] font-bold text-sky-700">
                🅰️{status.assists > 1 ? status.assists : ""}
              </span>
            )}
            {holdingQty > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-[#00985f] leading-none">
                <ShoppingBag className="h-2.5 w-2.5" />
                {holdingQty}주
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Substitution Badges (IN → / OUT ←) + Price + Buy */}
      <div className="flex items-center gap-2 shrink-0">
        {(status.subInMinute !== undefined || status.subOutMinute !== undefined) && (
          <div
            data-testid="bench-sub-badges"
            className="flex items-center gap-1"
          >
            {status.subInMinute !== undefined && (
              <SubTimeBadge direction="IN" minute={status.subInMinute} />
            )}
            {status.subOutMinute !== undefined && (
              <SubTimeBadge direction="OUT" minute={status.subOutMinute} />
            )}
          </div>
        )}

        <div className="text-right font-mono text-xs tabular-nums">
          <span className="font-black text-gray-900">
            {displayPrice.toLocaleString()}P
          </span>
          <span
            className={`ml-1.5 text-[11px] font-bold ${
              isUp
                ? "text-[#00A878]"
                : isDown
                ? "text-[#F07868]"
                : "text-[#A8B2BC]"
            }`}
          >
            {isUp ? "+" : ""}
            {pct}%
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(sub, "BUY");
          }}
          className="rounded-lg bg-[#00A878] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95"
        >
          매수
        </button>
      </div>
    </div>
  );
});

export interface FormationPitchContentProps {
  match: Match;
  players: Player[];
  holdings: Record<string, Holding>;
  providerEventsByPlayer?: Record<string, PlayerEvent[]>;
  onSelectPlayerTrade: (
    player: Player,
    type: TradeType,
    matchContext?: ActiveMatchContext
  ) => void;
  onCollapseInline?: () => void;
}

export function FormationPitchContent({
  match,
  players,
  holdings,
  providerEventsByPlayer,
  onSelectPlayerTrade,
  onCollapseInline,
}: FormationPitchContentProps) {
  const storeMatches = useTradeStore((s) => s.matches);
  const syncedMatch = useMemo(
    () => resolveSyncedMatch(match, storeMatches),
    [match, storeMatches]
  );
  const clock = useMemo(() => resolveMatchClock(syncedMatch), [syncedMatch]);

  const [selectedSide, setSelectedSide] = useState<"HOME" | "AWAY">("HOME");
  const [isBenchOpen, setIsBenchOpen] = useState<boolean>(true);

  const activeTeam =
    selectedSide === "HOME" ? syncedMatch.homeTeam : syncedMatch.awayTeam;

  const handleSelectTeam = useCallback((side: "HOME" | "AWAY") => {
    setSelectedSide(side);
  }, []);

  useEffect(() => {
    setSelectedSide("HOME");
    setIsBenchOpen(true);
  }, [syncedMatch.id]);

  const currentTeamLineup = useMemo(
    () =>
      buildTeamLineupForMatch(syncedMatch, selectedSide, players, {
        isNationalTeamMatch,
        doesPlayerBelongToTeam,
      }),
    [syncedMatch, selectedSide, players]
  );
  const benchPlayers = currentTeamLineup.benchLineup;
  const formationLabel = currentTeamLineup.formation;

  const isUpcoming = clock.isUpcoming;

  const handleSelectWithContext = useCallback(
    (player: Player, type: TradeType) => {
      onSelectPlayerTrade(player, type, buildActiveMatchContext(syncedMatch));
    },
    [syncedMatch, onSelectPlayerTrade]
  );

  const startingPlayers = useMemo(
    () => currentTeamLineup.startingLineup.slice(0, 11),
    [currentTeamLineup]
  );

  const teamStatusById = useMemo(() => {
    const rawMap: Record<string, PlayerMatchLineupStatus> = {};
    const orderedIds: string[] = [];
    for (const p of [...startingPlayers, ...benchPlayers]) {
      orderedIds.push(p.id);
      const lineupEntry = findLineupEntryForPlayer(p, syncedMatch, selectedSide);
      const entryId =
        lineupEntry?.id !== undefined ? String(lineupEntry.id) : undefined;
      const entryExtId =
        lineupEntry?.externalId !== undefined
          ? String(lineupEntry.externalId)
          : undefined;
      const matchedProviderEvents =
        providerEventsByPlayer?.[p.id] ??
        (entryId ? providerEventsByPlayer?.[entryId] : undefined) ??
        (entryExtId ? providerEventsByPlayer?.[entryExtId] : undefined);
      rawMap[p.id] = resolvePlayerMatchStatus({
        player: p,
        match: syncedMatch,
        lineupEntry,
        providerPlayerEvents: matchedProviderEvents,
        teamSide: selectedSide,
      });
    }
    return reconcileTeamGoalMarkers(orderedIds, rawMap, activeTeam.score);
  }, [
    startingPlayers,
    benchPlayers,
    syncedMatch,
    providerEventsByPlayer,
    selectedSide,
    activeTeam.score,
  ]);

  const { homeManager, awayManager } = useMemo(
    () => resolveMatchManagers(syncedMatch),
    [syncedMatch]
  );

  const startingRows = useMemo(
    () => buildFormationRows(startingPlayers, formationLabel),
    [startingPlayers, formationLabel]
  );

  return (
    <div className="space-y-3">
      {/* Segmented Team Switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 rounded-xl bg-gray-200/75 p-1 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => handleSelectTeam("HOME")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              selectedSide === "HOME"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span
              style={{ backgroundColor: syncedMatch.homeTeam.color }}
              className="h-2 w-2 rounded-full"
            />
            <span className="truncate">{syncedMatch.homeTeam.name}</span>
            <span className="font-mono text-[10px] text-gray-400">
              ({resolvePitchFormationLabel(syncedMatch.homeTeam.formation, "HOME")})
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTeam("AWAY")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              selectedSide === "AWAY"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span
              style={{ backgroundColor: syncedMatch.awayTeam.color }}
              className="h-2 w-2 rounded-full"
            />
            <span className="truncate">{syncedMatch.awayTeam.name}</span>
            <span className="font-mono text-[10px] text-gray-400">
              ({resolvePitchFormationLabel(syncedMatch.awayTeam.formation, "AWAY")})
            </span>
          </button>
        </div>

        {onCollapseInline && (
          <button
            type="button"
            onClick={onCollapseInline}
            className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-100"
          >
            접기
          </button>
        )}
      </div>

      {isUpcoming && (
        <div className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-[11px] font-bold text-amber-900">
          예상 선발 · 킥오프 45분 전 공식 라인업 확정
        </div>
      )}

      {/* Guide Pill */}
      <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1 font-medium truncate">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#00A878]" />
          <span className="truncate">선수를 터치하면 차트·주문 창이 열립니다</span>
        </span>
        <span className="shrink-0 font-mono font-bold text-gray-700">
          {formationLabel} · {startingPlayers.slice(0, 11).length}명
        </span>
      </div>

      {/* Soft Ivory Green Pitch Container */}
      <div className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-[#00A878]/25 bg-[#E8F5EF]">
        {/* Crisp White 1.5px Pitch Markings */}
        <div className="pointer-events-none absolute inset-2 sm:inset-3 rounded-xl border-[1.5px] border-white">
          <div className="mx-auto h-12 sm:h-14 w-36 sm:w-44 border-x-[1.5px] border-b-[1.5px] border-white" />
          <div className="mx-auto -mt-12 sm:-mt-14 h-5 sm:h-6 w-16 sm:w-20 border-x-[1.5px] border-b-[1.5px] border-white" />
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-[1.5px] border-white" />
          <div className="absolute left-1/2 top-1/2 h-16 w-16 sm:h-20 sm:w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          <div className="absolute bottom-0 left-1/2 h-12 sm:h-14 w-36 sm:w-44 -translate-x-1/2 border-x-[1.5px] border-t-[1.5px] border-white" />
          <div className="absolute bottom-0 left-1/2 h-5 sm:h-6 w-16 sm:w-20 -translate-x-1/2 border-x-[1.5px] border-t-[1.5px] border-white" />
        </div>

        {/* Players Positioned by Formation Rows */}
        <div className="relative z-10 flex min-h-[370px] sm:min-h-[430px] flex-col justify-between py-3.5 sm:py-5 px-1 sm:px-2">
          {startingRows.length === 0 ? (
            <div className="my-auto mx-auto max-w-[280px] rounded-2xl border border-[#00A878]/20 bg-white/95 px-4 py-5 text-center shadow-xs">
              <p className="text-xs font-extrabold text-gray-900">
                {isUpcoming ? "공식 선발 라인업 발표 전입니다" : "공식 선발 라인업 정보 없음"}
              </p>
              <p className="mt-1 text-[11px] font-medium text-gray-500 leading-relaxed">
                {isUpcoming
                  ? "킥오프 약 45분 전 공식 라인업이 공개되면 실제 출전 명단이 자동으로 표시됩니다."
                  : "이 경기는 API에서 공식 선발 라인업이 제공되지 않았습니다."}
              </p>
            </div>
          ) : (
            startingRows.map((row, rowIdx) => (
              <div
                key={`${selectedSide}-row-${rowIdx}`}
                className="flex items-center justify-around gap-1 sm:gap-1.5"
              >
                {row.map((player) => (
                  <PitchPlayerNode
                    key={`${player.id}-${player.position}`}
                    player={player}
                    teamColor={activeTeam.color}
                    holdingQty={holdings[player.id]?.quantity ?? 0}
                    status={
                      teamStatusById[player.id] ??
                      resolvePlayerMatchStatus({
                        player,
                        match: syncedMatch,
                        providerPlayerEvents: providerEventsByPlayer?.[player.id],
                        teamSide: selectedSide,
                      })
                    }
                    isUpcoming={isUpcoming}
                    onSelect={handleSelectWithContext}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Collapsible Bench (Substitutes / 교체명단) Accordion */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setIsBenchOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#00A878]" />
            <span
              data-testid="bench-section-title"
              className="text-xs font-extrabold text-gray-900"
            >
              교체명단 ({benchPlayers.length}명)
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-400">
            <span>{isBenchOpen ? "접기" : "펼치기"}</span>
            {isBenchOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </button>

        {isBenchOpen && (
          <div className="border-t border-gray-100">
            {benchPlayers.length === 0 ? (
              <div className="px-4 py-3 text-center text-[11px] font-medium text-gray-400">
                {isUpcoming
                  ? "라인업 공개 시 교체 명단이 표시됩니다."
                  : "제공된 교체 명단이 없습니다."}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 px-3 py-1">
                {benchPlayers.map((sub) => (
                  <BenchPlayerRow
                    key={`${sub.id}-${sub.position}`}
                    sub={sub}
                    teamColor={activeTeam.color}
                    holdingQty={holdings[sub.id]?.quantity ?? 0}
                    status={
                      teamStatusById[sub.id] ??
                      resolvePlayerMatchStatus({
                        player: sub,
                        match: syncedMatch,
                        providerPlayerEvents: providerEventsByPlayer?.[sub.id],
                        teamSide: selectedSide,
                      })
                    }
                    isUpcoming={isUpcoming}
                    onSelect={handleSelectWithContext}
                  />
                ))}
              </div>
            )}

            {/* Non-tradable Team Managers Row (감독) - always visible inside 교체명단 */}
            <div
              data-testid="bench-managers-section"
              className="border-t border-gray-100 bg-[#F9FAFB] px-3 py-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-gray-500">
                  감독
                </span>
                <span className="text-[10px] font-medium text-gray-400">
                  양 팀 사령탑 (비거래)
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    side: "HOME",
                    teamName: syncedMatch.homeTeam.name,
                    shortName: syncedMatch.homeTeam.shortName,
                    color: syncedMatch.homeTeam.color,
                    managerName: homeManager ?? "감독 정보 미제공",
                    isMissing: !homeManager,
                  },
                  {
                    side: "AWAY",
                    teamName: syncedMatch.awayTeam.name,
                    shortName: syncedMatch.awayTeam.shortName,
                    color: syncedMatch.awayTeam.color,
                    managerName: awayManager ?? "감독 정보 미제공",
                    isMissing: !awayManager,
                  },
                ].map((mgr) => (
                  <div
                    key={mgr.side}
                    data-testid={`manager-card-${mgr.side.toLowerCase()}`}
                    className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-white px-2.5 py-2 select-none"
                  >
                    <div
                      className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200/80 bg-[#F7F9F8]"
                      aria-label={`${mgr.managerName} 감독`}
                    >
                      <svg
                        viewBox="0 0 64 64"
                        width={32}
                        height={32}
                        className="block h-full w-full"
                        role="img"
                        aria-hidden="true"
                      >
                        <circle cx="32" cy="22" r="9" fill={mgr.color} opacity="0.9" />
                        <path
                          d="M16 53 C16 40 22 34 32 34 C42 34 48 40 48 53 Z"
                          fill={mgr.color}
                          opacity="0.88"
                        />
                        <path
                          d="M27 34 L32 45 L37 34"
                          fill="#FFFFFF"
                          opacity="0.9"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-xs font-extrabold ${
                          mgr.isMissing ? "text-gray-400" : "text-gray-900"
                        }`}
                      >
                        {mgr.managerName}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-gray-500">
                        {mgr.teamName} ({mgr.shortName})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FormationPitchModal({
  match,
  players,
  holdings,
  onClose,
  onSelectPlayerTrade,
}: FormationPitchModalProps) {
  const storeMatches = useTradeStore((s) => s.matches);
  const syncedMatch = useMemo(
    () => (match ? resolveSyncedMatch(match, storeMatches) : null),
    [match, storeMatches]
  );
  const clock = useMemo(
    () => (syncedMatch ? resolveMatchClock(syncedMatch) : null),
    [syncedMatch]
  );
  const score = useMemo(
    () => (syncedMatch ? resolveMatchScore(syncedMatch) : null),
    [syncedMatch]
  );

  if (!syncedMatch || !clock || !score) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-40 flex items-end justify-center bg-black/55 animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-[#F7F9F8] shadow-2xl animate-slideUp"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3.5 shrink-0">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold tabular-nums border ${
                  clock.isLive
                    ? clock.isHalfTime
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-emerald-50 text-[#00A878] border-emerald-200"
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                {clock.cardLabel}
              </span>
              <span className="text-xs font-bold text-gray-500">
                {syncedMatch.leagueName}
              </span>
            </div>
            <h2 className="mt-0.5 text-sm font-extrabold text-gray-900">
              {syncedMatch.homeTeam.name}{" "}
              <span className="font-mono text-[#00A878] tabular-nums">
                {score.display}
              </span>{" "}
              {syncedMatch.awayTeam.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Single Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
          <FormationPitchContent
            match={syncedMatch}
            players={players}
            holdings={holdings}
            onSelectPlayerTrade={onSelectPlayerTrade}
          />
        </div>
      </div>
    </div>
  );
}
