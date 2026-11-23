"use client";

import React, { useMemo, useState } from "react";
import {
  Users,
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
import { buildFormationRows } from "@/lib/lineupBuilder";
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
  resolveSquadAuthorHoldings,
  resolveSquadFeedSaleSummary,
  validateSquadDraft,
  type SquadFormationOption,
} from "@/lib/squadFeed";
import PlayerAvatar from "@/components/PlayerAvatar";

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
type LineFilter = "ALL" | PositionLine;

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

  const [subView, setSubView] = useState<SquadSubView>("FEED");
  const [feedFilter, setFeedFilter] = useState<FeedFilterMode>("ALL");

  // Squad Maker draft state
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftDescription, setDraftDescription] = useState<string>("");
  const [draftFormation, setDraftFormation] =
    useState<SquadFormationOption>("4-3-3");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lineFilter, setLineFilter] = useState<LineFilter>("ALL");
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
  const ownedPlayers = useMemo(() => {
    if (!user) return [];
    const list: Array<{ player: Player; quantity: number; avgBuyPrice: number }> =
      [];
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

  // Keep selectedIds synced with still-owned players so selling an item removes it from draft
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => (holdings[id]?.quantity ?? 0) > 0),
    [selectedIds, holdings]
  );

  const selectedPlayers = useMemo(() => {
    const ownedMap = new Map(ownedPlayers.map((item) => [item.player.id, item]));
    return activeSelectedIds
      .map((id) => ownedMap.get(id))
      .filter(
        (x): x is { player: Player; quantity: number; avgBuyPrice: number } =>
          Boolean(x)
      );
  }, [activeSelectedIds, ownedPlayers]);

  const selectedLineCounts = useMemo(() => {
    const counts: Record<PositionLine, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
    for (const item of selectedPlayers) {
      counts[getPositionLine(item.player.position)] += 1;
    }
    return counts;
  }, [selectedPlayers]);

  const draftValidation = useMemo(
    () =>
      validateSquadDraft({
        title: draftTitle,
        description: draftDescription,
        formation: draftFormation,
        selectedPlayerIds: activeSelectedIds,
        holdings,
        players,
        transactions,
        playerPrices,
      }),
    [
      draftTitle,
      draftDescription,
      draftFormation,
      activeSelectedIds,
      holdings,
      players,
      transactions,
      playerPrices,
    ]
  );

  const filteredOwnedPlayers = useMemo(() => {
    if (lineFilter === "ALL") return ownedPlayers;
    return ownedPlayers.filter(
      (item) => getPositionLine(item.player.position) === lineFilter
    );
  }, [ownedPlayers, lineFilter]);

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

  const handleToggleSelectPlayer = (playerId: string) => {
    setMakerFeedback(null);
    if (activeSelectedIds.includes(playerId)) {
      setSelectedIds(activeSelectedIds.filter((id) => id !== playerId));
      return;
    }
    if (activeSelectedIds.length >= REQUIRED_SQUAD_SIZE) {
      setMakerFeedback({
        type: "error",
        text: "스쿼드는 정확히 11명까지만 선택할 수 있습니다. 기존 선수를 해제한 뒤 추가해주세요.",
      });
      return;
    }
    setSelectedIds([...activeSelectedIds, playerId]);
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
      playerIds: activeSelectedIds,
    });

    if (!res.success) {
      setMakerFeedback({ type: "error", text: res.message });
      return;
    }

    setDraftTitle("");
    setDraftDescription("");
    setSelectedIds([]);
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

    const pitchPlayers = feed.players.map((snap) =>
      snapshotToDisplayPlayer(snap, players)
    );
    const pitchRows = buildFormationRows(pitchPlayers, feed.formation);
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
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-gray-700">
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

        {/* 11-Player Pitch Snapshot */}
        <div className="px-3.5 pt-3.5 pb-2">
          <div className="relative w-full overflow-hidden rounded-2xl border border-[#00A878]/25 bg-[#E8F5EF]">
            <div className="pointer-events-none absolute inset-2 rounded-xl border-[1.5px] border-white">
              <div className="mx-auto h-10 w-32 border-x-[1.5px] border-b-[1.5px] border-white" />
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-[1.5px] border-white" />
              <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white" />
              <div className="absolute bottom-0 left-1/2 h-10 w-32 -translate-x-1/2 border-x-[1.5px] border-t-[1.5px] border-white" />
            </div>

            <div className="relative z-10 flex min-h-[300px] sm:min-h-[340px] flex-col justify-between py-3 px-1.5 gap-2">
              {pitchRows.map((row, rowIdx) => (
                <div
                  key={`${feed.id}-row-${rowIdx}`}
                  className="flex items-center justify-around gap-1"
                >
                  {row.map((player) => {
                    const sale = saleSummary.byPlayerId[player.id];
                    const displayName = resolvePlayerDisplayName(player);
                    const isFullySold = sale?.status === "FULLY_SOLD";
                    const isPartialSold = sale?.status === "PARTIAL_SOLD";

                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => onSelectPlayerTrade(player, "BUY")}
                        title={`${displayName.full} · 발행 ${sale?.publishedQuantity ?? 1}주 / 현재 ${sale?.currentQuantity ?? 0}주`}
                        className={`relative flex min-w-0 flex-1 max-w-[78px] sm:max-w-[92px] flex-col items-center rounded-xl border bg-white px-1 py-1.5 shadow-xs transition hover:-translate-y-0.5 hover:border-[#00A878] active:scale-95 ${
                          isFullySold
                            ? "border-rose-300 opacity-85"
                            : isPartialSold
                            ? "border-amber-300"
                            : "border-gray-200/90"
                        }`}
                      >
                        {(isFullySold || isPartialSold) && (
                          <span
                            data-testid={`player-sale-badge-${feed.id}-${player.id}`}
                            className={`mb-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-black leading-tight whitespace-nowrap ${
                              isFullySold
                                ? "bg-rose-100 text-[#E11D48]"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {sale.label}
                          </span>
                        )}

                        <PlayerAvatar
                          player={player}
                          teamColorOverride={player.teamColor}
                          size={30}
                        />

                        <div className="mt-1 flex w-full items-center justify-center gap-0.5 px-0.5">
                          <span className="truncate text-[10px] font-extrabold text-gray-900">
                            {displayName.pitch}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 font-mono text-[8.5px] font-bold text-gray-500 tabular-nums">
                          <span>{player.position}</span>
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
                            {sale?.currentQuantity ?? 0}/{sale?.publishedQuantity ?? 1}주
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Toggle Detailed 11-Player Roster & Sell Status Breakdown */}
          <button
            type="button"
            onClick={() => handleToggleRoster(feed.id)}
            className="mt-2 flex w-full items-center justify-between rounded-xl border border-gray-200/80 bg-[#F7F9F8] px-3 py-2 text-[11px] font-bold text-gray-700 transition hover:bg-gray-100"
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
    <div className="mx-auto w-full max-w-4xl px-4 py-4 space-y-4">
      {/* Header Banner + Sub-view Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-gray-200/90 bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#00A878]" />
            <h1 className="text-base font-black tracking-tight text-gray-900">
              스쿼드 메이커 & 커뮤니티 피드
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            실제 보유 선수 11명(GK 포함)으로 스쿼드를 발행하고 매도 변동과 코멘트를 공유하세요.
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1 text-xs font-extrabold shrink-0">
          <button
            type="button"
            onClick={() => setSubView("FEED")}
            className={`rounded-lg px-3 py-2 transition whitespace-nowrap ${
              subView === "FEED"
                ? "bg-white text-gray-900 shadow-xs"
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
                ? "bg-[#00A878] text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            11명 스쿼드 만들기
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
          {/* Feed Filter Pills */}
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
              onClick={() => setSubView("MAKER")}
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
                실제 보유 중인 선수 11명(골키퍼 1명 이상 필수)을 모아 첫 스쿼드 피드를 발행해보세요.
              </p>
              <button
                type="button"
                onClick={() => setSubView("MAKER")}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#00A878] px-4 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:opacity-95"
              >
                <PlusCircle className="h-4 w-4" />
                11명 스쿼드 만들기
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleFeeds.map((feed) => renderFeedCard(feed))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: 11-PLAYER SQUAD MAKER */}
      {subView === "MAKER" && (
        <div className="space-y-4">
          {!user ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                <LogIn className="h-6 w-6" />
              </div>
              <p className="text-sm font-extrabold text-gray-900">
                로그인 후 보유 선수로 스쿼드를 구성할 수 있습니다.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                현재 보유 중인 종목 11명(GK 포함)만 선택해 커뮤니티 피드에 발행할 수 있습니다.
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
            <form onSubmit={handlePublish} className="space-y-4">
              {/* Live Requirements Checklist */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${
                    activeSelectedIds.length === REQUIRED_SQUAD_SIZE
                      ? "border-emerald-200 bg-emerald-50 text-[#00985f]"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${
                      activeSelectedIds.length === REQUIRED_SQUAD_SIZE
                        ? "text-[#00A878]"
                        : "text-gray-300"
                    }`}
                  />
                  <span className="font-mono tabular-nums">
                    보유 선수 {activeSelectedIds.length} / {REQUIRED_SQUAD_SIZE}명
                  </span>
                </div>

                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${
                    selectedLineCounts.GK >= 1
                      ? "border-emerald-200 bg-emerald-50 text-[#00985f]"
                      : "border-rose-200 bg-rose-50/60 text-[#E11D48]"
                  }`}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    골키퍼(GK) {selectedLineCounts.GK}명 (최소 1명 필수)
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-600">
                  <Lock className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>중복 불가 · 발행 후 삭제만 가능</span>
                </div>
              </div>

              {/* Metadata Inputs */}
              <div className="rounded-2xl border border-gray-200/90 bg-white p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label className="mb-1 block text-[11px] font-extrabold text-gray-700">
                      스쿼드 제목 *
                    </label>
                    <input
                      type="text"
                      value={draftTitle}
                      onChange={(e) => {
                        setDraftTitle(e.target.value);
                        setMakerFeedback(null);
                      }}
                      maxLength={MAX_SQUAD_TITLE_LENGTH}
                      placeholder="예: 이번 라운드 무실점 노리는 필승 11인"
                      className="w-full rounded-xl border border-gray-200 bg-[#F7F9F8] px-3 py-2 text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:border-[#00A878] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-extrabold text-gray-700">
                      포메이션
                    </label>
                    <select
                      value={draftFormation}
                      onChange={(e) =>
                        setDraftFormation(e.target.value as SquadFormationOption)
                      }
                      className="w-full rounded-xl border border-gray-200 bg-[#F7F9F8] px-3 py-2 font-mono text-xs font-extrabold text-gray-900 focus:border-[#00A878] focus:bg-white focus:outline-none"
                    >
                      {SQUAD_FORMATIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-extrabold text-gray-700">
                    전략 코멘트 (선택)
                  </label>
                  <textarea
                    rows={2}
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    maxLength={MAX_SQUAD_DESCRIPTION_LENGTH}
                    placeholder="선발 구성 포인트나 매수 이유를 간단히 공유해보세요."
                    className="w-full resize-none rounded-xl border border-gray-200 bg-[#F7F9F8] px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#00A878] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Selected Squad Chips Preview */}
              <div className="rounded-2xl border border-gray-200/90 bg-white p-4">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-gray-900">
                    선택된 스쿼드 ({selectedPlayers.length}/{REQUIRED_SQUAD_SIZE}명)
                  </span>
                  <span className="font-mono text-[11px] font-bold text-gray-500">
                    GK {selectedLineCounts.GK} · DF {selectedLineCounts.DF} · MF{" "}
                    {selectedLineCounts.MF} · FW {selectedLineCounts.FW}
                  </span>
                </div>

                {selectedPlayers.length === 0 ? (
                  <p className="rounded-xl bg-[#F7F9F8] px-3 py-4 text-center text-xs text-gray-400">
                    아래 보유 선수 목록에서 서로 다른 11명(GK 포함)을 선택해주세요.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPlayers.map(({ player, quantity }) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => handleToggleSelectPlayer(player.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/70 pl-1.5 pr-2.5 py-1 text-xs font-bold text-gray-900 transition hover:bg-rose-50 hover:border-rose-200"
                      >
                        <PlayerAvatar player={player} size={22} />
                        <span className="rounded bg-white px-1 py-0.5 font-mono text-[9px] font-extrabold text-gray-700">
                          {player.position}
                        </span>
                        <span>{formatPlayerDisplayName(player, "full")}</span>
                        <span className="font-mono text-[10px] text-[#00985f]">
                          {quantity}주
                        </span>
                        <span className="text-gray-400">×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Owned Players Picker (ONLY quantity > 0) */}
              <div className="rounded-2xl border border-gray-200/90 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-extrabold text-gray-900">
                      내 보유 선수에서 선택 ({ownedPlayers.length}명 보유 중)
                    </h2>
                    <p className="text-[11px] text-gray-500">
                      실제 보유 수량이 1주 이상인 종목만 표시됩니다.
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {(["ALL", "GK", "DF", "MF", "FW"] as LineFilter[]).map(
                      (lf) => (
                        <button
                          key={lf}
                          type="button"
                          onClick={() => setLineFilter(lf)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                            lineFilter === lf
                              ? "bg-gray-900 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {lf === "ALL" ? "전체" : lf}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {ownedPlayers.length < REQUIRED_SQUAD_SIZE && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
                    <span>
                      현재 서로 다른 보유 선수가 {ownedPlayers.length}명입니다. 11명 스쿼드 발행을 위해{" "}
                      {REQUIRED_SQUAD_SIZE - ownedPlayers.length}명을 더 매수해주세요.
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("MARKET")}
                      className="shrink-0 rounded-lg bg-amber-900 px-2.5 py-1 text-[10px] font-bold text-white"
                    >
                      시세/차트에서 매수
                    </button>
                  </div>
                )}

                {filteredOwnedPlayers.length === 0 ? (
                  <p className="rounded-xl bg-[#F7F9F8] px-3 py-6 text-center text-xs text-gray-400">
                    해당 포지션에 보유 중인 선수가 없습니다.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filteredOwnedPlayers.map(({ player, quantity }) => {
                      const isSelected = activeSelectedIds.includes(player.id);
                      const isGk = getPositionLine(player.position) === "GK";

                      return (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => handleToggleSelectPlayer(player.id)}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                            isSelected
                              ? "border-[#00A878] bg-emerald-50/70 ring-1 ring-[#00A878]/30"
                              : "border-gray-200/80 bg-white hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <PlayerAvatar player={player} size={34} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-extrabold text-gray-900">
                                  {formatPlayerDisplayName(player, "full")}
                                </span>
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold ${
                                    isGk
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {player.position}
                                </span>
                              </div>
                              <p className="truncate text-[10px] font-medium text-gray-400">
                                {player.teamName} · 보유 {quantity}주
                              </p>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${
                              isSelected
                                ? "bg-[#00A878] text-white"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isSelected ? "선택됨" : "선택"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Validation Error / Publish CTA */}
              {makerFeedback?.type === "error" && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-[#E11D48]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{makerFeedback.text}</span>
                </div>
              )}

              {!draftValidation.valid && !makerFeedback && (
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-600">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>{draftValidation.message}</span>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-gray-200/90 bg-white px-4 py-3.5">
                <p className="text-[11px] font-medium text-gray-500">
                  발행된 스쿼드는 수정할 수 없으며(삭제만 가능), 이후 선수를 매도하면 피드에{" "}
                  <strong className="text-amber-700">일부 매도</strong> /{" "}
                  <strong className="text-[#E11D48]">전량 매도</strong> 배지가 자동 표시됩니다.
                </p>
                <button
                  type="submit"
                  className={`shrink-0 rounded-xl px-5 py-2.5 text-xs font-extrabold transition active:scale-95 ${
                    draftValidation.valid
                      ? "bg-[#00A878] text-white shadow-xs hover:opacity-95"
                      : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                  }`}
                >
                  스쿼드 피드 발행하기
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
