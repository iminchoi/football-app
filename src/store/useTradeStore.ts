import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
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

export { getAvailableShares };

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
  players: Player[];
  playerPrices: Record<string, PersistedPlayerPrice>;
  holdings: Record<string, Holding>;
  transactions: PointTransaction[];
  selectedDate: DateKey;
  activeTab: BottomTab;
  expandedMatchIds: string[];

  // Auth Actions (Account registry, password hash verification & per-user portfolio isolation)
  login: (id: string, password: string) => AuthActionResult;
  signup: (id: string, password: string, name?: string) => AuthActionResult;
  logout: () => void;

  // Market & Trade Actions
  setSelectedDate: (date: DateKey) => void;
  setActiveTab: (tab: BottomTab) => void;
  toggleExpandMatch: (matchId: string) => void;
  ensurePlayerInStore: (player: Player) => void;
  syncPlayersFromMatches: (matches: Match[]) => void;
  tickMarket: () => void;
  buyPlayer: (playerId: string, quantity: number) => TradeExecutionResult;
  sellPlayer: (playerId: string, quantity: number) => TradeExecutionResult;
  addAdminCash: (amount?: number) => { added: number; nextCash: number };
  triggerForceGoalEvent: (targetPlayerId?: string) => ForceGoalResult | null;
  resetAll: () => void;
}

// Round any price or point value to the nearest 10 integer unit
export const roundToTen = (val: number): number => Math.round(val / 10) * 10;

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
    "user" | "accounts" | "cash" | "realizedPnL" | "holdings" | "transactions"
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
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  return nextAccounts;
}

// Clamp price strictly within [basePrice * 0.7, basePrice * 1.3] and round to 10
export const clampToPriceLimit = (price: number, basePrice: number): number => {
  const floorPrice = roundToTen(basePrice * 0.7);
  const capPrice = roundToTen(basePrice * 1.3);
  const rounded = roundToTen(price);
  return Math.max(floorPrice, Math.min(capPrice, rounded));
};

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

// Normalize initial players using getTierConfig(basePrice) as Single Source of Truth
const NORMALIZED_INITIAL_PLAYERS: Player[] = INITIAL_PLAYERS.map((p) => {
  const basePrice = roundToTen(p.basePrice ?? p.initialPrice);
  const tierCfg = getTierConfig(basePrice);
  const currentPrice = clampToPriceLimit(p.currentPrice, basePrice);
  const previousPrice = clampToPriceLimit(p.previousPrice, basePrice);

  return {
    ...p,
    tier: p.tier ?? tierCfg.tier,
    totalShares: p.totalShares ?? tierCfg.totalShares,
    marketSupply: p.marketSupply ?? tierCfg.marketSupply,
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

// Overlay persisted playerPrices onto base players list
function applyPersistedPrices(
  basePlayers: Player[],
  playerPrices: Record<string, PersistedPlayerPrice>
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
    const currentPrice = clampToPriceLimit(saved.currentPrice, basePrice);
    const previousPrice = clampToPriceLimit(saved.previousPrice, basePrice);
    const priceHistory =
      Array.isArray(saved.priceHistory) && saved.priceHistory.length > 0
        ? saved.priceHistory.map((pt) => ({
            timeLabel: pt.timeLabel,
            price: clampToPriceLimit(pt.price, basePrice),
          }))
        : player.priceHistory;

    return {
      ...player,
      basePrice,
      initialPrice: basePrice,
      currentPrice,
      previousPrice,
      priceHistory,
    };
  });
}

export const useTradeStore = create<TradeStoreState>()(
  persist(
    (set, get) => ({
      user: null,
      accounts: {},
      cash: INITIAL_CASH,
      realizedPnL: 0,
      matches: INITIAL_MATCHES,
      players: NORMALIZED_INITIAL_PLAYERS,
      playerPrices: {},
      holdings: {},
      transactions: [],
      selectedDate: "TODAY",
      activeTab: "MATCHES",
      expandedMatchIds: ["m-tot-ars", "m-mci-liv", "m-kor-jpn"],

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

            const adminAccount: StoredUserAccount = {
              id: "Admin",
              name: "총괄관리자",
              role: "admin",
              passwordHash: ADMIN_DEFAULT_HASH,
              cash: adminCash,
              realizedPnL: adminRealizedPnL,
              holdings: adminHoldings,
              transactions: adminTransactions,
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

        set({
          accounts: nextAccounts,
          cash: restoredCash,
          realizedPnL: restoredRealizedPnL,
          holdings: restoredHoldings,
          transactions: restoredTransactions,
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
          // Existing player: preserve currentPrice, priceHistory, marketSupply; only update team/nationalTeam metadata if changed
          const existing = players[existingIdx];
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

        const currentPrice = clampToPriceLimit(
          savedPrice?.currentPrice ?? newPlayer.currentPrice,
          base
        );
        const previousPrice = clampToPriceLimit(
          savedPrice?.previousPrice ?? newPlayer.previousPrice,
          base
        );
        const priceHistory =
          savedPrice?.priceHistory && savedPrice.priceHistory.length > 0
            ? savedPrice.priceHistory.map((pt) => ({
                timeLabel: pt.timeLabel,
                price: clampToPriceLimit(pt.price, base),
              }))
            : newPlayer.priceHistory;

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
          initialPrice: base,
          currentPrice,
          previousPrice,
          priceHistory,
        };

        set({
          players: [...players, normalized],
          playerPrices: {
            ...playerPrices,
            [normalized.id]: {
              currentPrice: normalized.currentPrice,
              previousPrice: normalized.previousPrice,
              priceHistory: normalized.priceHistory,
            },
          },
        });
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

              const currentPrice = clampToPriceLimit(
                savedPrice?.currentPrice ?? basePrice,
                basePrice
              );
              const previousPrice = clampToPriceLimit(
                savedPrice?.previousPrice ?? basePrice,
                basePrice
              );
              const priceHistory =
                savedPrice?.priceHistory && savedPrice.priceHistory.length > 0
                  ? savedPrice.priceHistory.map((pt) => ({
                      timeLabel: pt.timeLabel,
                      price: clampToPriceLimit(pt.price, basePrice),
                    }))
                  : [
                      { timeLabel: "15'", price: basePrice },
                      { timeLabel: "30'", price: basePrice },
                      { timeLabel: "45'", price: previousPrice },
                      { timeLabel: "60'", price: previousPrice },
                      { timeLabel: "현재", price: currentPrice },
                    ];

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
                initialPrice: basePrice,
                currentPrice,
                previousPrice,
                priceHistory,
                lastEvent: {
                  text:
                    tierCfg.tier === "C"
                      ? "⚡ 원더키드 신규 상장 · 실시간 라인업 연동"
                      : "📋 실시간 라인업 자동 상장 종목",
                  sentiment: "positive",
                  minute: match.minute ?? 0,
                },
                stats: {
                  rating: 7.3,
                  goals: 0,
                  assists: 0,
                  shotsOnTarget: 1,
                  keyPasses: 1,
                },
              };

              nextPlayers.push(newListedPlayer);
              nextPlayerPrices[newId] = {
                currentPrice,
                previousPrice,
                priceHistory,
              };
              playersChanged = true;
            });
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
            (!prev.homeTeam.lineup && inc.homeTeam.lineup) ||
            (!prev.awayTeam.lineup && inc.awayTeam.lineup)
          ) {
            existingMatchMap.set(inc.id, {
              ...inc,
              minute: prev.minute ?? inc.minute,
              homeTeam: {
                ...inc.homeTeam,
                score: prev.homeTeam.score ?? inc.homeTeam.score,
              },
              awayTeam: {
                ...inc.awayTeam,
                score: prev.awayTeam.score ?? inc.awayTeam.score,
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
          const nextMin = (m.minute ?? 45) >= 89 ? 46 : (m.minute ?? 45) + 1;
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

          // Guard: Only fluctuate prices for LIVE matches (FT and UPCOMING stay fixed)
          if (!isLive) {
            return {
              ...player,
              basePrice,
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

          // Mean of natural fluctuation is strictly 0% (Math.random() * 0.05 - 0.025)
          // Both special events and natural ticks scale by tier volatilityMultiplier (S: 1.2x ~ C: 2.2x)
          const baseRate = isSpecialGoalOrAssist
            ? chosen.minRate +
              Math.random() * (chosen.maxRate - chosen.minRate)
            : Math.random() * 0.05 - 0.025;
          const rawRate = baseRate * tierCfg.volatilityMultiplier;

          let nextPrice = Math.round(safeCurrentPrice * (1 + rawRate));
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

          const nextHistory = [
            ...player.priceHistory.slice(-9),
            { timeLabel, price: nextPrice },
          ];

          nextPlayerPrices[player.id] = {
            currentPrice: nextPrice,
            previousPrice: safeCurrentPrice,
            priceHistory: nextHistory,
          };

          return {
            ...player,
            basePrice,
            initialPrice: basePrice,
            previousPrice: safeCurrentPrice,
            currentPrice: nextPrice,
            priceHistory: nextHistory,
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

        // Dynamic remaining supply calculation: marketSupply - current holdings
        const availableShares = Math.max(
          0,
          player.marketSupply - (holdings[player.id]?.quantity ?? 0)
        );
        if (availableShares <= 0 || quantity > availableShares) {
          return {
            success: false,
            message: `시장에 남은 수량이 부족합니다 (잔여: ${availableShares.toLocaleString()}주)`,
          };
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
        const { players, playerPrices, holdings, matches } = get();
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
            return p.currentPrice < roundToTen(base * 1.3);
          });
          const pickFrom = nonCapped.length > 0 ? nonCapped : pool;
          target = pickFrom[Math.floor(Math.random() * pickFrom.length)];
        }

        if (!target) return null;

        const basePrice = roundToTen(
          target.basePrice ?? target.initialPrice ?? 10000
        );
        const tierCfg = getTierConfig(basePrice);
        const capPrice = roundToTen(basePrice * 1.3);
        const prevPrice = clampToPriceLimit(target.currentPrice, basePrice);

        // Apply Wonderkid volatilityMultiplier (S: 1.2x ~ C: 2.2x) to forced goal event
        const baseGoalRate = 0.065 + Math.random() * 0.02;
        const spikeMultiplier = 1 + baseGoalRate * tierCfg.volatilityMultiplier;
        let nextPrice = clampToPriceLimit(
          Math.round(prevPrice * spikeMultiplier),
          basePrice
        );
        if (nextPrice <= prevPrice && prevPrice < capPrice) {
          nextPrice = clampToPriceLimit(prevPrice + 300, basePrice);
        }
        const capped = nextPrice >= capPrice && prevPrice >= capPrice;

        const match =
          matches.find(
            (m) =>
              (m.status === "LIVE" || m.rawStatus === "IN_PLAY") &&
              doesPlayerBelongToMatch(target!, m)
          ) ?? matches.find((m) => doesPlayerBelongToMatch(target!, m));
        const currentMinute = match?.minute ?? 77;
        const timeLabel = `${currentMinute}'`;

        const nextHistory = [
          ...target.priceHistory.slice(-9),
          { timeLabel, price: nextPrice },
        ];

        const updatedPlayer: Player = {
          ...target,
          basePrice,
          initialPrice: basePrice,
          previousPrice: prevPrice,
          currentPrice: nextPrice,
          priceHistory: nextHistory,
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

        const nextPlayerPrices: Record<string, PersistedPlayerPrice> = {
          ...playerPrices,
          [updatedPlayer.id]: {
            currentPrice: nextPrice,
            previousPrice: prevPrice,
            priceHistory: nextHistory,
          },
        };

        const nextMatches = matches.map((m) => {
          if (!doesPlayerBelongToMatch(updatedPlayer, m)) return m;
          const isHome = doesPlayerBelongToTeam(updatedPlayer, m.homeTeam);
          const isAway = doesPlayerBelongToTeam(updatedPlayer, m.awayTeam);
          if (!isHome && !isAway) return m;

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

        set({
          players: nextPlayers,
          playerPrices: nextPlayerPrices,
          matches: nextMatches,
        });

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
        const state = get();
        const { user } = state;
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("pitch-trade-storage-v1");
          window.localStorage.removeItem("fotmob-pitchtrade-storage-v2");
        }
        const nextAccounts = syncActiveUserToAccounts({
          ...state,
          cash: INITIAL_CASH,
          realizedPnL: 0,
          holdings: {},
          transactions: [],
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
          selectedDate: "TODAY",
          expandedMatchIds: ["m-tot-ars", "m-mci-liv", "m-kor-jpn"],
        });
      },
    }),
    {
      name: "fotmob-pitchtrade-storage-v3",
      storage: createJSONStorage(() => localStorage),
      // Persist only user session, account registry, asset data, and lightweight playerPrices map (never master matches/players)
      partialize: (state) => ({
        cash: state.cash,
        holdings: state.holdings,
        transactions: state.transactions,
        realizedPnL: state.realizedPnL,
        user: state.user,
        accounts: state.accounts,
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

        return {
          ...currentState,
          ...persisted,
          accounts,
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
