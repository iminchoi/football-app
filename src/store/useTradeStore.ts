import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ActiveMatchContext,
  Match,
  Player,
  TeamInfo,
  Holding,
  PointTransaction,
  DateKey,
  BottomTab,
  UserSession,
  UserRole,
  StoredUserAccount,
  PersistedPlayerPrice,
  Position,
  PricePoint,
  ChartEventType,
  ChartEventMarker,
  MatchEvent,
  EventSentiment,
  getPositionLine,
  normalizeDetailedPosition,
} from "@/types";
import {
  INITIAL_CASH,
  INITIAL_MATCHES,
  INITIAL_PLAYERS,
  POSITION_EVENTS,
} from "@/data/dummyData";
import { getTierConfig, getAvailableShares } from "@/utils/tier";
import {
  roundToTen,
  clampToPriceLimit,
  formatMinuteLabel,
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
  derivePlayerMarketData,
  extractInitialMatchEvents,
  normalizeMatchEvents,
  normalizeMatchEventType,
  cleanEventDescription,
  resolvePlayerMatchContext,
  sanitizeEventTypeForPosition,
  isNegativeEventType,
} from "@/lib/priceEngine";
import {
  getCircuitBreakerRemainingSec,
  validateTradeOrder,
} from "@/lib/orderGate";
import { WEIGHTS } from "@/lib/weights";

export {
  getAvailableShares,
  roundToTen,
  clampToPriceLimit,
  formatMinuteLabel,
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
};

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
  accounts: Record<string, StoredUserAccount>;
  cash: number;
  realizedPnL: number;
  matches: Match[];
  todayMatches: Match[];
  isLoadingTodayMatches: boolean;
  hasFetchedTodayMatches: boolean;
  players: Player[];
  playerPrices: Record<string, PersistedPlayerPrice>;
  holdings: Record<string, Holding>;
  transactions: PointTransaction[];
  watchlist: string[];
  selectedDate: DateKey;
  activeTab: BottomTab;
  expandedMatchIds: string[];
  activeMatchContext: ActiveMatchContext | null;

  // Auth Actions (Account registry, password hash verification & per-user portfolio isolation)
  login: (id: string, password: string) => AuthActionResult;
  signup: (id: string, password: string, name?: string) => AuthActionResult;
  logout: () => void;

  // Market & Trade Actions
  setSelectedDate: (date: DateKey) => void;
  setActiveTab: (tab: BottomTab) => void;
  toggleExpandMatch: (matchId: string) => void;
  toggleWatchlist: (playerId: string) => void;
  ensurePlayerInStore: (player: Player) => void;
  selectPlayer: (
    player: Player,
    matchContext?: ActiveMatchContext | null
  ) => void;
  syncPlayersFromMatches: (matches: Match[]) => void;
  fetchTodayMatches: () => Promise<void>;
  tickMarket: () => void;
  buyPlayer: (playerId: string, quantity: number) => TradeExecutionResult;
  sellPlayer: (playerId: string, quantity: number) => TradeExecutionResult;
  addAdminCash: (amount?: number) => { added: number; nextCash: number };
  triggerForceGoalEvent: (targetPlayerId?: string) => ForceGoalResult | null;
  triggerMatchEvent: (
    targetPlayerId?: string,
    eventType?: ChartEventType
  ) => ForceGoalResult | null;
  resetAll: () => void;
}

// Normalize account lookup key (case-insensitive ID matching)
export const normalizeAccountKey = (id: string): string =>
  id.trim().toLowerCase();

// Salted multi-round password hashing (prevents plain-text password storage in localStorage)
export function hashPassword(accountKey: string, rawPassword: string): string {
  const payload = `pitch-trade-salt-v1:${accountKey.toLowerCase()}:${rawPassword}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let round = 0; round < 256; round++) {
    for (let i = 0; i < payload.length; i++) {
      const code = payload.charCodeAt(i) ^ (round & 0xff);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b);
    }
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `ptv1$${hex1}${hex2}`;
}

const ADMIN_DEFAULT_HASH = hashPassword("admin", "Admin1234");

function syncActiveUserToAccounts(
  state: Pick<
    TradeStoreState,
    | "user"
    | "accounts"
    | "cash"
    | "realizedPnL"
    | "holdings"
    | "transactions"
    | "watchlist"
  >
): Record<string, StoredUserAccount> {
  const nextAccounts = { ...(state.accounts ?? {}) };
  if (!state.user) return nextAccounts;

  const key = normalizeAccountKey(state.user.id);
  const existing = nextAccounts[key];
  const safeCash = roundToTen(state.cash);
  const safeRealizedPnL = roundToTen(state.realizedPnL ?? 0);

  nextAccounts[key] = {
    id: existing?.id ?? state.user.id,
    name: existing?.name ?? state.user.name,
    role: existing?.role ?? state.user.role,
    passwordHash:
      existing?.passwordHash ??
      (key === "admin" ? ADMIN_DEFAULT_HASH : ""),
    cash: safeCash,
    realizedPnL: safeRealizedPnL,
    holdings: state.holdings ?? {},
    transactions: state.transactions ?? [],
    watchlist: state.watchlist ?? existing?.watchlist ?? [],
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  return nextAccounts;
}

// Alias map to normalize international API team names/TLA codes to Korean nationalTeam names
const NATIONAL_TEAM_ALIAS_MAP: Record<string, string> = {
  KOR: "대한민국",
  "SOUTH KOREA": "대한민국",
  "REPUBLIC OF KOREA": "대한민국",
  "KOREA REPUBLIC": "대한민국",
  대한민국: "대한민국",
  한국: "대한민국",
  JPN: "일본",
  JAPAN: "일본",
  일본: "일본",
  ENG: "잉글랜드",
  ENGLAND: "잉글랜드",
  잉글랜드: "잉글랜드",
  ESP: "스페인",
  SPAIN: "스페인",
  스페인: "스페인",
  NOR: "노르웨이",
  NORWAY: "노르웨이",
  노르웨이: "노르웨이",
  POR: "포르투갈",
  PRT: "포르투갈",
  PORTUGAL: "포르투갈",
  포르투갈: "포르투갈",
  ARG: "아르헨티나",
  ARGENTINA: "아르헨티나",
  아르헨티나: "아르헨티나",
  BEL: "벨기에",
  BELGIUM: "벨기에",
  벨기에: "벨기에",
  NED: "네덜란드",
  NLD: "네덜란드",
  NETHERLANDS: "네덜란드",
  네덜란드: "네덜란드",
  EGY: "이집트",
  EGYPT: "이집트",
  이집트: "이집트",
  URU: "우루과이",
  URY: "우루과이",
  URUGUAY: "우루과이",
  우루과이: "우루과이",
  FRA: "프랑스",
  FRANCE: "프랑스",
  프랑스: "프랑스",
  GER: "독일",
  DEU: "독일",
  GERMANY: "독일",
  독일: "독일",
  BRA: "브라질",
  BRAZIL: "브라질",
  브라질: "브라질",
  ITA: "이탈리아",
  ITALY: "이탈리아",
  이탈리아: "이탈리아",
};

const KNOWN_NATIONAL_TEAMS = new Set<string>(
  Object.values(NATIONAL_TEAM_ALIAS_MAP)
);

const NATIONAL_LEAGUE_IDS = new Set<string>([
  "amatch",
  "wc",
  "ec",
  "nl",
  "afcon",
  "asian_cup",
  "copa",
]);

function resolveNationalTeamName(raw?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  return (
    NATIONAL_TEAM_ALIAS_MAP[trimmed.toUpperCase()] ??
    NATIONAL_TEAM_ALIAS_MAP[trimmed] ??
    ""
  );
}

/**
 * 해당 팀 정보가 국가대표팀인지 판별합니다.
 */
export function isNationalTeamInfo(team?: TeamInfo | null): boolean {
  if (!team) return false;
  const byName = resolveNationalTeamName(team.name);
  const byShort = resolveNationalTeamName(team.shortName);
  const byId = resolveNationalTeamName(team.id);
  return Boolean(
    (byName && KNOWN_NATIONAL_TEAMS.has(byName)) ||
      (byShort && KNOWN_NATIONAL_TEAMS.has(byShort)) ||
      (byId && KNOWN_NATIONAL_TEAMS.has(byId))
  );
}

/**
 * 해당 경기가 A매치(국가대표 경기)인지 판별합니다.
 */
export function isNationalTeamMatch(match?: Match | null): boolean {
  if (!match) return false;
  if (typeof match.isInternational === "boolean") {
    return match.isInternational;
  }
  const leagueIdLower = (match.leagueId || "").trim().toLowerCase();
  if (NATIONAL_LEAGUE_IDS.has(leagueIdLower)) return true;
  if (
    match.leagueName?.includes("A매치") ||
    match.leagueCountry?.includes("A매치") ||
    match.leagueName?.includes("월드컵") ||
    match.leagueName?.includes("네이션스리그")
  ) {
    return true;
  }
  return (
    isNationalTeamInfo(match.homeTeam) || isNationalTeamInfo(match.awayTeam)
  );
}

/**
 * A매치 여부에 따라 국가대표 소속(nationalTeam)과 클럽 소속(team)을 엄격히 분리하여 검사합니다.
 * - A매치(국가대표팀): 오직 player.nationalTeam === team 조건만 사용 (클럽 team 필드 배제)
 * - 클럽 경기: 오직 클럽 teamId / teamShort / teamName 조건만 사용
 */
export function doesPlayerBelongToTeam(
  player: Player,
  team?: TeamInfo | null,
  forceAMatch?: boolean
): boolean {
  if (!team) return false;

  const isAMatchTeam =
    forceAMatch !== undefined ? forceAMatch : isNationalTeamInfo(team);

  const teamIdLower = (team.id || "").trim().toLowerCase();
  const teamShortUpper = (team.shortName || "").trim().toUpperCase();
  const teamNameTrimmed = (team.name || "").trim();

  if (isAMatchTeam) {
    const playerNational = (player.nationalTeam || "").trim();
    if (!playerNational) return false;

    const resolvedTeamByName = resolveNationalTeamName(teamNameTrimmed);
    const resolvedTeamByShort = resolveNationalTeamName(teamShortUpper);
    const resolvedTeamById = resolveNationalTeamName(teamIdLower);

    return (
      playerNational === teamNameTrimmed ||
      (Boolean(resolvedTeamByName) && playerNational === resolvedTeamByName) ||
      (Boolean(resolvedTeamByShort) && playerNational === resolvedTeamByShort) ||
      (Boolean(resolvedTeamById) && playerNational === resolvedTeamById)
    );
  }

  // 클럽 팀 매칭 (A매치가 아닐 때만 사용)
  return (
    (Boolean(teamIdLower) && player.teamId.toLowerCase() === teamIdLower) ||
    (Boolean(teamShortUpper) &&
      player.teamShort.toUpperCase() === teamShortUpper) ||
    (Boolean(teamNameTrimmed) && player.teamName === teamNameTrimmed)
  );
}

/**
 * 특정 경기(클럽전 또는 A매치)의 홈팀/원정팀에 속하는 선수인지 검사합니다.
 * - A매치인 경우: 반드시 player.nationalTeam === match.homeTeam || player.nationalTeam === match.awayTeam 조건만 사용
 * - 클럽전인 경우: 클럽 팀 매칭 조건만 사용
 */
export function doesPlayerBelongToMatch(
  player: Player,
  match?: Match | null
): boolean {
  if (!match) return false;
  if (player.id.startsWith("pitch-")) {
    return player.matchId === match.id;
  }

  const isAMatch = isNationalTeamMatch(match);
  if (isAMatch) {
    return (
      doesPlayerBelongToTeam(player, match.homeTeam, true) ||
      doesPlayerBelongToTeam(player, match.awayTeam, true)
    );
  }

  return (
    doesPlayerBelongToTeam(player, match.homeTeam, false) ||
    doesPlayerBelongToTeam(player, match.awayTeam, false)
  );
}

export function filterPlayersForMatch(
  players: Player[],
  match: Match
): Player[] {
  return players.filter((player) => doesPlayerBelongToMatch(player, match));
}

export function parseMinuteFromLabel(
  rawMinute?: number,
  timeLabel?: string,
  fallback = 0
): number {
  if (typeof rawMinute === "number" && Number.isFinite(rawMinute) && rawMinute >= 0) {
    return Math.min(95, Math.max(0, Math.round(rawMinute)));
  }
  if (!timeLabel) return fallback;
  const trimmed = timeLabel.trim().toUpperCase();
  if (trimmed === "FT" || trimmed === "종료") return 90;
  if (trimmed === "HT") return 45;
  if (trimmed === "시초" || trimmed === "선발" || trimmed.startsWith("-")) return 0;
  const matchPlus = trimmed.match(/^90\+(\d+)/);
  if (matchPlus) {
    return Math.min(95, 90 + parseInt(matchPlus[1], 10));
  }
  const numMatch = trimmed.match(/(\d+)/);
  if (numMatch) {
    return Math.min(95, Math.max(0, parseInt(numMatch[1], 10)));
  }
  return fallback;
}

export function normalizePriceHistory(
  rawHistory: PricePoint[] | undefined,
  openPrice: number,
  basePrice: number
): PricePoint[] {
  const safeOpen = clampToPriceLimit(openPrice, basePrice);
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
    return [
      {
        minute: 0,
        timeLabel: "0'",
        price: safeOpen,
        changePercentFromOpen: 0,
      },
    ];
  }

  const byMinute = new Map<number, PricePoint>();
  rawHistory.forEach((pt, idx) => {
    const inferredMin = parseMinuteFromLabel(
      pt.minute,
      pt.timeLabel,
      idx === 0 ? 0 : idx * 15
    );
    const safePrice = clampToPriceLimit(pt.price, basePrice);
    const changePct = calculateChangePercentFromOpen(safePrice, safeOpen);
    const prev = byMinute.get(inferredMin);
    byMinute.set(inferredMin, {
      minute: inferredMin,
      timeLabel: pt.timeLabel || formatMinuteLabel(inferredMin),
      price: safePrice,
      changePercentFromOpen: changePct,
      event: pt.event ?? prev?.event,
    });
  });

  if (!byMinute.has(0)) {
    byMinute.set(0, {
      minute: 0,
      timeLabel: "0'",
      price: safeOpen,
      changePercentFromOpen: 0,
    });
  } else {
    const zeroPt = byMinute.get(0)!;
    byMinute.set(0, {
      ...zeroPt,
      minute: 0,
      timeLabel: "0'",
      price: safeOpen,
      changePercentFromOpen: 0,
    });
  }

  return Array.from(byMinute.values()).sort((a, b) => a.minute - b.minute);
}

// Normalize initial players using getTierConfig(basePrice) and SSOT derivePlayerMarketData
const NORMALIZED_INITIAL_PLAYERS: Player[] = INITIAL_PLAYERS.map((p) => {
  const basePrice = roundToTen(p.basePrice ?? p.initialPrice);
  const openPrice = clampToPriceLimit(
    p.openPrice ?? p.basePrice ?? p.initialPrice,
    basePrice
  );
  const tierCfg = getTierConfig(basePrice);
  const events = extractInitialMatchEvents({
    ...p,
    openPrice,
    basePrice,
  });
  const ctx = resolvePlayerMatchContext({ ...p, events }, INITIAL_MATCHES);
  const derived = derivePlayerMarketData({
    playerId: p.id,
    openPrice,
    basePrice,
    events,
    currentMinute: ctx.minute,
    matchStatus: ctx.status,
  });

  return {
    ...p,
    tier: p.tier ?? tierCfg.tier,
    totalShares: p.totalShares ?? tierCfg.totalShares,
    marketSupply: p.marketSupply ?? tierCfg.marketSupply,
    basePrice,
    openPrice: derived.openPrice,
    ...(derived.closePrice !== undefined
      ? { closePrice: derived.closePrice }
      : {}),
    initialPrice: basePrice,
    currentPrice: derived.currentPrice,
    previousPrice: derived.previousPrice,
    highPrice: derived.highPrice,
    lowPrice: derived.lowPrice,
    volume: derived.volume,
    events: derived.events,
    priceHistory: derived.priceHistory,
  };
});

// Overlay persisted playerPrices onto base players list using SSOT derivePlayerMarketData
function applyPersistedPrices(
  basePlayers: Player[],
  playerPrices: Record<string, PersistedPlayerPrice>,
  matches: Match[] = INITIAL_MATCHES
): Player[] {
  if (!playerPrices || Object.keys(playerPrices).length === 0) {
    return basePlayers;
  }

  return basePlayers.map((player) => {
    const saved = playerPrices[player.id];
    if (!saved) return player;

    const basePrice = roundToTen(
      player.basePrice ?? player.initialPrice ?? 10000
    );
    const openPrice = clampToPriceLimit(
      saved.openPrice ?? player.openPrice ?? basePrice,
      basePrice
    );

    const savedEvents =
      Array.isArray(saved.events) && saved.events.length > 0
        ? normalizeMatchEvents(saved.events, player.id, player.position)
        : extractInitialMatchEvents({
            ...player,
            openPrice,
            basePrice,
            priceHistory:
              Array.isArray(saved.priceHistory) && saved.priceHistory.length > 0
                ? saved.priceHistory
                : player.priceHistory,
          });

    // Ensure base events (like 27' Goal) are preserved alongside any newly saved events
    const mergedEventMap = new Map<number, MatchEvent>();
    for (const ev of player.events ?? []) {
      mergedEventMap.set(ev.minute, ev);
    }
    for (const ev of savedEvents) {
      mergedEventMap.set(ev.minute, ev);
    }
    const events = normalizeMatchEvents(
      Array.from(mergedEventMap.values()),
      player.id,
      player.position
    );

    const ctx = resolvePlayerMatchContext({ ...player, events }, matches);
    const derived = derivePlayerMarketData({
      playerId: player.id,
      openPrice,
      basePrice,
      events,
      currentMinute: ctx.minute,
      matchStatus: ctx.status,
    });

    return {
      ...player,
      basePrice,
      openPrice: derived.openPrice,
      ...(derived.closePrice !== undefined
        ? { closePrice: derived.closePrice }
        : {}),
      initialPrice: basePrice,
      currentPrice: derived.currentPrice,
      previousPrice: derived.previousPrice,
      highPrice: derived.highPrice,
      lowPrice: derived.lowPrice,
      volume: derived.volume,
      events: derived.events,
      priceHistory: derived.priceHistory,
    };
  });
}

let inFlightTodayMatchesPromise: Promise<void> | null = null;

export const useTradeStore = create<TradeStoreState>()(
  persist(
    (set, get) => ({
      user: null,
      accounts: {},
      cash: INITIAL_CASH,
      realizedPnL: 0,
      matches: INITIAL_MATCHES,
      todayMatches: [],
      isLoadingTodayMatches: true,
      hasFetchedTodayMatches: false,
      players: NORMALIZED_INITIAL_PLAYERS,
      playerPrices: {},
      holdings: {},
      transactions: [],
      watchlist: [],
      selectedDate: "TODAY",
      activeTab: "MATCHES",
      expandedMatchIds: ["m-new-ars", "m-tot-ars", "m-mci-liv", "m-kor-jpn"],
      activeMatchContext: null,

      login: (id, password) => {
        const trimmedId = id.trim();
        if (!trimmedId || !password) {
          return {
            success: false,
            message: "아이디와 비밀번호를 모두 입력해주세요.",
          };
        }

        const state = get();
        const nextAccounts = syncActiveUserToAccounts(state);
        const accountKey = normalizeAccountKey(trimmedId);

        // Built-in Admin account verification (ID === 'Admin' && PW === 'Admin1234')
        if (accountKey === "admin") {
          if (trimmedId === "Admin" && password === "Admin1234") {
            const existingAdmin = nextAccounts["admin"];
            const adminCash = roundToTen(existingAdmin?.cash ?? INITIAL_CASH);
            const adminRealizedPnL = roundToTen(
              existingAdmin?.realizedPnL ?? 0
            );
            const adminHoldings = existingAdmin?.holdings ?? {};
            const adminTransactions = existingAdmin?.transactions ?? [];
            const adminWatchlist = existingAdmin?.watchlist ?? [];

            const adminAccount: StoredUserAccount = {
              id: "Admin",
              name: "총괄관리자",
              role: "admin",
              passwordHash: ADMIN_DEFAULT_HASH,
              cash: adminCash,
              realizedPnL: adminRealizedPnL,
              holdings: adminHoldings,
              transactions: adminTransactions,
              watchlist: adminWatchlist,
              createdAt:
                existingAdmin?.createdAt ?? new Date().toISOString(),
            };

            set({
              accounts: {
                ...nextAccounts,
                admin: adminAccount,
              },
              cash: adminCash,
              realizedPnL: adminRealizedPnL,
              holdings: adminHoldings,
              transactions: adminTransactions,
              watchlist: adminWatchlist,
              user: {
                id: "Admin",
                name: "총괄관리자",
                role: "admin",
                cash: adminCash,
              },
            });
            return {
              success: true,
              message: "총괄관리자(Admin) 계정으로 로그인되었습니다.",
              role: "admin",
            };
          }
          return {
            success: false,
            message: "관리자 계정 아이디 또는 비밀번호가 일치하지 않습니다.",
          };
        }

        // Registered user verification against stored accounts
        const targetAccount = nextAccounts[accountKey];
        if (!targetAccount) {
          return {
            success: false,
            message: "등록되지 않은 아이디입니다. 회원가입을 먼저 진행해주세요.",
          };
        }

        const inputHash = hashPassword(accountKey, password);
        if (targetAccount.passwordHash !== inputHash) {
          return {
            success: false,
            message: "비밀번호가 일치하지 않습니다.",
          };
        }

        const restoredCash = roundToTen(targetAccount.cash ?? INITIAL_CASH);
        const restoredRealizedPnL = roundToTen(
          targetAccount.realizedPnL ?? 0
        );
        const restoredHoldings = targetAccount.holdings ?? {};
        const restoredTransactions = targetAccount.transactions ?? [];
        const restoredWatchlist = targetAccount.watchlist ?? [];

        set({
          accounts: nextAccounts,
          cash: restoredCash,
          realizedPnL: restoredRealizedPnL,
          holdings: restoredHoldings,
          transactions: restoredTransactions,
          watchlist: restoredWatchlist,
          user: {
            id: targetAccount.id,
            name: targetAccount.name,
            role: targetAccount.role,
            cash: restoredCash,
          },
        });
        return {
          success: true,
          message: `${targetAccount.name}님 환영합니다!`,
          role: targetAccount.role,
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

        if (/\s/.test(trimmedId)) {
          return {
            success: false,
            message: "아이디에는 공백을 포함할 수 없습니다.",
          };
        }

        if (trimmedId.length < 3 || trimmedId.length > 20) {
          return {
            success: false,
            message: "아이디는 3자 이상 20자 이하로 입력해주세요.",
          };
        }

        if (password.length < 4) {
          return {
            success: false,
            message: "비밀번호는 최소 4자 이상으로 입력해주세요.",
          };
        }

        const accountKey = normalizeAccountKey(trimmedId);
        if (accountKey === "admin") {
          return {
            success: false,
            message:
              "'Admin'은 예약된 총괄관리자 아이디입니다. 로그인 탭을 이용해주세요.",
          };
        }

        const state = get();
        const nextAccounts = syncActiveUserToAccounts(state);

        if (nextAccounts[accountKey]) {
          return {
            success: false,
            message: "이미 사용 중인 아이디입니다. 다른 아이디를 입력해주세요.",
          };
        }

        const displayName = name?.trim() || trimmedId;
        const newAccount: StoredUserAccount = {
          id: trimmedId,
          name: displayName,
          role: "user",
          passwordHash: hashPassword(accountKey, password),
          cash: INITIAL_CASH,
          realizedPnL: 0,
          holdings: {},
          transactions: [],
          watchlist: [],
          createdAt: new Date().toISOString(),
        };

        set({
          accounts: {
            ...nextAccounts,
            [accountKey]: newAccount,
          },
          cash: INITIAL_CASH,
          holdings: {},
          transactions: [],
          watchlist: [],
          realizedPnL: 0,
          user: {
            id: trimmedId,
            name: displayName,
            role: "user",
            cash: INITIAL_CASH,
          },
        });

        return {
          success: true,
          message: `${displayName}님 회원가입 완료! 초기 자금 ${INITIAL_CASH.toLocaleString()} P가 지급되었습니다.`,
          role: "user",
        };
      },

      logout: () => {
        const state = get();
        const nextAccounts = syncActiveUserToAccounts(state);
        set({
          accounts: nextAccounts,
          user: null,
          cash: INITIAL_CASH,
          realizedPnL: 0,
          holdings: {},
          transactions: [],
          watchlist: [],
        });
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

      toggleWatchlist: (playerId) => {
        const state = get();
        const { watchlist } = state;
        const nextWatchlist = watchlist.includes(playerId)
          ? watchlist.filter((id) => id !== playerId)
          : [...watchlist, playerId];
        const nextAccounts = syncActiveUserToAccounts({
          ...state,
          watchlist: nextWatchlist,
        });
        set({ watchlist: nextWatchlist, accounts: nextAccounts });
      },

      selectPlayer: (player, matchContext = null) => {
        set({ activeMatchContext: matchContext });
        get().ensurePlayerInStore(player);
      },

      ensurePlayerInStore: (newPlayer) => {
        const { players, playerPrices } = get();
        const existingIdx = players.findIndex(
          (p) =>
            p.id === newPlayer.id ||
            (!newPlayer.id.startsWith("pitch-") &&
              !p.id.startsWith("pitch-") &&
              p.name.trim() === newPlayer.name.trim())
        );

        if (existingIdx !== -1) {
          // Existing player: never fabricate events or overwrite another match's state on click
          const existing = players[existingIdx];
          if (
            existing.matchId &&
            newPlayer.matchId &&
            existing.matchId !== newPlayer.matchId
          ) {
            return;
          }
          const incomingNat = resolveNationalTeamName(newPlayer.nationalTeam) || newPlayer.nationalTeam || existing.nationalTeam;
          const isIncomingNatTeam = isNationalTeamInfo({
            id: newPlayer.teamId,
            name: newPlayer.teamName,
            shortName: newPlayer.teamShort,
            color: newPlayer.teamColor,
          });

          const nextTeamName =
            !isIncomingNatTeam && newPlayer.teamName
              ? newPlayer.teamName
              : existing.teamName;
          const nextTeamId =
            !isIncomingNatTeam && newPlayer.teamId
              ? newPlayer.teamId
              : existing.teamId;
          const nextTeamShort =
            !isIncomingNatTeam && newPlayer.teamShort
              ? newPlayer.teamShort
              : existing.teamShort;
          const nextTeamColor =
            !isIncomingNatTeam && newPlayer.teamColor
              ? newPlayer.teamColor
              : existing.teamColor;

          if (
            existing.teamName !== nextTeamName ||
            existing.teamId !== nextTeamId ||
            existing.nationalTeam !== incomingNat
          ) {
            const nextPlayers = [...players];
            nextPlayers[existingIdx] = {
              ...existing,
              teamName: nextTeamName,
              teamId: nextTeamId,
              teamShort: nextTeamShort,
              teamColor: nextTeamColor,
              nationalTeam: incomingNat,
            };
            set({ players: nextPlayers });
          }
          return;
        }

        const base = roundToTen(
          newPlayer.basePrice ?? newPlayer.initialPrice ?? 10000
        );
        const tierCfg = getTierConfig(base);
        const savedPrice = playerPrices[newPlayer.id];
        const openPrice = clampToPriceLimit(
          savedPrice?.openPrice ?? newPlayer.openPrice ?? base,
          base
        );

        const initialEvents =
          savedPrice?.events && savedPrice.events.length > 0
            ? normalizeMatchEvents(savedPrice.events, newPlayer.id)
            : Array.isArray(newPlayer.events)
            ? normalizeMatchEvents(newPlayer.events, newPlayer.id)
            : newPlayer.id.startsWith("pitch-")
            ? []
            : extractInitialMatchEvents({
                ...newPlayer,
                openPrice,
                basePrice: base,
                priceHistory:
                  savedPrice?.priceHistory &&
                  savedPrice.priceHistory.length > 0
                    ? savedPrice.priceHistory
                    : newPlayer.priceHistory,
              });

        const ctx = resolvePlayerMatchContext(
          { ...newPlayer, events: initialEvents },
          get().matches
        );
        const derived = derivePlayerMarketData({
          playerId: newPlayer.id,
          openPrice,
          basePrice: base,
          events: initialEvents,
          currentMinute: ctx.minute,
          matchStatus: ctx.status,
        });

        const normalized: Player = {
          ...newPlayer,
          nationalTeam:
            resolveNationalTeamName(newPlayer.nationalTeam) ||
            newPlayer.nationalTeam ||
            "",
          tier: tierCfg.tier,
          totalShares: tierCfg.totalShares,
          marketSupply: tierCfg.marketSupply,
          basePrice: base,
          openPrice: derived.openPrice,
          ...(derived.closePrice !== undefined
            ? { closePrice: derived.closePrice }
            : {}),
          initialPrice: base,
          currentPrice: derived.currentPrice,
          previousPrice: derived.previousPrice,
          highPrice: derived.highPrice,
          lowPrice: derived.lowPrice,
          volume: derived.volume,
          events: derived.events,
          priceHistory: derived.priceHistory,
        };

        set({
          players: [...players, normalized],
          playerPrices: {
            ...playerPrices,
            [normalized.id]: {
              openPrice: normalized.openPrice,
              closePrice: normalized.closePrice,
              currentPrice: normalized.currentPrice,
              previousPrice: normalized.previousPrice,
              highPrice: normalized.highPrice,
              lowPrice: normalized.lowPrice,
              volume: normalized.volume,
              events: normalized.events,
              priceHistory: normalized.priceHistory,
            },
          },
        });
      },

      fetchTodayMatches: async () => {
        if (inFlightTodayMatchesPromise) {
          return inFlightTodayMatchesPromise;
        }
        set({ isLoadingTodayMatches: true });

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const todayStr = `${y}-${m}-${d}`;

        inFlightTodayMatchesPromise = fetch(
          `/api/matches?date=${encodeURIComponent(todayStr)}`,
          { cache: "no-store" }
        )
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && Array.isArray(data.matches)) {
              const fetched = data.matches as Match[];
              set({
                todayMatches: fetched,
                isLoadingTodayMatches: false,
                hasFetchedTodayMatches: true,
              });
              get().syncPlayersFromMatches(fetched);
            } else {
              set({
                isLoadingTodayMatches: false,
                hasFetchedTodayMatches: true,
              });
            }
          })
          .catch(() => {
            set({
              isLoadingTodayMatches: false,
              hasFetchedTodayMatches: true,
            });
          })
          .finally(() => {
            inFlightTodayMatchesPromise = null;
          });

        return inFlightTodayMatchesPromise;
      },

      syncPlayersFromMatches: (incomingMatches) => {
        if (!Array.isArray(incomingMatches) || incomingMatches.length === 0) {
          return;
        }

        const state = get();
        const nextPlayers = [...state.players];
        const nextPlayerPrices: Record<string, PersistedPlayerPrice> = {
          ...state.playerPrices,
        };
        let playersChanged = false;

        const normalizeRole = (rawPos?: string): Position => {
          return normalizeDetailedPosition(rawPos);
        };

        const computeAutoBasePrice = (
          pos: Position,
          leagueId: string,
          age?: number,
          seedStr = ""
        ): number => {
          let hash = 0;
          for (let i = 0; i < seedStr.length; i++) {
            hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
          }
          const absHash = Math.abs(hash);

          // Wonderkid rule: age <= 21 -> C-tier Wonderkid (< 5000)
          const isWonderkid = typeof age === "number" && age > 0 && age <= 21;
          if (isWonderkid) {
            return roundToTen(4300 + (absHash % 6) * 100);
          }

          const line = getPositionLine(pos);
          const roleBase =
            line === "FW"
              ? 11600
              : line === "MF"
              ? 10400
              : line === "DF"
              ? 9000
              : 8400;

          const lid = leagueId.toLowerCase();
          const prestigeBonus =
            lid.includes("cl") ||
            lid.includes("pl") ||
            lid === "epl" ||
            lid === "wc" ||
            lid === "ec"
              ? 1200
              : 400;

          const variance = ((absHash % 9) - 3) * 200;
          return roundToTen(Math.max(5200, roleBase + prestigeBonus + variance));
        };

        for (const match of incomingMatches) {
          const isAMatch = isNationalTeamMatch(match);
          const sides: TeamInfo[] = [match.homeTeam, match.awayTeam].filter(
            Boolean
          );

          for (const team of sides) {
            const rosterItems = [
              ...(Array.isArray(team.lineup) ? team.lineup : []),
              ...(Array.isArray(team.bench) ? team.bench : []),
            ];

            rosterItems.forEach((item, idx) => {
              if (!item || !item.name) return;
              const rawName = item.name.trim();
              const itemIdStr =
                item.id !== undefined ? String(item.id).trim() : "";
              const extIdStr =
                item.externalId !== undefined
                  ? String(item.externalId).trim()
                  : "";

              const existingIdx = nextPlayers.findIndex((p) => {
                if (p.id.startsWith("pitch-")) return false;
                if (itemIdStr && p.id === itemIdStr) return true;
                if (extIdStr && (p.id === extIdStr || p.id === `api-p-${extIdStr}`))
                  return true;
                if (p.name.trim() === rawName) return true;
                if (
                  p.englishName &&
                  p.englishName.trim().toLowerCase() === rawName.toLowerCase()
                )
                  return true;
                return false;
              });

              const resolvedNat = isAMatch
                ? resolveNationalTeamName(item.nationalTeam || team.name) ||
                  item.nationalTeam ||
                  team.name
                : resolveNationalTeamName(item.nationalTeam) ||
                  item.nationalTeam ||
                  "";

              if (existingIdx !== -1) {
                // Existing store player: preserve currentPrice, priceHistory, marketSupply; update team/nationalTeam if changed
                const existing = nextPlayers[existingIdx];
                let updated = existing;

                if (resolvedNat && existing.nationalTeam !== resolvedNat) {
                  updated = { ...updated, nationalTeam: resolvedNat };
                }

                if (!isAMatch) {
                  // Club match: update club team info if player transferred
                  const nextClubName = item.team?.trim() || team.name;
                  if (
                    nextClubName &&
                    existing.teamName !== nextClubName &&
                    !isNationalTeamInfo(team)
                  ) {
                    updated = {
                      ...updated,
                      teamId: team.id || existing.teamId,
                      teamName: nextClubName,
                      teamShort: team.shortName || existing.teamShort,
                      teamColor: team.color || existing.teamColor,
                    };
                  }
                } else if (
                  item.team &&
                  item.team.trim() !== team.name.trim() &&
                  !resolveNationalTeamName(item.team)
                ) {
                  // A-Match where API also supplied explicit club name
                  const explicitClub = item.team.trim();
                  if (existing.teamName !== explicitClub) {
                    updated = {
                      ...updated,
                      teamName: explicitClub,
                    };
                  }
                }

                if (item.isCaptain !== undefined && existing.isCaptain !== item.isCaptain) {
                  updated = { ...updated, isCaptain: item.isCaptain };
                }
                if (item.subInMinute !== undefined && existing.subInMinute !== item.subInMinute) {
                  updated = { ...updated, subInMinute: item.subInMinute };
                }
                if (item.subOutMinute !== undefined && existing.subOutMinute !== item.subOutMinute) {
                  updated = { ...updated, subOutMinute: item.subOutMinute };
                }
                if (item.yellowCards !== undefined && existing.yellowCards !== item.yellowCards) {
                  updated = { ...updated, yellowCards: item.yellowCards };
                }
                if (item.redCards !== undefined && existing.redCards !== item.redCards) {
                  updated = { ...updated, redCards: item.redCards };
                }

                if (updated !== existing) {
                  nextPlayers[existingIdx] = updated;
                  playersChanged = true;
                }
                return;
              }

              // New player: dynamically list in store using getTierConfig(basePrice) & merge with persisted playerPrices
              const position = normalizeRole(
                typeof item.position === "string" ? item.position : "MF"
              );
              const newId =
                itemIdStr && !itemIdStr.startsWith("pitch-")
                  ? itemIdStr.startsWith("p-") || itemIdStr.startsWith("api-p-")
                    ? itemIdStr
                    : `api-p-${itemIdStr}`
                  : extIdStr
                  ? `api-p-${extIdStr}`
                  : `api-p-${team.id}-${idx}-${rawName
                      .toLowerCase()
                      .replace(/[^a-z0-9가-힣]+/g, "-")}`;

              const basePrice = computeAutoBasePrice(
                position,
                match.leagueId,
                item.age,
                `${newId}-${rawName}`
              );
              const tierCfg = getTierConfig(basePrice);
              const savedPrice = nextPlayerPrices[newId];
              const openPrice = clampToPriceLimit(
                savedPrice?.openPrice ?? basePrice,
                basePrice
              );

              const isMatchFT =
                match.status === "FT" || match.rawStatus === "FINISHED";
              const isMatchUpcoming =
                match.status === "UPCOMING" ||
                match.rawStatus === "TIMED" ||
                match.rawStatus === "SCHEDULED";
              const resolvedStatus = isMatchFT
                ? "FT"
                : isMatchUpcoming
                ? "UPCOMING"
                : "LIVE";

              const curMin = Math.min(
                90,
                Math.max(0, match.minute ?? (isMatchFT ? 90 : 45))
              );
              const initialEvents =
                savedPrice?.events && savedPrice.events.length > 0
                  ? normalizeMatchEvents(savedPrice.events, newId, position)
                  : [];

              const derived = derivePlayerMarketData({
                playerId: newId,
                openPrice,
                basePrice,
                events: initialEvents,
                currentMinute: curMin,
                matchStatus: resolvedStatus,
              });

              const clubName =
                !isAMatch
                  ? item.team?.trim() || team.name
                  : item.team && item.team.trim() !== team.name.trim()
                  ? item.team.trim()
                  : team.name;

              const newListedPlayer: Player = {
                id: newId,
                name: rawName,
                englishName: rawName,
                nationalTeam: resolvedNat || (isAMatch ? team.name : "기타"),
                matchId: match.id,
                teamId: team.id,
                teamName: clubName,
                teamShort: team.shortName,
                teamColor: team.color,
                position,
                backNumber: item.shirtNumber ?? ((idx % 25) + 1),
                tier: tierCfg.tier,
                totalShares: tierCfg.totalShares,
                marketSupply: tierCfg.marketSupply,
                basePrice,
                openPrice: derived.openPrice,
                closePrice: derived.closePrice,
                initialPrice: basePrice,
                currentPrice: derived.currentPrice,
                previousPrice: derived.previousPrice,
                highPrice: derived.highPrice,
                lowPrice: derived.lowPrice,
                volume: derived.volume,
                events: derived.events,
                priceHistory: derived.priceHistory,
                lastEvent: {
                  text:
                    tierCfg.tier === "C"
                      ? "⚡ 원더키드 신규 상장 · 실시간 라인업 연동"
                      : "📋 실시간 라인업 자동 상장 종목",
                  sentiment: "positive",
                  minute: match.minute ?? 0,
                },
                stats: {
                  rating: item.rating ?? 7.3,
                  goals: 0,
                  assists: 0,
                  shotsOnTarget: 1,
                  keyPasses: 1,
                  ...(item.yellowCards !== undefined ? { yellowCards: item.yellowCards } : {}),
                  ...(item.redCards !== undefined ? { redCards: item.redCards } : {}),
                },
                ...(item.isCaptain !== undefined ? { isCaptain: item.isCaptain } : {}),
                ...(item.subInMinute !== undefined ? { subInMinute: item.subInMinute } : {}),
                ...(item.subOutMinute !== undefined ? { subOutMinute: item.subOutMinute } : {}),
                ...(item.yellowCards !== undefined ? { yellowCards: item.yellowCards } : {}),
                ...(item.redCards !== undefined ? { redCards: item.redCards } : {}),
              };

              nextPlayers.push(newListedPlayer);
              nextPlayerPrices[newId] = {
                openPrice: derived.openPrice,
                closePrice: derived.closePrice,
                currentPrice: derived.currentPrice,
                previousPrice: derived.previousPrice,
                highPrice: derived.highPrice,
                lowPrice: derived.lowPrice,
                volume: derived.volume,
                events: derived.events,
                priceHistory: derived.priceHistory,
              };
              playersChanged = true;
            });
          }

          // Bind real match events (goals, assists, cards, substitutions) idempotently to player SSOT events
          if (Array.isArray(match.events) && match.events.length > 0) {
            const expandedEvents = match.events.flatMap((ev) => {
              if (ev.type === "SUB") {
                const pairs: NonNullable<typeof match.events> = [];
                if (ev.playerOutId || ev.playerOutName) {
                  pairs.push({
                    ...ev,
                    id: `${ev.id}-out`,
                    type: "SUB_OUT",
                    playerId: ev.playerOutId,
                    playerName: ev.playerOutName ?? ev.playerName,
                  });
                }
                if (ev.playerInId || ev.playerInName) {
                  pairs.push({
                    ...ev,
                    id: `${ev.id}-in`,
                    type: "SUB_IN",
                    playerId: ev.playerInId,
                    playerName: ev.playerInName ?? ev.playerName,
                  });
                }
                return pairs;
              }
              return [ev];
            });

            for (const ev of expandedEvents) {
              const evNameLower = ev.playerName.trim().toLowerCase();
              const evIdStr = ev.playerId ? String(ev.playerId).trim() : "";

              const targetIdx = nextPlayers.findIndex((p) => {
                if (p.id.startsWith("pitch-")) return false;
                if (
                  evIdStr &&
                  (p.id === evIdStr || p.id === `api-p-${evIdStr}`)
                ) {
                  return true;
                }
                if (p.name.trim().toLowerCase() === evNameLower) return true;
                if (
                  p.englishName &&
                  p.englishName.trim().toLowerCase() === evNameLower
                ) {
                  return true;
                }
                return false;
              });

              if (targetIdx === -1) continue;

              const target = nextPlayers[targetIdx];
              const minute = Math.min(95, Math.max(1, ev.minute));

              if (ev.type === "SUB_IN" || ev.type === "SUB_OUT") {
                const alreadySubbed =
                  (ev.type === "SUB_IN" && target.subInMinute === minute) ||
                  (ev.type === "SUB_OUT" && target.subOutMinute === minute);
                if (alreadySubbed) continue;

                const updatedPlayer: Player = {
                  ...target,
                  ...(ev.type === "SUB_IN"
                    ? {
                        subInMinute:
                          target.subInMinute === undefined
                            ? minute
                            : Math.min(target.subInMinute, minute),
                      }
                    : {
                        subOutMinute:
                          target.subOutMinute === undefined
                            ? minute
                            : Math.max(target.subOutMinute, minute),
                      }),
                  lastEvent: {
                    text:
                      ev.type === "SUB_IN"
                        ? `🔄 ${minute}' 교체 투입`
                        : `🔄 ${minute}' 교체 아웃`,
                    sentiment: "neutral",
                    minute,
                  },
                };
                nextPlayers[targetIdx] = updatedPlayer;
                playersChanged = true;
                continue;
              }

              const normalizedType =
                ev.type === "YELLOW_CARD" || ev.type === "RED_CARD"
                  ? ev.type
                  : normalizeMatchEventType(ev.type, 0, target.position);
              const existingEvents = target.events ?? [];
              const alreadyApplied = existingEvents.some(
                (e) => e.minute === minute && e.type === normalizedType
              );
              if (alreadyApplied) continue;

              const basePrice = roundToTen(
                target.basePrice ?? target.initialPrice ?? 10000
              );
              const openPrice = clampToPriceLimit(
                target.openPrice ?? target.priceHistory[0]?.price ?? basePrice,
                basePrice
              );
              const tierCfg = getTierConfig(basePrice);

              const eventSpec: Record<
                ChartEventType,
                {
                  baseRate: number;
                  sentiment: EventSentiment;
                  description: string;
                  bannerText: string;
                }
              > = {
                GOAL: {
                  baseRate: 0.085,
                  sentiment: "positive",
                  description: "실경기 득점 성공",
                  bannerText: `⚽ ${minute}' 실경기 득점 반영!`,
                },
                ASSIST: {
                  baseRate: 0.05,
                  sentiment: "positive",
                  description: "실경기 결정적 어시스트",
                  bannerText: `🎯 ${minute}' 실경기 어시스트 반영!`,
                },
                SAVE: {
                  baseRate: 0.04,
                  sentiment: "positive",
                  description: "실경기 결정적 슈퍼세이브",
                  bannerText: `🧤 ${minute}' 실경기 결정적 선방!`,
                },
                CONCEDED: {
                  baseRate: -0.03,
                  sentiment: "negative",
                  description: "실경기 실점 허용",
                  bannerText: `🥅 ${minute}' 실경기 실점 반영`,
                },
                DEFENSIVE_ACTION: {
                  baseRate: 0.038,
                  sentiment: "positive",
                  description: "실경기 결정적 수비 차단",
                  bannerText: `🛡️ ${minute}' 실경기 결정적 수비!`,
                },
                KEY_PLAY: {
                  baseRate: 0.035,
                  sentiment: "positive",
                  description: "실경기 결정적 기회 창출",
                  bannerText: `🎯 ${minute}' 실경기 기회 창출!`,
                },
                BIG_CHANCE_MISS: {
                  baseRate: -0.028,
                  sentiment: "negative",
                  description: "실경기 빅찬스 미스",
                  bannerText: `😣 ${minute}' 실경기 빅찬스 미스`,
                },
                YELLOW_CARD: {
                  baseRate: -0.03,
                  sentiment: "negative",
                  description: "실경기 옐로카드 경고",
                  bannerText: `🟨 ${minute}' 실경기 옐로카드 경고`,
                },
                RED_CARD: {
                  baseRate: -0.1,
                  sentiment: "negative",
                  description: "실경기 레드카드 퇴장",
                  bannerText: `🟥 ${minute}' 실경기 레드카드 퇴장`,
                },
                SUB_OUT: {
                  baseRate: 0,
                  sentiment: "neutral",
                  description: "실경기 교체 아웃",
                  bannerText: `🔄 ${minute}' 실경기 교체 아웃`,
                },
                SUB_IN: {
                  baseRate: 0,
                  sentiment: "neutral",
                  description: "실경기 교체 투입",
                  bannerText: `🔄 ${minute}' 실경기 교체 투입`,
                },
                SUB: {
                  baseRate: 0,
                  sentiment: "neutral",
                  description: "실경기 선수 교체",
                  bannerText: `🔄 ${minute}' 실경기 선수 교체`,
                },
              };

              const spec = eventSpec[normalizedType] ?? eventSpec.GOAL;
              const impactPct = Number(
                (spec.baseRate * tierCfg.volatilityMultiplier * 100).toFixed(1)
              );

              const newMatchEvent: MatchEvent = {
                id: ev.id || `ev-${target.id}-${minute}-${normalizedType}`,
                playerId: target.id,
                minute,
                type: normalizedType,
                description: spec.description,
                priceImpactPercent: impactPct,
                source: ev.source ?? "REAL",
              };

              const nextEvents =
                normalizedType === "YELLOW_CARD" || normalizedType === "RED_CARD"
                  ? [...existingEvents, newMatchEvent].sort(
                      (a, b) => a.minute - b.minute
                    )
                  : normalizeMatchEvents(
                      [...existingEvents, newMatchEvent],
                      target.id,
                      target.position
                    );
              const derived = derivePlayerMarketData({
                playerId: target.id,
                openPrice,
                basePrice,
                events: nextEvents,
                currentMinute: Math.max(minute, match.minute ?? minute),
                matchStatus: match.status,
              });

              const nextStats = { ...target.stats };
              if (ev.type === "GOAL") {
                nextStats.goals += 1;
                nextStats.shotsOnTarget += 1;
                nextStats.rating = Number(
                  Math.min(9.9, nextStats.rating + 0.4).toFixed(1)
                );
              } else if (ev.type === "ASSIST") {
                nextStats.assists += 1;
                nextStats.keyPasses += 1;
                nextStats.rating = Number(
                  Math.min(9.9, nextStats.rating + 0.3).toFixed(1)
                );
              } else if (ev.type === "YELLOW_CARD") {
                nextStats.yellowCards = (nextStats.yellowCards ?? target.yellowCards ?? 0) + 1;
                nextStats.rating = Number(
                  Math.max(4.5, nextStats.rating - 0.2).toFixed(1)
                );
              } else if (ev.type === "RED_CARD") {
                nextStats.redCards = (nextStats.redCards ?? target.redCards ?? 0) + 1;
                nextStats.rating = Number(
                  Math.max(3.5, nextStats.rating - 0.8).toFixed(1)
                );
              }

              const updatedPlayer: Player = {
                ...target,
                openPrice: derived.openPrice,
                ...(derived.closePrice !== undefined
                  ? { closePrice: derived.closePrice }
                  : {}),
                previousPrice: derived.previousPrice,
                currentPrice: derived.currentPrice,
                highPrice: derived.highPrice,
                lowPrice: derived.lowPrice,
                volume: derived.volume,
                events: derived.events,
                priceHistory: derived.priceHistory,
                ...(ev.type === "YELLOW_CARD"
                  ? { yellowCards: nextStats.yellowCards }
                  : {}),
                ...(ev.type === "RED_CARD"
                  ? { redCards: nextStats.redCards }
                  : {}),
                lastEvent: {
                  text: spec.bannerText,
                  sentiment: spec.sentiment,
                  minute,
                },
                stats: nextStats,
              };

              nextPlayers[targetIdx] = updatedPlayer;
              nextPlayerPrices[updatedPlayer.id] = {
                openPrice: derived.openPrice,
                closePrice: derived.closePrice,
                currentPrice: derived.currentPrice,
                previousPrice: derived.previousPrice,
                highPrice: derived.highPrice,
                lowPrice: derived.lowPrice,
                volume: derived.volume,
                events: derived.events,
                priceHistory: derived.priceHistory,
              };
              playersChanged = true;
            }
          }
        }

        // Also merge incomingMatches into state.matches so tickMarket can update live API matches
        const existingMatchMap = new Map(
          state.matches.map((m) => [m.id, m] as const)
        );
        let matchesChanged = false;
        for (const inc of incomingMatches) {
          const prev = existingMatchMap.get(inc.id);
          if (!prev) {
            existingMatchMap.set(inc.id, inc);
            matchesChanged = true;
          } else if (
            prev.isInternational !== inc.isInternational ||
            prev.status !== inc.status ||
            prev.homeTeam.score !== inc.homeTeam.score ||
            prev.awayTeam.score !== inc.awayTeam.score ||
            (inc.events?.length ?? 0) !== (prev.events?.length ?? 0) ||
            (!prev.homeTeam.lineup && inc.homeTeam.lineup) ||
            (!prev.awayTeam.lineup && inc.awayTeam.lineup)
          ) {
            existingMatchMap.set(inc.id, {
              ...inc,
              minute: inc.minute ?? prev.minute,
              homeTeam: {
                ...inc.homeTeam,
                score: inc.homeTeam.score ?? prev.homeTeam.score,
              },
              awayTeam: {
                ...inc.awayTeam,
                score: inc.awayTeam.score ?? prev.awayTeam.score,
              },
            });
            matchesChanged = true;
          }
        }

        if (playersChanged || matchesChanged) {
          set({
            ...(playersChanged
              ? { players: nextPlayers, playerPrices: nextPlayerPrices }
              : {}),
            ...(matchesChanged
              ? { matches: Array.from(existingMatchMap.values()) }
              : {}),
          });
        }
      },

      tickMarket: () => {
        const { matches, players, playerPrices } = get();

        const updatedMatches = matches.map((m) => {
          const isMatchLive =
            m.status === "LIVE" || m.rawStatus === "IN_PLAY";
          if (!isMatchLive) return m;
          const nextMin = (m.minute ?? 45) >= 90 ? 46 : (m.minute ?? 45) + 1;
          return { ...m, minute: nextMin };
        });

        const liveMatchMap = new Map(
          updatedMatches.map((m) => [m.id, m] as const)
        );

        const nextPlayerPrices: Record<string, PersistedPlayerPrice> = {
          ...playerPrices,
        };

        const updatedPlayers = players.map((player) => {
          const basePrice = roundToTen(
            player.basePrice ?? player.initialPrice ?? 10000
          );
          const openPrice = clampToPriceLimit(
            player.openPrice ?? player.priceHistory[0]?.price ?? basePrice,
            basePrice
          );
          const safeCurrentPrice = clampToPriceLimit(
            player.currentPrice,
            basePrice
          );

          const directMatch = liveMatchMap.get(player.matchId);
          const isDirectLive =
            directMatch?.status === "LIVE" ||
            directMatch?.rawStatus === "IN_PLAY";
          const match = isDirectLive
            ? directMatch
            : updatedMatches.find(
                (m) =>
                  (m.status === "LIVE" || m.rawStatus === "IN_PLAY") &&
                  doesPlayerBelongToMatch(player, m)
              ) ?? directMatch;
          const isLive =
            match?.status === "LIVE" || match?.rawStatus === "IN_PLAY";
          const isFT =
            match?.status === "FT" || match?.rawStatus === "FINISHED";

          // Guard: Only fluctuate prices for LIVE matches (FT and UPCOMING stay fixed)
          if (!isLive) {
            if (!isFT) {
              return {
                ...player,
                basePrice,
                openPrice,
                initialPrice: basePrice,
                currentPrice: openPrice,
                previousPrice: openPrice,
                highPrice: openPrice,
                lowPrice: openPrice,
                events: [],
                priceHistory: [
                  {
                    minute: 0,
                    timeLabel: "0'",
                    price: openPrice,
                    changePercentFromOpen: 0,
                  },
                ],
              };
            }
            return {
              ...player,
              basePrice,
              openPrice,
              closePrice: player.closePrice ?? safeCurrentPrice,
              initialPrice: basePrice,
              currentPrice: safeCurrentPrice,
            };
          }

          // Event-driven price calculation with Single Source of Truth tier config (Wonderkid Rule):
          const tierCfg = getTierConfig(basePrice);
          const pool =
            POSITION_EVENTS[player.position] ??
            POSITION_EVENTS[getPositionLine(player.position)] ??
            POSITION_EVENTS.MF;
          const chosen = pool[Math.floor(Math.random() * pool.length)];

          const isSpecialGoalOrAssist =
            (chosen.statEffect === "goal" || chosen.statEffect === "assist") &&
            Math.random() < 0.25;

          const baseRate = isSpecialGoalOrAssist
            ? chosen.minRate +
              Math.random() * (chosen.maxRate - chosen.minRate)
            : Math.random() * 0.05 - 0.025;
          const rawRate = baseRate * tierCfg.volatilityMultiplier;
          const tickImpactPct = Number((rawRate * 100).toFixed(1));

          const currentMinute = Math.max(
            1,
            Math.min(95, match?.minute ?? player.lastEvent.minute ?? 46)
          );

          const allowRandomEvents =
            !player.id.startsWith("pitch-") &&
            match?.providerMode !== "SCORE_ONLY" &&
            !Array.isArray(match?.events);

          const isMilestoneChartEvent =
            allowRandomEvents &&
            (isSpecialGoalOrAssist ||
              (Boolean(chosen.chartEventType) &&
                chosen.chartEventType !== "GOAL" &&
                chosen.chartEventType !== "ASSIST" &&
                Math.random() < 0.14 &&
                (((chosen.chartEventType === "YELLOW_CARD" ||
                  chosen.chartEventType === "CONCEDED" ||
                  chosen.chartEventType === "BIG_CHANCE_MISS") &&
                  tickImpactPct < 0) ||
                  ((chosen.chartEventType === "SAVE" ||
                    chosen.chartEventType === "DEFENSIVE_ACTION" ||
                    chosen.chartEventType === "KEY_PLAY") &&
                    tickImpactPct > 0))));

          let nextEvents = player.events ?? [];
          if (isMilestoneChartEvent && chosen.chartEventType && tickImpactPct !== 0) {
            const evType = normalizeMatchEventType(
              chosen.chartEventType,
              tickImpactPct,
              player.position
            );
            const newEv: MatchEvent = {
              id: `ev-${player.id}-${currentMinute}-${evType}`,
              playerId: player.id,
              minute: currentMinute,
              type: evType,
              description: cleanEventDescription(
                chosen.chartEventTitle ?? chosen.text,
                evType
              ),
              priceImpactPercent: tickImpactPct,
            };
            nextEvents = normalizeMatchEvents(
              [
                ...nextEvents.filter((e) => e.minute < currentMinute),
                newEv,
              ],
              player.id,
              player.position
            );
          }

          const derived = derivePlayerMarketData({
            playerId: player.id,
            openPrice,
            basePrice,
            events: nextEvents,
            currentMinute,
            matchStatus: "LIVE",
          });

          const nextPrice = derived.currentPrice;
          const nextStats = { ...player.stats };
          if (allowRandomEvents && isSpecialGoalOrAssist && chosen.statEffect === "goal") {
            nextStats.goals += 1;
          } else if (
            allowRandomEvents &&
            isSpecialGoalOrAssist &&
            chosen.statEffect === "assist"
          ) {
            nextStats.assists += 1;
          } else if (
            chosen.statEffect === "shot" &&
            nextPrice > safeCurrentPrice
          ) {
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

          nextPlayerPrices[player.id] = {
            openPrice: derived.openPrice,
            closePrice: player.closePrice,
            currentPrice: derived.currentPrice,
            previousPrice: safeCurrentPrice,
            highPrice: derived.highPrice,
            lowPrice: derived.lowPrice,
            volume: derived.volume,
            events: derived.events,
            priceHistory: derived.priceHistory,
          };

          return {
            ...player,
            basePrice,
            openPrice: derived.openPrice,
            initialPrice: basePrice,
            previousPrice: safeCurrentPrice,
            currentPrice: derived.currentPrice,
            highPrice: derived.highPrice,
            lowPrice: derived.lowPrice,
            volume: derived.volume,
            events: derived.events,
            priceHistory: derived.priceHistory,
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
          playerPrices: nextPlayerPrices,
        });
      },

      buyPlayer: (playerId, quantity) => {
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return {
            success: false,
            message: "수량은 1주 이상의 정수로 입력해주세요.",
          };
        }

        const { user, cash, players, matches, holdings, accounts, transactions, activeMatchContext } = get();
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

        const matchCtx = resolvePlayerMatchContext(player, matches);
        const effectiveStatus =
          activeMatchContext && activeMatchContext.matchId === player.matchId
            ? activeMatchContext.status === "FT"
              ? "FT"
              : activeMatchContext.status === "PRE"
              ? "UPCOMING"
              : "LIVE"
            : matchCtx.status;
        const basePrice = roundToTen(
          player.basePrice ?? player.initialPrice ?? player.currentPrice
        );
        const effectiveCurrent =
          effectiveStatus === "UPCOMING" ? basePrice : player.currentPrice;
        const gate = validateTradeOrder({
          side: "BUY",
          matchStatus: effectiveStatus,
          basePrice,
          currentPrice: effectiveCurrent,
          quantity,
          cash,
          lastMajorEventAt: player.lastMajorEventAt,
        });
        if (!gate.allowed) {
          return {
            success: false,
            message: gate.message ?? "주문을 실행할 수 없습니다.",
          };
        }

        const executedPrice = gate.executedPrice;
        const totalCost = roundToTen(executedPrice * quantity);

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

        const nextHoldings = {
          ...holdings,
          [playerId]: {
            playerId,
            quantity: newQty,
            avgBuyPrice: newAvg,
          },
        };
        const nextTransactions = [newTx, ...transactions].slice(0, 40);
        const stateSnapshot = get();
        const nextAccounts = syncActiveUserToAccounts({
          ...stateSnapshot,
          cash: nextCash,
          holdings: nextHoldings,
          transactions: nextTransactions,
        });

        set({
          accounts: nextAccounts,
          cash: nextCash,
          user: user ? { ...user, cash: nextCash } : null,
          holdings: nextHoldings,
          transactions: nextTransactions,
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

        const { user, cash, realizedPnL, players, matches, holdings, transactions, activeMatchContext } =
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

        const matchCtx = resolvePlayerMatchContext(player, matches);
        const effectiveStatus =
          activeMatchContext && activeMatchContext.matchId === player.matchId
            ? activeMatchContext.status === "FT"
              ? "FT"
              : activeMatchContext.status === "PRE"
              ? "UPCOMING"
              : "LIVE"
            : matchCtx.status;
        const prev = holdings[playerId];
        const basePrice = roundToTen(
          player.basePrice ?? player.initialPrice ?? player.currentPrice
        );
        const effectiveCurrent =
          effectiveStatus === "UPCOMING" ? basePrice : player.currentPrice;
        const gate = validateTradeOrder({
          side: "SELL",
          matchStatus: effectiveStatus,
          basePrice,
          currentPrice: effectiveCurrent,
          quantity,
          holdingQuantity: prev?.quantity ?? 0,
          lastMajorEventAt: player.lastMajorEventAt,
        });
        if (!gate.allowed || !prev) {
          return {
            success: false,
            message: gate.message ?? "주문을 실행할 수 없습니다.",
          };
        }

        const executedPrice = gate.executedPrice;
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

        const nextTransactions = [newTx, ...transactions].slice(0, 40);
        const stateSnapshot = get();
        const nextAccounts = syncActiveUserToAccounts({
          ...stateSnapshot,
          cash: nextCash,
          realizedPnL: nextRealizedPnL,
          holdings: nextHoldings,
          transactions: nextTransactions,
        });

        set({
          accounts: nextAccounts,
          cash: nextCash,
          realizedPnL: nextRealizedPnL,
          user: user ? { ...user, cash: nextCash } : null,
          holdings: nextHoldings,
          transactions: nextTransactions,
        });

        return {
          success: true,
          executedPrice,
          message: `${player.name} ${quantity}주 매도 완료 (+${totalProceeds.toLocaleString()} P)`,
        };
      },

      addAdminCash: (amount = 1000000) => {
        const state = get();
        const { user, cash } = state;
        if (
          user?.role !== "admin" ||
          process.env.NODE_ENV === "production"
        ) {
          return { added: 0, nextCash: cash };
        }
        const added = roundToTen(amount);
        const nextCash = roundToTen(cash + added);
        const nextAccounts = syncActiveUserToAccounts({
          ...state,
          cash: nextCash,
        });
        set({
          accounts: nextAccounts,
          cash: nextCash,
          user: user ? { ...user, cash: nextCash } : null,
        });
        return { added, nextCash };
      },

      triggerForceGoalEvent: (targetPlayerId) => {
        const { user } = get();
        if (
          user?.role !== "admin" ||
          process.env.NODE_ENV === "production"
        ) {
          return null;
        }
        return get().triggerMatchEvent(targetPlayerId, "GOAL");
      },

      triggerMatchEvent: (targetPlayerId, eventType = "GOAL") => {
        const { user, players, playerPrices, holdings, matches } = get();
        if (
          user?.role !== "admin" ||
          process.env.NODE_ENV === "production"
        ) {
          return null;
        }
        if (players.length === 0) return null;

        let target: Player | undefined;
        if (targetPlayerId) {
          target = players.find((p) => p.id === targetPlayerId);
        }

        if (!target) {
          const heldIds = Object.keys(holdings).filter(
            (id) => (holdings[id]?.quantity ?? 0) > 0
          );
          const heldCandidates = players.filter((p) => heldIds.includes(p.id));
          const pool = heldCandidates.length > 0 ? heldCandidates : players;
          const nonCapped = pool.filter((p) => {
            const base = roundToTen(p.basePrice ?? p.initialPrice ?? 10000);
            return p.currentPrice < roundToTen(base * (1 + WEIGHTS.CAP_LIMIT));
          });
          const pickFrom = nonCapped.length > 0 ? nonCapped : pool;
          target = pickFrom[Math.floor(Math.random() * pickFrom.length)];
        }

        if (!target) return null;

        const basePrice = roundToTen(
          target.basePrice ?? target.initialPrice ?? 10000
        );
        const openPrice = clampToPriceLimit(
          target.openPrice ?? target.priceHistory[0]?.price ?? basePrice,
          basePrice
        );
        const tierCfg = getTierConfig(basePrice);
        const capPrice = roundToTen(basePrice * (1 + WEIGHTS.CAP_LIMIT));
        const floorPrice = roundToTen(basePrice * (1 - WEIGHTS.CAP_LIMIT));
        const prevPrice = clampToPriceLimit(target.currentPrice, basePrice);

        const eventMetaMap: Record<
          ChartEventType,
          {
            baseRate: number;
            title: string;
            feedText: string;
            sentiment: "positive" | "negative" | "neutral";
          }
        > = {
          GOAL: {
            baseRate: 0.068 + Math.random() * 0.018,
            title: "⚽ 득점",
            feedText: "⚽ [GOAL] 환상적인 원더골 작렬!! (시세 급등)",
            sentiment: "positive",
          },
          ASSIST: {
            baseRate: 0.038 + Math.random() * 0.015,
            title: "🅰️ 도움",
            feedText: "🅰️ [ASSIST] 수비 라인을 허무는 결정적 어시스트 기록!",
            sentiment: "positive",
          },
          SAVE: {
            baseRate: 0.032 + Math.random() * 0.014,
            title: "🧤 슈퍼 세이브",
            feedText: "🧤 [SAVE] 1대1 결정적 실점 위기를 막아내는 슈퍼 세이브!",
            sentiment: "positive",
          },
          CONCEDED: {
            baseRate: -(0.025 + Math.random() * 0.012),
            title: "🥅 실점",
            feedText: "🥅 [CONCEDED] 상대 유효슈팅에 아쉬운 실점 허용",
            sentiment: "negative",
          },
          DEFENSIVE_ACTION: {
            baseRate: 0.032 + Math.random() * 0.014,
            title: "🛡️ 결정적 수비",
            feedText: "🛡️ [DEFENSIVE] 1대1 돌파 저지 및 결정적 태클!",
            sentiment: "positive",
          },
          KEY_PLAY: {
            baseRate: 0.028 + Math.random() * 0.012,
            title: "🎯 기회 창출",
            feedText: "🎯 [KEY PLAY] 수비 라인을 허무는 결정적 킬패스!",
            sentiment: "positive",
          },
          BIG_CHANCE_MISS: {
            baseRate: -(0.024 + Math.random() * 0.012),
            title: "😣 빅찬스 미스",
            feedText: "😣 [MISS] 골키퍼와 1대1 빅찬스 슈팅 무산",
            sentiment: "negative",
          },
          YELLOW_CARD: {
            baseRate: -(0.025 + Math.random() * 0.012),
            title: "🟨 경고",
            feedText: "🟨 거친 태클로 인한 옐로카드 경고 누적 주의",
            sentiment: "negative",
          },
          RED_CARD: {
            baseRate: -(0.08 + Math.random() * 0.03),
            title: "🟥 퇴장",
            feedText: "🟥 위험한 파울로 인한 다이렉트 퇴장 선언! (시세 급락)",
            sentiment: "negative",
          },
          SUB_OUT: {
            baseRate: -0.008 + Math.random() * 0.016,
            title: "🔄 교체 아웃",
            feedText: "🔄 전술 변화 및 체력 안배를 위한 교체 아웃",
            sentiment: "neutral",
          },
          SUB_IN: {
            baseRate: 0,
            title: "🔄 교체 투입",
            feedText: "🔄 경기 후반 흐름 변화를 위한 교체 투입",
            sentiment: "neutral",
          },
          SUB: {
            baseRate: 0,
            title: "🔄 선수 교체",
            feedText: "🔄 전술 변화에 따른 선수 교체",
            sentiment: "neutral",
          },
        };

        const sanitizedTriggerType: ChartEventType =
          eventType === "SUB_OUT" || eventType === "SUB_IN" || eventType === "SUB"
            ? eventType
            : sanitizeEventTypeForPosition(
                eventType,
                target.position,
                eventType === "YELLOW_CARD" ||
                  eventType === "RED_CARD" ||
                  eventType === "CONCEDED" ||
                  eventType === "BIG_CHANCE_MISS"
                  ? -1
                  : 1
              );
        const meta = eventMetaMap[sanitizedTriggerType] ?? eventMetaMap.GOAL;
        const scaledRate = meta.baseRate * tierCfg.volatilityMultiplier;
        let nextPrice = clampToPriceLimit(
          Math.round(prevPrice * (1 + scaledRate)),
          basePrice
        );

        if (meta.baseRate > 0 && nextPrice <= prevPrice && prevPrice < capPrice) {
          nextPrice = clampToPriceLimit(prevPrice + 250, basePrice);
        } else if (
          meta.baseRate < 0 &&
          nextPrice >= prevPrice &&
          prevPrice > floorPrice
        ) {
          nextPrice = clampToPriceLimit(prevPrice - 200, basePrice);
        }

        const match =
          matches.find(
            (m) =>
              (m.status === "LIVE" || m.rawStatus === "IN_PLAY") &&
              doesPlayerBelongToMatch(target!, m)
          ) ?? matches.find((m) => doesPlayerBelongToMatch(target!, m));

        const lastHistoryMin =
          target.priceHistory[target.priceHistory.length - 1]?.minute ?? 60;
        const currentMinute = Math.min(
          92,
          Math.max(1, match?.minute ?? Math.min(90, lastHistoryMin + 2))
        );

        const rawImpactPct = Number((scaledRate * 100).toFixed(1));
        const normalizedType = normalizeMatchEventType(
          sanitizedTriggerType,
          rawImpactPct,
          target.position
        );
        const newEv: MatchEvent = {
          id: `ev-${target.id}-${currentMinute}-${normalizedType}-${Date.now()}`,
          playerId: target.id,
          minute: currentMinute,
          type: normalizedType,
          description: cleanEventDescription(meta.feedText, normalizedType),
          priceImpactPercent: rawImpactPct,
        };

        const nextEvents = normalizeMatchEvents(
          [
            ...(target.events ?? []).filter((e) => e.minute < currentMinute),
            newEv,
          ],
          target.id,
          target.position
        );

        const derived = derivePlayerMarketData({
          playerId: target.id,
          openPrice,
          basePrice,
          events: nextEvents,
          currentMinute,
          matchStatus: "LIVE",
        });

        nextPrice = derived.currentPrice;
        const capped =
          meta.baseRate > 0
            ? nextPrice >= capPrice && prevPrice >= capPrice
            : nextPrice <= floorPrice && prevPrice <= floorPrice;

        const ratePct = Number(
          (
            prevPrice > 0 ? ((nextPrice - prevPrice) / prevPrice) * 100 : 0
          ).toFixed(1)
        );

        const nextStats = {
          ...target.stats,
          goals:
            eventType === "GOAL"
              ? (target.stats?.goals ?? 0) + 1
              : target.stats?.goals ?? 0,
          assists:
            eventType === "ASSIST"
              ? (target.stats?.assists ?? 0) + 1
              : target.stats?.assists ?? 0,
          shotsOnTarget:
            eventType === "GOAL"
              ? (target.stats?.shotsOnTarget ?? 0) + 1
              : target.stats?.shotsOnTarget ?? 0,
          keyPasses:
            eventType === "ASSIST"
              ? (target.stats?.keyPasses ?? 0) + 1
              : target.stats?.keyPasses ?? 0,
          rating: Number(
            Math.min(
              9.9,
              Math.max(
                5.0,
                (target.stats?.rating ?? 7.5) +
                  (normalizedType === "GOAL"
                    ? 0.4
                    : normalizedType === "ASSIST" ||
                      normalizedType === "SAVE" ||
                      normalizedType === "DEFENSIVE_ACTION" ||
                      normalizedType === "KEY_PLAY"
                    ? 0.3
                    : normalizedType === "RED_CARD"
                    ? -0.8
                    : isNegativeEventType(normalizedType)
                    ? -0.2
                    : 0)
              )
            ).toFixed(1)
          ),
        };

        const updatedPlayer: Player = {
          ...target,
          basePrice,
          openPrice: derived.openPrice,
          initialPrice: basePrice,
          previousPrice: prevPrice,
          currentPrice: derived.currentPrice,
          highPrice: derived.highPrice,
          lowPrice: derived.lowPrice,
          volume: derived.volume,
          events: derived.events,
          priceHistory: derived.priceHistory,
          lastMajorEventAt:
            normalizedType === "GOAL" || normalizedType === "RED_CARD"
              ? Date.now()
              : target.lastMajorEventAt,
          lastEvent: {
            text: meta.feedText,
            sentiment: meta.sentiment,
            minute: currentMinute,
          },
          stats: nextStats,
        };

        const nextPlayers = players.map((p) =>
          p.id === updatedPlayer.id ? updatedPlayer : p
        );

        const nextPlayerPrices: Record<string, PersistedPlayerPrice> = {
          ...playerPrices,
          [updatedPlayer.id]: {
            openPrice: derived.openPrice,
            closePrice: updatedPlayer.closePrice,
            currentPrice: derived.currentPrice,
            previousPrice: prevPrice,
            highPrice: derived.highPrice,
            lowPrice: derived.lowPrice,
            volume: derived.volume,
            events: derived.events,
            priceHistory: derived.priceHistory,
          },
        };

        const nextMatches = matches.map((m) => {
          if (!doesPlayerBelongToMatch(updatedPlayer, m)) return m;
          const isHome = doesPlayerBelongToTeam(updatedPlayer, m.homeTeam);
          const isAway = doesPlayerBelongToTeam(updatedPlayer, m.awayTeam);
          if (!isHome && !isAway) return m;

          return {
            ...m,
            homeTeam:
              eventType === "GOAL" && isHome
                ? { ...m.homeTeam, score: (m.homeTeam.score ?? 0) + 1 }
                : m.homeTeam,
            awayTeam:
              eventType === "GOAL" && isAway
                ? { ...m.awayTeam, score: (m.awayTeam.score ?? 0) + 1 }
                : m.awayTeam,
            highlightText:
              eventType === "GOAL"
                ? `⚽ ${updatedPlayer.name} 추가골 작렬! (통산 ${updatedPlayer.stats.goals}골) · 실시간 시세 급등`
                : `${meta.title} · ${updatedPlayer.name} (${currentMinute}') 실시간 시세 반영`,
          };
        });

        set({
          players: nextPlayers,
          playerPrices: nextPlayerPrices,
          matches: nextMatches,
        });

        return {
          player: updatedPlayer,
          prevPrice,
          nextPrice,
          ratePct,
          capped,
        };
      },

      resetAll: () => {
        const state = get();
        const { user } = state;
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("pitch-trade-storage-v1");
          window.localStorage.removeItem("fotmob-pitchtrade-storage-v2");
          window.localStorage.removeItem("fotmob-pitchtrade-storage-v3");
        }
        const nextAccounts = syncActiveUserToAccounts({
          ...state,
          cash: INITIAL_CASH,
          realizedPnL: 0,
          holdings: {},
          transactions: [],
          watchlist: [],
        });
        set({
          accounts: nextAccounts,
          cash: INITIAL_CASH,
          realizedPnL: 0,
          user: user ? { ...user, cash: INITIAL_CASH } : null,
          matches: INITIAL_MATCHES,
          players: NORMALIZED_INITIAL_PLAYERS,
          playerPrices: {},
          holdings: {},
          transactions: [],
          watchlist: [],
          selectedDate: "TODAY",
          expandedMatchIds: ["m-new-ars", "m-tot-ars", "m-mci-liv", "m-kor-jpn"],
      activeMatchContext: null,
        });
      },
    }),
    {
      name: "fotmob-pitchtrade-storage-v4",
      storage: createJSONStorage(() => localStorage),
      // Persist only user session, account registry, asset data, watchlist, and lightweight playerPrices map (never master matches/players)
      partialize: (state) => ({
        cash: state.cash,
        holdings: state.holdings,
        transactions: state.transactions,
        realizedPnL: state.realizedPnL,
        user: state.user,
        accounts: state.accounts,
        watchlist: state.watchlist,
        playerPrices: state.playerPrices,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<TradeStoreState>) ?? {};
        const cash = roundToTen(persisted.cash ?? currentState.cash);
        const realizedPnL = roundToTen(
          persisted.realizedPnL ?? currentState.realizedPnL
        );
        const playerPrices = persisted.playerPrices ?? {};
        const mergedPlayers = applyPersistedPrices(
          currentState.players,
          playerPrices
        );
        const accounts = { ...(persisted.accounts ?? {}) };
        const watchlist = Array.isArray(persisted.watchlist)
          ? persisted.watchlist
          : currentState.watchlist;

        return {
          ...currentState,
          ...persisted,
          accounts,
          watchlist,
          cash,
          realizedPnL,
          playerPrices,
          players: mergedPlayers,
          user: persisted.user
            ? {
                ...persisted.user,
                cash,
              }
            : null,
        };
      },
    }
  )
);
