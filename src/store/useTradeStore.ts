import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Match,
  Player,
  Holding,
  PointTransaction,
  DateKey,
  BottomTab,
  UserSession,
  UserRole,
} from "@/types";
import {
  INITIAL_CASH,
  INITIAL_MATCHES,
  INITIAL_PLAYERS,
  POSITION_EVENTS,
} from "@/data/dummyData";

export interface AuthActionResult {
  success: boolean;
  message: string;
  role?: UserRole;
}

export interface ForceGoalResult {
  player: Player;
  prevPrice: number;
  nextPrice: number;
  ratePct: number;
  capped: boolean;
}

interface TradeExecutionResult {
  success: boolean;
  message: string;
  executedPrice?: number;
}

interface TradeStoreState {
  user: UserSession | null;
  cash: number;
  realizedPnL: number;
  matches: Match[];
  players: Player[];
  holdings: Record<string, Holding>;
  transactions: PointTransaction[];
  selectedDate: DateKey;
  activeTab: BottomTab;
  expandedMatchIds: string[];

  // Auth Actions (DB simulation with id & password)
  login: (id: string, password: string) => AuthActionResult;
  signup: (id: string, password: string, name?: string) => AuthActionResult;
  logout: () => void;

  // Market & Trade Actions
  setSelectedDate: (date: DateKey) => void;
  setActiveTab: (tab: BottomTab) => void;
  toggleExpandMatch: (matchId: string) => void;
  ensurePlayerInStore: (player: Player) => void;
  tickMarket: () => void;
  buyPlayer: (playerId: string, quantity: number) => TradeExecutionResult;
  sellPlayer: (playerId: string, quantity: number) => TradeExecutionResult;
  addAdminCash: (amount?: number) => { added: number; nextCash: number };
  triggerForceGoalEvent: (targetPlayerId?: string) => ForceGoalResult | null;
  resetAll: () => void;
}

// Round any price or point value to the nearest 10 integer unit
export const roundToTen = (val: number): number => Math.round(val / 10) * 10;

// Clamp price strictly within [basePrice * 0.7, basePrice * 1.3] and round to 10
export const clampToPriceLimit = (price: number, basePrice: number): number => {
  const floorPrice = roundToTen(basePrice * 0.7);
  const capPrice = roundToTen(basePrice * 1.3);
  const rounded = roundToTen(price);
  return Math.max(floorPrice, Math.min(capPrice, rounded));
};

// Normalize initial players so basePrice is permanently preserved and prices are 10-unit integers
const NORMALIZED_INITIAL_PLAYERS: Player[] = INITIAL_PLAYERS.map((p) => {
  const basePrice = roundToTen(p.basePrice ?? p.initialPrice);
  const currentPrice = clampToPriceLimit(p.currentPrice, basePrice);
  const previousPrice = clampToPriceLimit(p.previousPrice, basePrice);

  return {
    ...p,
    basePrice,
    initialPrice: basePrice,
    currentPrice,
    previousPrice,
    priceHistory: p.priceHistory.map((pt) => ({
      ...pt,
      price: clampToPriceLimit(pt.price, basePrice),
    })),
  };
});

export const useTradeStore = create<TradeStoreState>()(
  persist(
    (set, get) => ({
      user: null,
      cash: INITIAL_CASH,
      realizedPnL: 0,
      matches: INITIAL_MATCHES,
      players: NORMALIZED_INITIAL_PLAYERS,
      holdings: {},
      transactions: [],
      selectedDate: "TODAY",
      activeTab: "MATCHES",
      expandedMatchIds: ["m-tot-ars", "m-mci-liv"],

      login: (id, password) => {
        const trimmedId = id.trim();
        if (!trimmedId || !password) {
          return {
            success: false,
            message: "아이디와 비밀번호를 모두 입력해주세요.",
          };
        }

        const state = get();
        const hasActivePortfolio =
          Object.values(state.holdings).some((h) => h.quantity > 0) ||
          state.transactions.length > 0;
        const resolvedCash = hasActivePortfolio
          ? roundToTen(state.cash)
          : INITIAL_CASH;

        // Hardcoded Admin account check: ID === 'Admin' && PW === 'Admin1234'
        if (trimmedId === "Admin") {
          if (password === "Admin1234") {
            set({
              cash: resolvedCash,
              user: {
                id: "Admin",
                name: "관리자",
                role: "admin",
                cash: resolvedCash,
              },
            });
            return {
              success: true,
              message: "관리자(Admin) 계정으로 로그인되었습니다.",
              role: "admin",
            };
          }
          return {
            success: false,
            message: "관리자 계정 비밀번호가 일치하지 않습니다.",
          };
        }

        // General user login
        set({
          cash: resolvedCash,
          user: {
            id: trimmedId,
            name: trimmedId,
            role: "user",
            cash: resolvedCash,
          },
        });
        return {
          success: true,
          message: `${trimmedId}님 환영합니다!`,
          role: "user",
        };
      },

      signup: (id, password, name) => {
        const trimmedId = id.trim();
        if (!trimmedId || !password) {
          return {
            success: false,
            message: "아이디와 비밀번호를 모두 입력해주세요.",
          };
        }

        if (trimmedId === "Admin" && password !== "Admin1234") {
          return {
            success: false,
            message: "'Admin'은 예약된 관리자 아이디입니다.",
          };
        }

        const isAdmin = trimmedId === "Admin" && password === "Admin1234";
        const displayName = isAdmin
          ? "관리자"
          : name?.trim() || trimmedId;

        set({
          cash: INITIAL_CASH,
          holdings: {},
          transactions: [],
          realizedPnL: 0,
          user: {
            id: isAdmin ? "Admin" : trimmedId,
            name: displayName,
            role: isAdmin ? "admin" : "user",
            cash: INITIAL_CASH,
          },
        });

        return {
          success: true,
          message: `${displayName}님 회원가입 완료! 초기 자금 ${INITIAL_CASH.toLocaleString()} P가 지급되었습니다.`,
          role: isAdmin ? "admin" : "user",
        };
      },

      logout: () => {
        set({ user: null });
      },

      setSelectedDate: (date) => set({ selectedDate: date }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      toggleExpandMatch: (matchId) => {
        const { expandedMatchIds } = get();
        if (expandedMatchIds.includes(matchId)) {
          set({
            expandedMatchIds: expandedMatchIds.filter((id) => id !== matchId),
          });
        } else {
          set({ expandedMatchIds: [...expandedMatchIds, matchId] });
        }
      },

      ensurePlayerInStore: (newPlayer) => {
        const { players } = get();
        const base = roundToTen(
          newPlayer.basePrice ?? newPlayer.initialPrice ?? 10000
        );
        const normalized: Player = {
          ...newPlayer,
          basePrice: base,
          initialPrice: base,
          currentPrice: clampToPriceLimit(newPlayer.currentPrice, base),
          previousPrice: clampToPriceLimit(newPlayer.previousPrice, base),
        };
        const existingIdx = players.findIndex((p) => p.id === newPlayer.id);
        if (existingIdx !== -1) {
          return;
        }
        set({ players: [...players, normalized] });
      },

      tickMarket: () => {
        const { matches, players } = get();

        const updatedMatches = matches.map((m) => {
          const isMatchLive =
            m.status === "LIVE" || m.rawStatus === "IN_PLAY";
          if (!isMatchLive) return m;
          const nextMin = (m.minute ?? 45) >= 89 ? 46 : (m.minute ?? 45) + 1;
          return { ...m, minute: nextMin };
        });

        const liveMatchMap = new Map(
          updatedMatches.map((m) => [m.id, m] as const)
        );

        const updatedPlayers = players.map((player) => {
          // Permanent basePrice reference
          const basePrice = roundToTen(
            player.basePrice ?? player.initialPrice ?? 10000
          );
          const safeCurrentPrice = clampToPriceLimit(
            player.currentPrice,
            basePrice
          );

          const match = liveMatchMap.get(player.matchId);
          const isLive =
            match?.status === "LIVE" || match?.rawStatus === "IN_PLAY";

          // Guard: Only fluctuate prices for LIVE matches (FT and UPCOMING stay fixed)
          if (!isLive) {
            return {
              ...player,
              basePrice,
              initialPrice: basePrice,
              currentPrice: safeCurrentPrice,
            };
          }

          // Event-driven price calculation:
          // 1. Draw match event from position pool
          const pool = POSITION_EVENTS[player.position];
          const chosen = pool[Math.floor(Math.random() * pool.length)];

          const isSpecialGoalOrAssist =
            (chosen.statEffect === "goal" || chosen.statEffect === "assist") &&
            Math.random() < 0.25;

          // 2. Calculate change rate:
          // - Special goal/assist event uses event's minRate ~ maxRate weight
          // - Normal tick uses zero-mean fluctuation (Math.random() * 0.05 - 0.025) to prevent inflation drift
          const changeRate = isSpecialGoalOrAssist
            ? chosen.minRate +
              Math.random() * (chosen.maxRate - chosen.minRate)
            : Math.random() * 0.05 - 0.025;

          // 3. Apply rate and clamp to ±30% price limit
          let nextPrice = Math.round(safeCurrentPrice * (1 + changeRate));
          nextPrice = clampToPriceLimit(nextPrice, basePrice);

          if (nextPrice === safeCurrentPrice) {
            return {
              ...player,
              basePrice,
              initialPrice: basePrice,
              currentPrice: safeCurrentPrice,
            };
          }

          const currentMinute = match?.minute ?? player.lastEvent.minute;
          const timeLabel = `${currentMinute}'`;

          const nextStats = { ...player.stats };
          if (isSpecialGoalOrAssist && chosen.statEffect === "goal") {
            nextStats.goals += 1;
          } else if (
            isSpecialGoalOrAssist &&
            chosen.statEffect === "assist"
          ) {
            nextStats.assists += 1;
          } else if (chosen.statEffect === "shot" && nextPrice > safeCurrentPrice) {
            nextStats.shotsOnTarget += 1;
          } else if (
            chosen.statEffect === "keyPass" &&
            nextPrice > safeCurrentPrice
          ) {
            nextStats.keyPasses += 1;
          }

          const ratingDelta =
            nextPrice > safeCurrentPrice
              ? 0.1
              : nextPrice < safeCurrentPrice
              ? -0.1
              : 0;
          nextStats.rating = Number(
            Math.min(
              9.9,
              Math.max(5.5, nextStats.rating + ratingDelta)
            ).toFixed(1)
          );

          const displayEventText = isSpecialGoalOrAssist
            ? chosen.text
            : chosen.statEffect === "goal" || chosen.statEffect === "assist"
            ? nextPrice >= safeCurrentPrice
              ? "⚡ 날카로운 전진 움직임 및 연계 플레이"
              : "🔄 수비 대형 유지 및 볼 순환"
            : chosen.text;

          return {
            ...player,
            basePrice,
            initialPrice: basePrice,
            previousPrice: safeCurrentPrice,
            currentPrice: nextPrice,
            priceHistory: [
              ...player.priceHistory.slice(-9),
              { timeLabel, price: nextPrice },
            ],
            lastEvent: {
              text: displayEventText,
              sentiment: (
                nextPrice > safeCurrentPrice
                  ? "positive"
                  : nextPrice < safeCurrentPrice
                  ? "negative"
                  : "neutral"
              ) as Player["lastEvent"]["sentiment"],
              minute: currentMinute,
            },
            stats: nextStats,
          };
        });

        set({
          matches: updatedMatches,
          players: updatedPlayers,
        });
      },

      buyPlayer: (playerId, quantity) => {
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return {
            success: false,
            message: "수량은 1주 이상의 정수로 입력해주세요.",
          };
        }

        const { user, cash, players, holdings, transactions } = get();
        if (!user) {
          return {
            success: false,
            message: "로그인이 필요한 서비스입니다.",
          };
        }
        const player = players.find((p) => p.id === playerId);
        if (!player) {
          return { success: false, message: "선수 정보를 찾을 수 없습니다." };
        }

        const executedPrice = roundToTen(player.currentPrice);
        const totalCost = roundToTen(executedPrice * quantity);
        if (totalCost > cash) {
          return {
            success: false,
            message: `보유 포인트가 부족합니다. (필요: ${totalCost.toLocaleString()} P)`,
          };
        }

        const prev = holdings[playerId];
        const prevQty = prev ? prev.quantity : 0;
        const prevInvested = prev ? prev.quantity * prev.avgBuyPrice : 0;
        const newQty = prevQty + quantity;
        const newAvg = roundToTen((prevInvested + totalCost) / newQty);
        const nextCash = roundToTen(cash - totalCost);

        const newTx: PointTransaction = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "BUY",
          playerId: player.id,
          playerName: player.name,
          teamShort: player.teamShort,
          quantity,
          unitPrice: executedPrice,
          totalAmount: totalCost,
          balanceAfter: nextCash,
          timestamp: new Date().toLocaleTimeString("ko-KR", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        };

        set({
          cash: nextCash,
          user: user ? { ...user, cash: nextCash } : null,
          holdings: {
            ...holdings,
            [playerId]: {
              playerId,
              quantity: newQty,
              avgBuyPrice: newAvg,
            },
          },
          transactions: [newTx, ...transactions].slice(0, 40),
        });

        return {
          success: true,
          executedPrice,
          message: `${player.name} ${quantity}주 매수 완료 (-${totalCost.toLocaleString()} P)`,
        };
      },

      sellPlayer: (playerId, quantity) => {
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return {
            success: false,
            message: "수량은 1주 이상의 정수로 입력해주세요.",
          };
        }

        const { user, cash, realizedPnL, players, holdings, transactions } =
          get();
        if (!user) {
          return {
            success: false,
            message: "로그인이 필요한 서비스입니다.",
          };
        }
        const player = players.find((p) => p.id === playerId);
        if (!player) {
          return { success: false, message: "선수 정보를 찾을 수 없습니다." };
        }

        const prev = holdings[playerId];
        if (!prev || prev.quantity < quantity) {
          return {
            success: false,
            message: `보유 수량이 부족합니다. (현재 보유: ${prev?.quantity ?? 0}주)`,
          };
        }

        const executedPrice = roundToTen(player.currentPrice);
        const totalProceeds = roundToTen(executedPrice * quantity);
        const txRealizedPnL = roundToTen(
          (executedPrice - prev.avgBuyPrice) * quantity
        );
        const nextRealizedPnL = roundToTen(realizedPnL + txRealizedPnL);
        const remainingQty = prev.quantity - quantity;
        const nextHoldings = { ...holdings };

        if (remainingQty === 0) {
          delete nextHoldings[playerId];
        } else {
          nextHoldings[playerId] = {
            ...prev,
            quantity: remainingQty,
          };
        }

        const nextCash = roundToTen(cash + totalProceeds);

        const newTx: PointTransaction = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "SELL",
          playerId: player.id,
          playerName: player.name,
          teamShort: player.teamShort,
          quantity,
          unitPrice: executedPrice,
          totalAmount: totalProceeds,
          balanceAfter: nextCash,
          realizedPnL: txRealizedPnL,
          timestamp: new Date().toLocaleTimeString("ko-KR", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        };

        set({
          cash: nextCash,
          realizedPnL: nextRealizedPnL,
          user: user ? { ...user, cash: nextCash } : null,
          holdings: nextHoldings,
          transactions: [newTx, ...transactions].slice(0, 40),
        });

        return {
          success: true,
          executedPrice,
          message: `${player.name} ${quantity}주 매도 완료 (+${totalProceeds.toLocaleString()} P)`,
        };
      },

      addAdminCash: (amount = 1000000) => {
        const { user, cash } = get();
        const added = roundToTen(amount);
        const nextCash = roundToTen(cash + added);
        set({
          cash: nextCash,
          user: user ? { ...user, cash: nextCash } : null,
        });
        return { added, nextCash };
      },

      triggerForceGoalEvent: (targetPlayerId) => {
        const { players, holdings, matches } = get();
        if (players.length === 0) return null;

        let target: Player | undefined;
        if (targetPlayerId) {
          target = players.find((p) => p.id === targetPlayerId);
        }

        if (!target) {
          // Prioritize held players so user immediately sees portfolio PnL surge, otherwise pick from players not yet at +30% cap
          const heldIds = Object.keys(holdings).filter(
            (id) => (holdings[id]?.quantity ?? 0) > 0
          );
          const heldCandidates = players.filter((p) => heldIds.includes(p.id));
          const pool = heldCandidates.length > 0 ? heldCandidates : players;
          const nonCapped = pool.filter((p) => {
            const base = roundToTen(p.basePrice ?? p.initialPrice ?? 10000);
            return p.currentPrice < roundToTen(base * 1.3);
          });
          const pickFrom = nonCapped.length > 0 ? nonCapped : pool;
          target = pickFrom[Math.floor(Math.random() * pickFrom.length)];
        }

        if (!target) return null;

        const basePrice = roundToTen(
          target.basePrice ?? target.initialPrice ?? 10000
        );
        const capPrice = roundToTen(basePrice * 1.3);
        const prevPrice = clampToPriceLimit(target.currentPrice, basePrice);

        // Spike by +11% ~ +14% (clamped to +30% upper limit)
        const spikeMultiplier = 1.11 + Math.random() * 0.03;
        let nextPrice = clampToPriceLimit(
          Math.round(prevPrice * spikeMultiplier),
          basePrice
        );
        if (nextPrice <= prevPrice && prevPrice < capPrice) {
          nextPrice = clampToPriceLimit(prevPrice + 300, basePrice);
        }
        const capped = nextPrice >= capPrice && prevPrice >= capPrice;

        const match = matches.find((m) => m.id === target!.matchId);
        const currentMinute = match?.minute ?? 77;
        const timeLabel = `${currentMinute}'`;

        const updatedPlayer: Player = {
          ...target,
          basePrice,
          initialPrice: basePrice,
          previousPrice: prevPrice,
          currentPrice: nextPrice,
          priceHistory: [
            ...target.priceHistory.slice(-9),
            { timeLabel, price: nextPrice },
          ],
          lastEvent: {
            text: "⚽ [GOAL] 환상적인 원더골 작렬!! (시세 급등)",
            sentiment: "positive",
            minute: currentMinute,
          },
          stats: {
            ...target.stats,
            goals: (target.stats?.goals ?? 0) + 1,
            shotsOnTarget: (target.stats?.shotsOnTarget ?? 0) + 1,
            rating: Number(
              Math.min(9.9, (target.stats?.rating ?? 7.5) + 0.4).toFixed(1)
            ),
          },
        };

        const nextPlayers = players.map((p) =>
          p.id === updatedPlayer.id ? updatedPlayer : p
        );

        // Also update the match score & highlight text so match cards stay in sync
        const nextMatches = matches.map((m) => {
          if (m.id !== updatedPlayer.matchId) return m;
          const isHome =
            m.homeTeam.id === updatedPlayer.teamId ||
            m.homeTeam.shortName === updatedPlayer.teamShort;
          const isAway =
            m.awayTeam.id === updatedPlayer.teamId ||
            m.awayTeam.shortName === updatedPlayer.teamShort;

          return {
            ...m,
            homeTeam: isHome
              ? { ...m.homeTeam, score: (m.homeTeam.score ?? 0) + 1 }
              : m.homeTeam,
            awayTeam: isAway
              ? { ...m.awayTeam, score: (m.awayTeam.score ?? 0) + 1 }
              : m.awayTeam,
            highlightText: `⚽ ${updatedPlayer.name} 추가골 작렬! (통산 ${updatedPlayer.stats.goals}골) · 실시간 시세 급등`,
          };
        });

        set({ players: nextPlayers, matches: nextMatches });

        const ratePct =
          prevPrice > 0 ? ((nextPrice - prevPrice) / prevPrice) * 100 : 0;

        return {
          player: updatedPlayer,
          prevPrice,
          nextPrice,
          ratePct,
          capped,
        };
      },

      resetAll: () => {
        const { user } = get();
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("pitch-trade-storage-v1");
          window.localStorage.removeItem("fotmob-pitchtrade-storage-v2");
        }
        set({
          cash: INITIAL_CASH,
          realizedPnL: 0,
          user: user ? { ...user, cash: INITIAL_CASH } : null,
          matches: INITIAL_MATCHES,
          players: NORMALIZED_INITIAL_PLAYERS,
          holdings: {},
          transactions: [],
          selectedDate: "TODAY",
          expandedMatchIds: ["m-tot-ars", "m-mci-liv"],
        });
      },
    }),
    {
      name: "fotmob-pitchtrade-storage-v3",
      storage: createJSONStorage(() => localStorage),
      // Persist only user session & asset data (never master matches/players)
      partialize: (state) => ({
        cash: state.cash,
        holdings: state.holdings,
        transactions: state.transactions,
        realizedPnL: state.realizedPnL,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.cash = roundToTen(state.cash ?? INITIAL_CASH);
        state.realizedPnL = roundToTen(state.realizedPnL ?? 0);
        if (state.user) {
          state.user = {
            ...state.user,
            cash: state.cash,
          };
        }
      },
    }
  )
);
