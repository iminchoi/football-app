"use client";

import React, { useMemo, useState } from "react";
import {
  Users,
  Plus,
  PlusCircle,
  Trash2,
  MessageSquare,
  Send,
  Lock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LogIn,
  ShieldCheck,
  Sparkles,
  RotateCcw,
  X,
} from "lucide-react";
import {
  ActiveMatchContext,
  Player,
  PositionLine,
  SquadFeedPlayerSnapshot,
  SquadFeedPost,
  TradeType,
  getPositionLine,
} from "@/types";
import {
  normalizeAccountKey,
  roundToTen,
  useTradeStore,
} from "@/store/useTradeStore";
import { resolveHoldingPlayer } from "@/lib/playerQuote";
import {
  formatPlayerDisplayName,
  resolvePlayerDisplayName,
} from "@/lib/playerDisplayName";
import {
  MAX_SQUAD_COMMENT_LENGTH,
  MAX_SQUAD_DESCRIPTION_LENGTH,
  MAX_SQUAD_TITLE_LENGTH,
  REQUIRED_SQUAD_SIZE,
  SQUAD_FORMATIONS,
  assignPlayerToSquadSlot,
  clearSquadSlot,
  extractOrderedPlayerIdsFromSlots,
  getSquadFormationSlots,
  placeSnapshotsOnFormation,
  pruneUnownedSlotAssignments,
  remapSquadSlotsForFormation,
  resolveSquadAuthorHoldings,
  resolveSquadFeedSaleSummary,
  validateSquadDraft,
  type SquadFormationOption,
  type SquadSlotAssignments,
} from "@/lib/squadFeed";
import PlayerAvatar from "@/components/PlayerAvatar";
import SquadPlayerPickerModal, {
  type OwnedSquadCandidate,
} from "@/components/squad/SquadPlayerPickerModal";

interface SquadFeedTabViewProps {
  onSelectPlayerTrade: (
    player: Player,
    type: TradeType,
    matchContext?: ActiveMatchContext | null
  ) => void;
  onOpenAuthModal: () => void;
}

type SquadSubView = "FEED" | "MAKER";
type FeedFilterMode = "ALL" | "MINE";

function formatRelativeTime(isoStr: string): string {
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 1000));
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return dt.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function snapshotToDisplayPlayer(
  snap: SquadFeedPlayerSnapshot,
  storePlayers: Player[]
): Player {
  const live = storePlayers.find((p) => p.id === snap.playerId);
  if (live) return live;
  return {
    id: snap.playerId,
    name: snap.name,
    englishName: snap.englishName ?? snap.name,
    nationalTeam: "",
    matchId: "unknown",
    teamId: snap.teamShort.toLowerCase(),
    teamName: snap.teamName,
    teamShort: snap.teamShort,
    teamColor: snap.teamColor,
    position: snap.position,
    backNumber: snap.backNumber,
    tier: "B",
    totalShares: 2500,
    marketSupply: 1000,
    basePrice: snap.publishedPrice,
    openPrice: snap.publishedPrice,
    initialPrice: snap.publishedPrice,
    currentPrice: snap.publishedPrice,
    previousPrice: snap.publishedPrice,
    events: [],
    priceHistory: [{ minute: 0, timeLabel: "0'", price: snap.publishedPrice }],
    lastEvent: { text: "스쿼드 피드 스냅샷", sentiment: "neutral", minute: 0 },
    stats: { rating: 7.0, goals: 0, assists: 0, shotsOnTarget: 0, keyPasses: 0 },
  };
}

function PitchFieldMarkings() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-3 rounded-xl border border-white/25"
    >
      {/* Top penalty area & 6-yard box */}
      <div className="mx-auto h-[15%] w-[52%] border-x border-b border-white/25" />
      <div className="absolute left-1/2 top-0 h-[6.5%] w-[24%] -translate-x-1/2 border-x border-b border-white/25" />
      <div className="absolute left-1/2 top-[11%] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/35" />

      {/* Halfway line & center circle */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 sm:h-24 sm:w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />

      {/* Bottom penalty area & 6-yard box */}
      <div className="absolute bottom-0 left-1/2 h-[15%] w-[52%] -translate-x-1/2 border-x border-t border-white/25" />
      <div className="absolute bottom-0 left-1/2 h-[6.5%] w-[24%] -translate-x-1/2 border-x border-t border-white/25" />
      <div className="absolute bottom-[11%] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/35" />
    </div>
  );
}

export default function SquadFeedTabView({
  onSelectPlayerTrade,
  onOpenAuthModal,
}: SquadFeedTabViewProps) {
  const user = useTradeStore((s) => s.user);
  const accounts = useTradeStore((s) => s.accounts);
  const holdings = useTradeStore((s) => s.holdings);
  const players = useTradeStore((s) => s.players);
  const transactions = useTradeStore((s) => s.transactions);
  const playerPrices = useTradeStore((s) => s.playerPrices);
  const squadFeeds = useTradeStore((s) => s.squadFeeds);
  const setActiveTab = useTradeStore((s) => s.setActiveTab);
  const publishSquadFeed = useTradeStore((s) => s.publishSquadFeed);
  const deleteSquadFeed = useTradeStore((s) => s.deleteSquadFeed);
  const addSquadComment = useTradeStore((s) => s.addSquadComment);
  const deleteSquadComment = useTradeStore((s) => s.deleteSquadComment);

  const [subView, setSubView] = useState<SquadSubView>(() =>
    squadFeeds.length > 0 ? "FEED" : "MAKER"
  );
  const [feedFilter, setFeedFilter] = useState<FeedFilterMode>("ALL");

  // FC Online style interactive pitch maker state
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftDescription, setDraftDescription] = useState<string>("");
  const [draftFormation, setDraftFormation] =
    useState<SquadFormationOption>("4-3-3");
  const [slotAssignments, setSlotAssignments] = useState<SquadSlotAssignments>(
    {}
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [makerFeedback, setMakerFeedback] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  // Feed interaction state
  const [expandedRosterFeedIds, setExpandedRosterFeedIds] = useState<string[]>(
    []
  );
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>(
    {}
  );
  const [commentErrorByFeed, setCommentErrorByFeed] = useState<
    Record<string, string>
  >({});

  // Resolve all currently owned players (quantity > 0), including dynamic API-Football players
  const ownedPlayers = useMemo<OwnedSquadCandidate[]>(() => {
    if (!user) return [];
    const list: OwnedSquadCandidate[] = [];
    for (const h of Object.values(holdings)) {
      if (!h || h.quantity <= 0) continue;
      const resolved = resolveHoldingPlayer(
        h,
        players,
        transactions,
        playerPrices
      );
      list.push({
        player: resolved,
        quantity: h.quantity,
        avgBuyPrice: roundToTen(h.avgBuyPrice),
      });
    }
    return list.sort((a, b) => {
      const order: Record<PositionLine, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
      const diff =
        order[getPositionLine(a.player.position)] -
        order[getPositionLine(b.player.position)];
      if (diff !== 0) return diff;
      return b.quantity - a.quantity;
    });
  }, [user, holdings, players, transactions, playerPrices]);

  const ownedById = useMemo(() => {
    const map: Record<string, OwnedSquadCandidate> = {};
    for (const item of ownedPlayers) {
      map[item.player.id] = item;
    }
    return map;
  }, [ownedPlayers]);

  const playersByIdForRemap = useMemo(() => {
    const map: Record<string, Pick<Player, "position">> = {};
    for (const item of ownedPlayers) {
      map[item.player.id] = { position: item.player.position };
    }
    return map;
  }, [ownedPlayers]);

  const formationSlots = useMemo(
    () => getSquadFormationSlots(draftFormation),
    [draftFormation]
  );

  // Keep pitch assignments synced with still-owned holdings
  const activeSlotAssignments = useMemo(
    () => pruneUnownedSlotAssignments(slotAssignments, holdings),
    [slotAssignments, holdings]
  );

  const assignedPlayerIds = useMemo(
    () => extractOrderedPlayerIdsFromSlots(activeSlotAssignments),
    [activeSlotAssignments]
  );

  const assignedSlotLabelByPlayerId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of formationSlots) {
      const pid = activeSlotAssignments[s.slotIndex];
      if (pid) map[pid] = s.label;
    }
    return map;
  }, [formationSlots, activeSlotAssignments]);

  const selectedLineCounts = useMemo(() => {
    const counts: Record<PositionLine, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
    for (const pid of assignedPlayerIds) {
      const candidate = ownedById[pid];
      if (!candidate) continue;
      counts[getPositionLine(candidate.player.position)] += 1;
    }
    return counts;
  }, [assignedPlayerIds, ownedById]);

  const squadValuation = useMemo(() => {
    let totalPoints = 0;
    let totalShares = 0;
    for (const pid of assignedPlayerIds) {
      const item = ownedById[pid];
      if (!item) continue;
      totalPoints += item.player.currentPrice * item.quantity;
      totalShares += item.quantity;
    }
    return { totalPoints: roundToTen(totalPoints), totalShares };
  }, [assignedPlayerIds, ownedById]);

  const draftValidation = useMemo(
    () =>
      validateSquadDraft({
        title: draftTitle,
        description: draftDescription,
        formation: draftFormation,
        slotAssignments: activeSlotAssignments,
        holdings,
        players,
        transactions,
        playerPrices,
      }),
    [
      draftTitle,
      draftDescription,
      draftFormation,
      activeSlotAssignments,
      holdings,
      players,
      transactions,
      playerPrices,
    ]
  );

  const activeSlot =
    activeSlotIndex !== null ? formationSlots[activeSlotIndex] ?? null : null;
  const currentSlotPlayerId =
    activeSlotIndex !== null
      ? activeSlotAssignments[activeSlotIndex] ?? null
      : null;

  const myFeedsCount = useMemo(() => {
    if (!user) return 0;
    const key = normalizeAccountKey(user.id);
    return squadFeeds.filter((f) => normalizeAccountKey(f.authorId) === key)
      .length;
  }, [squadFeeds, user]);

  const visibleFeeds = useMemo(() => {
    if (feedFilter === "MINE" && user) {
      const key = normalizeAccountKey(user.id);
      return squadFeeds.filter((f) => normalizeAccountKey(f.authorId) === key);
    }
    return squadFeeds;
  }, [squadFeeds, feedFilter, user]);

  const handleChangeFormation = (nextFormation: SquadFormationOption) => {
    if (nextFormation === draftFormation) return;
    setMakerFeedback(null);
    const remapped = remapSquadSlotsForFormation({
      currentAssignments: activeSlotAssignments,
      fromFormation: draftFormation,
      toFormation: nextFormation,
      playersById: playersByIdForRemap,
    });
    setDraftFormation(nextFormation);
    setSlotAssignments(remapped);
    setActiveSlotIndex(null);
  };

  const handleOpenSlotPicker = (slotIndex: number) => {
    if (!user) {
      onOpenAuthModal();
      return;
    }
    setMakerFeedback(null);
    setActiveSlotIndex(slotIndex);
  };

  const handleAssignPlayerToActiveSlot = (playerId: string) => {
    if (activeSlotIndex === null) return;
    const res = assignPlayerToSquadSlot({
      slotAssignments: activeSlotAssignments,
      slotIndex: activeSlotIndex,
      playerId,
      holdings,
    });
    if (!res.success) {
      setMakerFeedback({ type: "error", text: res.message });
      return;
    }
    setSlotAssignments(res.slotAssignments);
    setMakerFeedback(null);
    setActiveSlotIndex(null);
  };

  const handleClearSingleSlot = (slotIndex: number) => {
    setSlotAssignments(clearSquadSlot(activeSlotAssignments, slotIndex));
    setMakerFeedback(null);
    if (activeSlotIndex === slotIndex) {
      setActiveSlotIndex(null);
    }
  };

  const handleResetMaker = () => {
    setSlotAssignments({});
    setDraftTitle("");
    setDraftDescription("");
    setActiveSlotIndex(null);
    setMakerFeedback(null);
  };

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuthModal();
      return;
    }

    const res = publishSquadFeed({
      title: draftTitle,
      description: draftDescription,
      formation: draftFormation,
      slotAssignments: activeSlotAssignments,
      playerIds: assignedPlayerIds,
    });

    if (!res.success) {
      setMakerFeedback({ type: "error", text: res.message });
      return;
    }

    setDraftTitle("");
    setDraftDescription("");
    setSlotAssignments({});
    setActiveSlotIndex(null);
    setMakerFeedback({ type: "success", text: res.message });
    setSubView("FEED");
    setFeedFilter("ALL");
  };

  const handleDeleteFeed = (feedId: string) => {
    deleteSquadFeed(feedId);
  };

  const handleToggleRoster = (feedId: string) => {
    setExpandedRosterFeedIds((prev) =>
      prev.includes(feedId)
        ? prev.filter((id) => id !== feedId)
        : [...prev, feedId]
    );
  };

  const handleSubmitComment = (e: React.FormEvent, feedId: string) => {
    e.preventDefault();
    if (!user) {
      onOpenAuthModal();
      return;
    }
    const text = commentInputs[feedId] ?? "";
    const res = addSquadComment(feedId, text);
    if (!res.success) {
      setCommentErrorByFeed((prev) => ({ ...prev, [feedId]: res.message }));
      return;
    }
    setCommentInputs((prev) => ({ ...prev, [feedId]: "" }));
    setCommentErrorByFeed((prev) => ({ ...prev, [feedId]: "" }));
  };

  const renderFeedCard = (feed: SquadFeedPost) => {
    const authorHoldings = resolveSquadAuthorHoldings({
      authorId: feed.authorId,
      activeUser: user,
      activeHoldings: holdings,
      accounts,
    });
    const saleSummary = resolveSquadFeedSaleSummary(feed, authorHoldings);

    const canDeletePost =
      Boolean(user) &&
      (normalizeAccountKey(user!.id) === normalizeAccountKey(feed.authorId) ||
        user!.role === "admin");

    const placedSnapshots = placeSnapshotsOnFormation(
      feed.players,
      feed.formation
    );
    const isRosterExpanded = expandedRosterFeedIds.includes(feed.id);

    const summaryBadgeClasses =
      saleSummary.status === "FULLY_SOLD"
        ? "bg-rose-50 text-[#E11D48] border-rose-200"
        : saleSummary.status === "PARTIAL_SOLD"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-emerald-50 text-[#00985f] border-emerald-200";

    const saleCaptionParts: string[] = [];
    if (saleSummary.partialSoldCount > 0) {
      saleCaptionParts.push(`일부 매도 ${saleSummary.partialSoldCount}명`);
    }
    if (saleSummary.fullySoldCount > 0) {
      saleCaptionParts.push(`전량 매도 ${saleSummary.fullySoldCount}명`);
    }

    return (
      <article
        key={feed.id}
        data-testid={`squad-feed-card-${feed.id}`}
        className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        {/* Top Meta Header */}
        <div className="border-b border-gray-100 px-4 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[10px] font-black text-white">
                  {feed.authorName.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-xs font-extrabold text-gray-900">
                  {feed.authorName}
                </span>
                <span className="font-mono text-[10px] font-semibold text-gray-400">
                  · {formatRelativeTime(feed.createdAt)}
                </span>
                <span className="rounded-md bg-[#0B4631] px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-white">
                  {feed.formation}
                </span>

                {/* Squad-level Sale Badge ('전원 보유 중' | '일부 매도' | '전량 매도') */}
                <span
                  data-testid={`squad-sale-badge-${feed.id}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${summaryBadgeClasses}`}
                >
                  {saleSummary.label}
                </span>
              </div>

              <h3 className="mt-1.5 text-sm sm:text-base font-black tracking-tight text-gray-900">
                {feed.title}
              </h3>

              {feed.description && (
                <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                  {feed.description}
                </p>
              )}

              {saleCaptionParts.length > 0 && (
                <p
                  data-testid={`squad-sale-caption-${feed.id}`}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1 text-[11px] font-bold text-gray-700 border border-gray-200/70"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>
                    발행 이후 보유 변동: {saleCaptionParts.join(" · ")} (보유 유지{" "}
                    {saleSummary.holdingCount}명)
                  </span>
                </p>
              )}
            </div>

            {/* Immutability Notice & Delete-Only Action (NO Edit Button) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {canDeletePost && (
                <>
                  <span
                    title="발행된 스쿼드는 수정할 수 없으며 삭제만 가능합니다"
                    className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-500"
                  >
                    <Lock className="h-3 w-3" />
                    수정 불가
                  </span>
                  <button
                    type="button"
                    data-testid={`delete-squad-btn-${feed.id}`}
                    onClick={() => handleDeleteFeed(feed.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-[#E11D48] transition hover:bg-rose-100 active:scale-95"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 11-Player Coordinate Pitch Snapshot (All 8 Formations) */}
        <div className="px-3.5 pt-3.5 pb-2">
          <div className="relative h-[430px] sm:h-[490px] w-full overflow-hidden rounded-2xl border border-[#0B4631] bg-gradient-to-b from-[#0E553C] via-[#0B4631] to-[#093827] shadow-inner">
            <PitchFieldMarkings />

            {placedSnapshots.map(({ slot, snapshot }) => {
              const displayPlayer = snapshotToDisplayPlayer(snapshot, players);
              const sale = saleSummary.byPlayerId[snapshot.playerId];
              const displayName = resolvePlayerDisplayName(displayPlayer);
              const isFullySold = sale?.status === "FULLY_SOLD";
              const isPartialSold = sale?.status === "PARTIAL_SOLD";

              return (
                <button
                  key={`${feed.id}-${slot.slotIndex}`}
                  type="button"
                  onClick={() => onSelectPlayerTrade(displayPlayer, "BUY")}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  title={`${displayName.full} (${slot.label}) · 발행 ${sale?.publishedQuantity ?? 1}주 / 현재 ${sale?.currentQuantity ?? 0}주`}
                  className={`absolute z-10 flex w-[62px] sm:w-[78px] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl border bg-white/95 px-1 py-1.5 shadow-md transition hover:-translate-y-[54%] hover:border-[#10B981] ${
                    isFullySold
                      ? "border-rose-400 opacity-85"
                      : isPartialSold
                      ? "border-amber-400"
                      : "border-white/80"
                  }`}
                >
                  {(isFullySold || isPartialSold) && (
                    <span
                      data-testid={`player-sale-badge-${feed.id}-${snapshot.playerId}`}
                      className={`mb-0.5 rounded-full px-1.5 py-0.5 text-[7.5px] font-black leading-none whitespace-nowrap ${
                        isFullySold
                          ? "bg-rose-100 text-[#E11D48]"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {sale.label}
                    </span>
                  )}

                  <PlayerAvatar
                    player={displayPlayer}
                    teamColorOverride={snapshot.teamColor}
                    size={28}
                  />

                  <span className="mt-1 w-full truncate text-center text-[9.5px] sm:text-[10px] font-extrabold text-gray-900">
                    {displayName.pitch}
                  </span>

                  <div className="flex items-center gap-0.5 font-mono text-[8px] sm:text-[8.5px] font-bold text-gray-500 tabular-nums">
                    <span>{snapshot.slotLabel ?? slot.label}</span>
                    <span>·</span>
                    <span
                      className={
                        isFullySold
                          ? "text-[#E11D48]"
                          : isPartialSold
                          ? "text-amber-700"
                          : "text-[#00985f]"
                      }
                    >
                      {sale?.currentQuantity ?? 0}/{sale?.publishedQuantity ?? 1}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Toggle Detailed 11-Player Roster & Sell Status Breakdown */}
          <button
            type="button"
            onClick={() => handleToggleRoster(feed.id)}
            className="mt-2.5 flex w-full items-center justify-between rounded-xl border border-gray-200/80 bg-[#F7F9F8] px-3 py-2 text-[11px] font-bold text-gray-700 transition hover:bg-gray-100"
          >
            <span>선수별 보유·매도 현황 (11명)</span>
            {isRosterExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {isRosterExpanded && (
            <div className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200/80 bg-white px-3">
              {feed.players.map((snap) => {
                const sale = saleSummary.byPlayerId[snap.playerId];
                const displayPlayer = snapshotToDisplayPlayer(snap, players);
                const fullName = formatPlayerDisplayName(displayPlayer, "full");
                return (
                  <div
                    key={snap.playerId}
                    onClick={() => onSelectPlayerTrade(displayPlayer, "BUY")}
                    className="flex cursor-pointer items-center justify-between gap-2 py-2 hover:bg-gray-50/70"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar
                        player={displayPlayer}
                        teamColorOverride={snap.teamColor}
                        size={28}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-extrabold text-gray-900">
                            {fullName}
                          </span>
                          <span className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[9px] font-bold text-gray-600">
                            {snap.position}
                          </span>
                          {snap.slotLabel && snap.slotLabel !== snap.position && (
                            <span className="rounded bg-emerald-50 px-1 py-0.5 font-mono text-[9px] font-bold text-[#00985f]">
                              {snap.slotLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-gray-400">
                          {snap.teamName} · 발행 시 {snap.publishedQuantity}주 (
                          {snap.publishedPrice.toLocaleString()}P)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] font-bold text-gray-600 tabular-nums">
                        현재 {sale?.currentQuantity ?? 0}주
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${
                          sale?.status === "FULLY_SOLD"
                            ? "border-rose-200 bg-rose-50 text-[#E11D48]"
                            : sale?.status === "PARTIAL_SOLD"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-[#00985f]"
                        }`}
                      >
                        {sale?.label ?? "보유 중"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Community Comments Section */}
        <div className="border-t border-gray-100 bg-[#F9FAFB] px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-gray-700">
            <MessageSquare className="h-3.5 w-3.5 text-[#00A878]" />
            <span>코멘트 ({feed.comments.length})</span>
          </div>

          {feed.comments.length > 0 && (
            <div className="mb-2.5 space-y-1.5">
              {feed.comments.map((comment) => {
                const canDeleteComment =
                  Boolean(user) &&
                  (normalizeAccountKey(user!.id) ===
                    normalizeAccountKey(comment.authorId) ||
                    normalizeAccountKey(user!.id) ===
                      normalizeAccountKey(feed.authorId) ||
                    user!.role === "admin");

                return (
                  <div
                    key={comment.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-gray-200/70 bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-extrabold text-gray-900">
                          {comment.authorName}
                        </span>
                        <span className="font-mono text-[10px] text-gray-400">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-700 break-words leading-relaxed">
                        {comment.content}
                      </p>
                    </div>
                    {canDeleteComment && (
                      <button
                        type="button"
                        onClick={() => deleteSquadComment(feed.id, comment.id)}
                        title="코멘트 삭제"
                        className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-rose-50 hover:text-[#E11D48]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <form
            onSubmit={(e) => handleSubmitComment(e, feed.id)}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={commentInputs[feed.id] ?? ""}
              onChange={(e) => {
                setCommentInputs((prev) => ({
                  ...prev,
                  [feed.id]: e.target.value,
                }));
                if (commentErrorByFeed[feed.id]) {
                  setCommentErrorByFeed((prev) => ({ ...prev, [feed.id]: "" }));
                }
              }}
              maxLength={MAX_SQUAD_COMMENT_LENGTH}
              placeholder={
                user
                  ? "이 스쿼드에 대한 의견이나 전략 코멘트를 남겨보세요..."
                  : "로그인 후 코멘트를 작성할 수 있습니다"
              }
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#00A878] focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#00A878] px-3 py-2 text-xs font-bold text-white transition hover:opacity-95 active:scale-95"
            >
              <Send className="h-3.5 w-3.5" />
              등록
            </button>
          </form>
          {commentErrorByFeed[feed.id] && (
            <p className="mt-1 text-[11px] font-semibold text-[#E11D48]">
              {commentErrorByFeed[feed.id]}
            </p>
          )}
        </div>
      </article>
    );
  };

  return (
    <div
      className={`mx-auto w-full px-3 sm:px-4 py-4 space-y-4 ${
        subView === "MAKER" ? "max-w-[1160px]" : "max-w-4xl"
      }`}
    >
      {/* Top Bar + Sub-view Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-gray-200/90 bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#00A878]" />
            <h1 className="text-base font-black tracking-tight text-gray-900">
              스쿼드 메이커 & 커뮤니티 피드
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            피치 슬롯을 클릭해 보유 선수 11명(GK 필수)을 배치하고 커뮤니티에 발행하세요.
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1 text-xs font-extrabold shrink-0">
          <button
            type="button"
            onClick={() => setSubView("FEED")}
            className={`rounded-lg px-3 py-2 transition whitespace-nowrap ${
              subView === "FEED"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            커뮤니티 피드 ({squadFeeds.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setMakerFeedback(null);
              setSubView("MAKER");
            }}
            className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 transition whitespace-nowrap ${
              subView === "MAKER"
                ? "bg-[#00A878] text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            스쿼드 메이커
          </button>
        </div>
      </div>

      {makerFeedback && subView === "FEED" && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-[#00985f]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{makerFeedback.text}</span>
        </div>
      )}

      {/* VIEW 1: COMMUNITY FEED */}
      {subView === "FEED" && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFeedFilter("ALL")}
                className={`rounded-full px-3 py-1 text-xs font-bold border transition ${
                  feedFilter === "ALL"
                    ? "border-[#00A878] bg-emerald-50 text-[#00985f]"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                전체 피드 ({squadFeeds.length})
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => setFeedFilter("MINE")}
                  className={`rounded-full px-3 py-1 text-xs font-bold border transition ${
                    feedFilter === "MINE"
                      ? "border-[#00A878] bg-emerald-50 text-[#00985f]"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  내 스쿼드 ({myFeedsCount})
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setMakerFeedback(null);
                setSubView("MAKER");
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gray-800"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              새 스쿼드 발행
            </button>
          </div>

          {visibleFeeds.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#00A878]">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-sm font-extrabold text-gray-900">
                {feedFilter === "MINE"
                  ? "아직 내가 발행한 스쿼드 피드가 없습니다."
                  : "아직 발행된 스쿼드 피드가 없습니다."}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                피치 위 11개 포지션에 보유 선수(GK 1명 이상 필수)를 배치해 첫 스쿼드를 발행해보세요.
              </p>
              <button
                type="button"
                onClick={() => setSubView("MAKER")}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#00A878] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:opacity-95"
              >
                <PlusCircle className="h-4 w-4" />
                스쿼드 메이커 열기
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleFeeds.map((feed) => renderFeedCard(feed))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: FC ONLINE STYLE INTERACTIVE PITCH + RIGHT CONTROL PANEL */}
      {subView === "MAKER" && (
        <div className="space-y-3.5">
          {!user ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-14 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                <LogIn className="h-6 w-6" />
              </div>
              <p className="text-sm font-extrabold text-gray-900">
                로그인 후 보유 선수로 스쿼드를 구성할 수 있습니다.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                실제 보유 중인 선수 11명(GK 포함)을 피치에 배치해 커뮤니티 피드에 발행할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#00A878] px-4 py-2.5 text-xs font-extrabold text-white"
              >
                <LogIn className="h-4 w-4" />
                로그인 / 회원가입
              </button>
            </div>
          ) : (
            <>
              {/* Formation Selector Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200/90 bg-white px-3.5 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="mr-1 shrink-0 text-[11px] font-extrabold text-gray-500">
                    포메이션
                  </span>
                  {SQUAD_FORMATIONS.map((fmt) => {
                    const isActive = fmt === draftFormation;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        data-testid={`formation-btn-${fmt}`}
                        onClick={() => handleChangeFormation(fmt)}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-xs font-extrabold tabular-nums transition ${
                          isActive
                            ? "bg-[#0B4631] text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                        }`}
                      >
                        {fmt}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 shrink-0 text-[11px] font-bold text-gray-500">
                  <span className="font-mono tabular-nums text-gray-800">
                    보유 선수 {ownedPlayers.length}명
                  </span>
                  {ownedPlayers.length < REQUIRED_SQUAD_SIZE && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("MARKET")}
                      className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-900 hover:bg-amber-200"
                    >
                      +{REQUIRED_SQUAD_SIZE - ownedPlayers.length}명 추가 매수
                    </button>
                  )}
                </div>
              </div>

              {/* 2-Column Main Split: Left/Center Interactive Pitch + Right Control Panel */}
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                {/* LEFT/CENTER: INTERACTIVE TACTICAL PITCH */}
                <section className="min-w-0 flex-1 space-y-2.5">
                  <div
                    data-testid="squad-maker-pitch"
                    className="relative h-[530px] sm:h-[610px] lg:h-[650px] w-full overflow-hidden rounded-2xl border border-[#0B4631] bg-gradient-to-b from-[#0E553C] via-[#0B4631] to-[#083525] shadow-md select-none"
                  >
                    <PitchFieldMarkings />

                    {/* Top-Left Subtle Formation Watermark */}
                    <div className="pointer-events-none absolute left-5 top-4 z-10 flex items-center gap-2">
                      <span className="rounded-lg bg-black/30 px-2.5 py-1 font-mono text-xs font-black tracking-tight text-white/95 backdrop-blur-sm">
                        {draftFormation}
                      </span>
                      <span className="rounded-lg bg-black/25 px-2 py-1 font-mono text-[11px] font-bold text-emerald-200 tabular-nums">
                        {assignedPlayerIds.length} / {REQUIRED_SQUAD_SIZE}
                      </span>
                    </div>

                    {/* 11 Interactive Position Slots (Smoothly Transitioning Coordinates) */}
                    {formationSlots.map((slot) => {
                      const assignedId = activeSlotAssignments[slot.slotIndex];
                      const assigned = assignedId ? ownedById[assignedId] : null;
                      const isSelectedSlot = activeSlotIndex === slot.slotIndex;
                      const isGkSlot = slot.line === "GK";

                      if (assigned) {
                        const displayName = resolvePlayerDisplayName(
                          assigned.player
                        );
                        const playerIsGk =
                          getPositionLine(assigned.player.position) === "GK";

                        return (
                          <div
                            key={slot.slotIndex}
                            data-testid={`pitch-slot-${slot.slotIndex}`}
                            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-300 ease-out"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => handleOpenSlotPicker(slot.slotIndex)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleOpenSlotPicker(slot.slotIndex);
                                }
                              }}
                              title={`${slot.label} · ${displayName.full} (${assigned.quantity}주) — 클릭하여 교체 또는 비우기`}
                              className={`group relative flex w-[68px] sm:w-[86px] cursor-pointer flex-col items-center rounded-xl border bg-white/95 px-1.5 py-1.5 shadow-lg transition hover:-translate-y-0.5 hover:border-[#10B981] ${
                                isSelectedSlot
                                  ? "border-[#10B981] ring-2 ring-[#10B981]/60"
                                  : playerIsGk
                                  ? "border-amber-300"
                                  : "border-white/90"
                              }`}
                            >
                              {/* Quick Clear Button */}
                              <button
                                type="button"
                                aria-label={`${slot.label} 슬롯 비우기`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearSingleSlot(slot.slotIndex);
                                }}
                                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm opacity-90 transition hover:bg-[#E11D48] sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>

                              {/* Slot Role Pill */}
                              <span
                                className={`mb-1 rounded px-1.5 py-0.5 font-mono text-[8.5px] font-black leading-none tracking-tight ${
                                  playerIsGk
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-[#0B4631] text-white"
                                }`}
                              >
                                {slot.label}
                              </span>

                              <PlayerAvatar
                                player={assigned.player}
                                size={32}
                              />

                              <span className="mt-1 w-full truncate text-center text-[10px] sm:text-[11px] font-extrabold text-gray-900">
                                {displayName.pitch}
                              </span>

                              <div className="flex items-center gap-0.5 font-mono text-[8.5px] font-bold text-gray-500 tabular-nums">
                                <span>{assigned.player.position}</span>
                                <span>·</span>
                                <span className="text-[#00985f]">
                                  {assigned.quantity}주
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Empty Interactive '+' Slot
                      return (
                        <button
                          key={slot.slotIndex}
                          type="button"
                          data-testid={`pitch-slot-${slot.slotIndex}`}
                          onClick={() => handleOpenSlotPicker(slot.slotIndex)}
                          style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                          className={`group absolute z-10 flex w-[64px] sm:w-[78px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed px-1.5 py-2 backdrop-blur-[2px] transition-[left,top,background-color,border-color,transform] duration-300 ease-out hover:scale-105 ${
                            isSelectedSlot
                              ? "border-[#10B981] bg-[#10B981]/30 ring-2 ring-[#10B981]/60"
                              : isGkSlot
                              ? "border-amber-300/80 bg-amber-400/15 hover:bg-amber-400/25"
                              : "border-white/50 bg-white/15 hover:border-white hover:bg-white/25"
                          }`}
                        >
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                              isGkSlot
                                ? "border-amber-200/80 bg-amber-400/25 text-amber-100"
                                : "border-white/40 bg-black/20 text-white group-hover:bg-[#10B981] group-hover:border-[#10B981]"
                            }`}
                          >
                            <Plus className="h-4 w-4" />
                          </span>
                          <span
                            className={`mt-1 font-mono text-[10px] font-black tracking-tight ${
                              isGkSlot ? "text-amber-200" : "text-white"
                            }`}
                          >
                            {slot.label}
                          </span>
                          {isGkSlot && (
                            <span className="text-[8px] font-bold text-amber-200/90">
                              필수
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <p className="px-1 text-[11px] font-medium text-gray-500">
                    피치의 <strong className="text-gray-700">+ 슬롯</strong>을 클릭하면 보유 선수 목록이 열립니다. 포메이션을 바꾸면 배치된 선수가 새 포지션으로 자동 이동합니다.
                  </p>
                </section>

                {/* RIGHT PANEL: SQUAD METADATA, CONDITIONS, PUBLISH & RESET */}
                <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:w-[340px] xl:w-[360px]">
                  <form
                    onSubmit={handlePublish}
                    className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4"
                  >
                    {/* Squad Live Telemetry Header */}
                    <div className="flex items-end justify-between border-b border-gray-100 pb-3">
                      <div>
                        <span className="text-[11px] font-bold text-gray-500">
                          배치 현황 ({draftFormation})
                        </span>
                        <div className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums">
                          <span className="text-2xl font-black tracking-tight text-gray-900">
                            {assignedPlayerIds.length}
                          </span>
                          <span className="text-sm font-bold text-gray-400">
                            / {REQUIRED_SQUAD_SIZE}명
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="block text-[10px] font-bold text-gray-400">
                          배치 종목 보유 평가
                        </span>
                        <span className="font-mono text-sm font-extrabold text-gray-900 tabular-nums">
                          {squadValuation.totalPoints.toLocaleString()}P
                        </span>
                        <span className="block font-mono text-[10px] font-semibold text-gray-400 tabular-nums">
                          총 {squadValuation.totalShares}주
                        </span>
                      </div>
                    </div>

                    {/* Line Breakdown Pills */}
                    <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-[11px] font-extrabold tabular-nums">
                      <div className="rounded-lg bg-gray-50 py-1.5 border border-gray-100">
                        <span className="block text-[9px] text-gray-400">FW</span>
                        <span className="text-gray-900">
                          {selectedLineCounts.FW}
                        </span>
                      </div>
                      <div className="rounded-lg bg-gray-50 py-1.5 border border-gray-100">
                        <span className="block text-[9px] text-gray-400">MF</span>
                        <span className="text-gray-900">
                          {selectedLineCounts.MF}
                        </span>
                      </div>
                      <div className="rounded-lg bg-gray-50 py-1.5 border border-gray-100">
                        <span className="block text-[9px] text-gray-400">DF</span>
                        <span className="text-gray-900">
                          {selectedLineCounts.DF}
                        </span>
                      </div>
                      <div
                        className={`rounded-lg py-1.5 border ${
                          selectedLineCounts.GK >= 1
                            ? "bg-emerald-50 border-emerald-200 text-[#00985f]"
                            : "bg-rose-50/70 border-rose-200 text-[#E11D48]"
                        }`}
                      >
                        <span className="block text-[9px]">GK</span>
                        <span>{selectedLineCounts.GK}</span>
                      </div>
                    </div>

                    {/* Squad Title Input (Right Panel) */}
                    <div>
                      <label
                        htmlFor="squad-title-input"
                        className="mb-1 block text-[11px] font-extrabold text-gray-700"
                      >
                        스쿼드 제목 *
                      </label>
                      <input
                        id="squad-title-input"
                        type="text"
                        value={draftTitle}
                        onChange={(e) => {
                          setDraftTitle(e.target.value);
                          setMakerFeedback(null);
                        }}
                        maxLength={MAX_SQUAD_TITLE_LENGTH}
                        placeholder="예: 이번 라운드 무실점 노리는 베스트 11"
                        className="w-full rounded-xl border border-gray-200 bg-[#F7F9F8] px-3 py-2.5 text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:border-[#00A878] focus:bg-white focus:outline-none"
                      />
                    </div>

                    {/* Tactical Strategy Comment (Right Panel) */}
                    <div>
                      <label
                        htmlFor="squad-comment-input"
                        className="mb-1 flex items-center justify-between text-[11px] font-extrabold text-gray-700"
                      >
                        <span>전략 코멘트 (선택)</span>
                        <span className="font-mono text-[10px] font-semibold text-gray-400 tabular-nums">
                          {draftDescription.length}/{MAX_SQUAD_DESCRIPTION_LENGTH}
                        </span>
                      </label>
                      <textarea
                        id="squad-comment-input"
                        rows={3}
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        maxLength={MAX_SQUAD_DESCRIPTION_LENGTH}
                        placeholder="전술 포인트, 핵심 매수 선수, 경기 예상 시나리오를 남겨보세요."
                        className="w-full resize-none rounded-xl border border-gray-200 bg-[#F7F9F8] px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#00A878] focus:bg-white focus:outline-none"
                      />
                    </div>

                    {/* Compact Publish Requirements Checklist */}
                    <div className="space-y-1.5 rounded-xl border border-gray-100 bg-[#F9FAFB] p-3 text-[11px] font-bold">
                      <div
                        className={`flex items-center gap-2 ${
                          assignedPlayerIds.length === REQUIRED_SQUAD_SIZE
                            ? "text-[#00985f]"
                            : "text-gray-600"
                        }`}
                      >
                        <CheckCircle2
                          className={`h-3.5 w-3.5 shrink-0 ${
                            assignedPlayerIds.length === REQUIRED_SQUAD_SIZE
                              ? "text-[#00A878]"
                              : "text-gray-300"
                          }`}
                        />
                        <span>
                          서로 다른 보유 선수 11명 배치 ({assignedPlayerIds.length}/11)
                        </span>
                      </div>
                      <div
                        className={`flex items-center gap-2 ${
                          selectedLineCounts.GK >= 1
                            ? "text-[#00985f]"
                            : "text-[#E11D48]"
                        }`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          골키퍼(GK) 최소 1명 포함 ({selectedLineCounts.GK}명)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>발행 후 수정 불가 (삭제만 가능)</span>
                      </div>
                    </div>

                    {/* Validation Error / Live Guidance */}
                    {makerFeedback?.type === "error" ? (
                      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-[#E11D48]">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{makerFeedback.text}</span>
                      </div>
                    ) : !draftValidation.valid ? (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[11px] font-semibold text-amber-900">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>{draftValidation.message}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-[#00985f]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>발행 조건 충족! 커뮤니티에 스쿼드를 등록할 수 있습니다.</span>
                      </div>
                    )}

                    {/* Primary Publish & Reset Action Buttons */}
                    <div className="space-y-2 pt-1">
                      <button
                        type="submit"
                        data-testid="publish-squad-btn"
                        className={`w-full rounded-xl py-3 text-xs font-extrabold transition active:scale-[0.99] ${
                          draftValidation.valid
                            ? "bg-[#00A878] text-white shadow-sm hover:opacity-95"
                            : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                        }`}
                      >
                        스쿼드 피드 발행하기
                      </button>

                      <button
                        type="button"
                        data-testid="reset-squad-btn"
                        onClick={handleResetMaker}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 active:scale-[0.99]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        스쿼드 초기화
                      </button>
                    </div>

                    <p className="text-[10.5px] leading-relaxed text-gray-400">
                      발행 이후 보유 선수를 매도하면 피드에{" "}
                      <strong className="text-amber-700">일부 매도</strong> /{" "}
                      <strong className="text-[#E11D48]">전량 매도</strong> 배지가 자동 반영됩니다.
                    </p>
                  </form>
                </aside>
              </div>

              {/* Owned Player Picker Modal (Triggered by Pitch Slot Click) */}
              <SquadPlayerPickerModal
                isOpen={activeSlot !== null}
                activeSlot={activeSlot}
                currentSlotPlayerId={currentSlotPlayerId}
                assignedSlotLabelByPlayerId={assignedSlotLabelByPlayerId}
                ownedPlayers={ownedPlayers}
                onSelectPlayer={handleAssignPlayerToActiveSlot}
                onClearSlot={() => {
                  if (activeSlotIndex !== null) {
                    handleClearSingleSlot(activeSlotIndex);
                  }
                }}
                onClose={() => setActiveSlotIndex(null)}
                onGoToMarket={() => {
                  setActiveSlotIndex(null);
                  setActiveTab("MARKET");
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
