export type DetailedPosition =
  | "GK"
  | "LB"
  | "CB"
  | "RB"
  | "DM"
  | "CM"
  | "LAM"
  | "CAM"
  | "RAM"
  | "LW"
  | "ST"
  | "RW";

export type PositionLine = "GK" | "DF" | "MF" | "FW";

export type Position = DetailedPosition;

export function getPositionLine(pos?: DetailedPosition | string): PositionLine {
  if (!pos) return "MF";
  const upper = pos.trim().toUpperCase();
  if (upper === "GK" || upper.includes("KEEP")) return "GK";
  if (
    upper === "LB" ||
    upper === "CB" ||
    upper === "RB" ||
    upper === "WB" ||
    upper === "LWB" ||
    upper === "RWB" ||
    upper === "DF" ||
    upper === "LCB" ||
    upper === "RCB" ||
    upper.includes("DEF") ||
    upper.includes("BACK")
  ) {
    return "DF";
  }
  if (
    upper === "LW" ||
    upper === "ST" ||
    upper === "RW" ||
    upper === "FW" ||
    upper === "CF" ||
    upper.includes("FORW") ||
    upper.includes("OFFEN") ||
    upper.includes("STRIK") ||
    upper.includes("WING")
  ) {
    return "FW";
  }
  return "MF";
}

export function normalizeDetailedPosition(rawPos?: string): DetailedPosition {
  if (!rawPos) return "CM";
  const upper = rawPos.trim().toUpperCase();

  // Exact DetailedPosition match
  if (
    upper === "GK" ||
    upper === "LB" ||
    upper === "CB" ||
    upper === "RB" ||
    upper === "DM" ||
    upper === "CM" ||
    upper === "LAM" ||
    upper === "CAM" ||
    upper === "RAM" ||
    upper === "LW" ||
    upper === "ST" ||
    upper === "RW"
  ) {
    return upper as DetailedPosition;
  }

  // Common Football-Data.org & soccer role strings
  if (upper.includes("GOALKEEPER") || upper.includes("KEEPER")) return "GK";
  if (upper === "LWB" || upper.includes("LEFT-BACK") || upper.includes("LEFT BACK")) return "LB";
  if (upper === "RWB" || upper.includes("RIGHT-BACK") || upper.includes("RIGHT BACK")) return "RB";
  if (
    upper === "DF" ||
    upper === "LCB" ||
    upper === "RCB" ||
    upper.includes("CENTRE-BACK") ||
    upper.includes("CENTER-BACK") ||
    upper.includes("DEFENCE") ||
    upper.includes("DEFENDER")
  ) {
    return "CB";
  }

  if (upper === "CDM" || upper.includes("DEFENSIVE MIDFIELD")) return "DM";
  if (upper === "LM" || upper.includes("LEFT MIDFIELD")) return "LAM";
  if (upper === "RM" || upper.includes("RIGHT MIDFIELD")) return "RAM";
  if (upper === "AM" || upper.includes("ATTACKING MIDFIELD")) return "CAM";
  if (upper === "MF" || upper.includes("MIDFIELD")) return "CM";

  if (upper === "LF" || upper.includes("LEFT WINGER")) return "LW";
  if (upper === "RF" || upper.includes("RIGHT WINGER")) return "RW";
  if (
    upper === "FW" ||
    upper === "CF" ||
    upper.includes("FORWARD") ||
    upper.includes("OFFENCE") ||
    upper.includes("STRIKER") ||
    upper.includes("ATTACK")
  ) {
    return "ST";
  }

  return "CM";
}

export type PlayerTier = "S" | "A" | "B" | "C";

export type EventSentiment = "positive" | "negative" | "neutral";

export type MatchStatus = "LIVE" | "UPCOMING" | "FT";

export type DateKey = "YESTERDAY" | "TODAY" | "TOMORROW" | "WEEKEND";

export type BottomTab = "MATCHES" | "PORTFOLIO" | "MARKET" | "SQUAD";

export type TradeType = "BUY" | "SELL";

export type UserRole = "user" | "admin";

export interface UserSession {
  id: string;
  name: string;
  role: UserRole;
  cash: number;
  email?: string;
  authProvider?: "supabase" | "local";
}

export interface StoredUserAccount {
  id: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  cash: number;
  realizedPnL: number;
  holdings: Record<string, Holding>;
  transactions: PointTransaction[];
  watchlist?: string[];
  createdAt: string;
}

/**
 * Canonical match event kinds. Each position line may only receive the kinds listed in
 * `POSITION_EVENT_WHITELIST` (src/lib/priceEngine.ts); `SAVE` is goalkeeper-only.
 */
export type MatchEventType =
  | "GOAL"
  | "ASSIST"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "SAVE" // GK: save, penalty save, decisive aerial claim
  | "CONCEDED" // GK: goal conceded
  | "DEFENSIVE_ACTION" // DF: 1v1 stop, decisive tackle, goal-line clearance
  | "KEY_PLAY" // MF/FW: killer pass, shot on target
  | "BIG_CHANCE_MISS"; // FW: big chance missed

export type ChartEventType = MatchEventType | "SUB_OUT" | "SUB_IN" | "SUB";

export type EventSource = "REAL" | "SIMULATED";

export type ProviderMode =
  | "SCORE_ONLY"
  | "FIXTURE_REPLAY"
  | "SIMULATED_EVENTS"
  | "DEEP_DATA";

export interface MatchEvent {
  id: string;
  playerId: string;
  minute: number;
  type: MatchEventType;
  description: string;
  priceImpactPercent: number;
  triggeredAt?: number; // Epoch ms when major event occurred (for 30s circuit breaker)
  source?: EventSource;
  estimated?: boolean;
  metadata?: { estimated?: boolean };
}

export interface ChartEventMarker {
  type: ChartEventType;
  label: string; // 예: "⚽ 득점 (+8.5%)"
  impactPercent: number;
  source?: EventSource;
}

export interface PricePoint {
  minute: number; // X축 고정 좌표 (0 ~ 90, 후반 추가시간은 90+ 표시)
  timeLabel?: string; // 예: "0'", "45'", "67'", "90+"
  price: number;
  changePercentFromOpen?: number; // 시가(openPrice) 대비 등락률(%)
  rawReturn?: number; // 클램프 전 누적 수익률 비율 (-1..+1)
  clampedReturn?: number; // [-0.30, +0.30] 클램프 적용 수익률 비율
  event?: ChartEventMarker; // 이벤트가 발생한 분에만 존재
}

export type CandleTimeframe = "3M" | "1M" | "15M" | "1D";

export interface CandleData {
  index: number;
  minute?: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  event?: ChartEventMarker;
  matchEvent?: MatchEvent;
}

export interface PersistedPlayerPrice {
  openPrice?: number;
  closePrice?: number;
  currentPrice: number;
  previousPrice: number;
  highPrice?: number;
  lowPrice?: number;
  volume?: number;
  events?: MatchEvent[];
  priceHistory: PricePoint[];
}

export interface Player {
  id: string;
  name: string;
  englishName: string;
  nationalTeam: string; // 소속 국가대표팀 (예: '대한민국', '잉글랜드', '스페인', '노르웨이')
  matchId: string;
  teamId: string;
  teamName: string;
  teamShort: string;
  teamColor: string; // Hex color for team badge
  position: Position;
  grid?: string; // API-Football "row:col" formation coordinate (row 1=GK, col 1=left -> N=right)
  backNumber: number;
  tier: PlayerTier;
  totalShares: number; // 총 발행 주식 수 (S티어 500, A티어 1000, B티어 2500, C티어 5000)
  marketSupply: number; // 초기 시장 잔여 한도 (정적 기준값)
  basePrice?: number; // Permanent initial reference price for ±15% cap/floor
  openPrice?: number; // 경기 시작(minute: 0) 시점의 시가
  closePrice?: number; // 경기 종료(FT, minute: 90) 시점의 확정 종가
  initialPrice: number;
  currentPrice: number;
  previousPrice: number;
  highPrice?: number; // 당일 최고가 (SSOT)
  lowPrice?: number; // 당일 최저가 (SSOT)
  volume?: number; // 당일 누적 거래량 (SSOT)
  events?: MatchEvent[]; // 단일 경기 이벤트 배열 (SSOT)
  priceHistory: PricePoint[];
  lastMajorEventAt?: number; // Epoch ms for 30s circuit breaker (GOAL, RED_CARD, PENALTY)
  rawReturnPercent?: number; // Unclamped cumulative return (%)
  clampedReturnPercent?: number; // [-30, +30] clamped return (%)
  isCaptain?: boolean;
  subInMinute?: number;
  subOutMinute?: number;
  yellowCards?: number;
  redCards?: number;
  lastEvent: {
    text: string;
    sentiment: EventSentiment;
    minute: number;
  };
  stats: {
    rating: number;
    goals: number;
    assists: number;
    shotsTotal?: number;
    shotsOnTarget: number;
    keyPasses: number;
    passesTotal?: number;
    passAccuracy?: number;
    minutesPlayed?: number;
    tackles?: number;
    interceptions?: number;
    blocks?: number;
    dribblesAttempted?: number;
    dribblesSuccess?: number;
    duelsTotal?: number;
    duelsWon?: number;
    saves?: number;
    yellowCards?: number;
    redCards?: number;
  };
}

export interface ApiLineupPlayer {
  id?: number | string;
  externalId?: string;
  name: string;
  position?: Position | string;
  grid?: string; // API-Football "row:col" formation coordinate (row 1=GK, col 1=left -> N=right)
  shirtNumber?: number;
  team?: string;
  nationalTeam?: string;
  age?: number;
  isCaptain?: boolean;
  subInMinute?: number;
  subOutMinute?: number;
  yellowCards?: number;
  redCards?: number;
  rating?: number;
  minutesPlayed?: number;
  goals?: number;
  assists?: number;
  shotsTotal?: number;
  shotsOnTarget?: number;
  passesTotal?: number;
  passAccuracy?: number;
  keyPasses?: number;
  tackles?: number;
  interceptions?: number;
  blocks?: number;
  dribblesAttempted?: number;
  dribblesSuccess?: number;
  duelsTotal?: number;
  duelsWon?: number;
  saves?: number;
}

export interface ApiMatchEvent {
  id: string;
  minute: number;
  type: ChartEventType;
  playerId?: string;
  playerName: string;
  teamName?: string;
  playerInId?: string;
  playerInName?: string;
  playerOutId?: string;
  playerOutName?: string;
  source?: EventSource;
  estimated?: boolean;
  metadata?: { estimated?: boolean };
}

export interface TeamInfo {
  id: string;
  name: string;
  shortName: string;
  color: string;
  crest?: string;
  score?: number;
  formation?: string;
  manager?: string;
  lineup?: ApiLineupPlayer[];
  bench?: ApiLineupPlayer[];
}

export interface Match {
  id: string;
  dateKey?: DateKey;
  utcDate?: string;
  leagueId: string;
  leagueName: string;
  leagueCountry: string;
  leagueEmblem?: string;
  isInternational?: boolean;
  status: MatchStatus;
  rawStatus?: string; // Original API status e.g. 'TIMED', 'SCHEDULED', 'IN_PLAY', 'FINISHED'
  minute?: number;
  kickoffTime: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeManager?: string;
  awayManager?: string;
  highlightText?: string;
  events?: ApiMatchEvent[];
  providerMode?: ProviderMode;
  usesDummyLineup?: boolean;
}

export interface Holding {
  playerId: string;
  quantity: number;
  avgBuyPrice: number;
  matchContext?: ActiveMatchContext;
}

export interface PointTransaction {
  id: string;
  type: TradeType;
  playerId: string;
  playerName: string;
  teamShort: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  balanceAfter: number;
  realizedPnL?: number;
  timestamp: string;
}

export type SquadSaleBadgeStatus = "HOLDING" | "PARTIAL_SOLD" | "FULLY_SOLD";

export interface SquadFeedPlayerSnapshot {
  playerId: string;
  name: string;
  englishName?: string;
  teamName: string;
  teamShort: string;
  teamColor: string;
  position: Position;
  backNumber: number;
  publishedQuantity: number;
  publishedPrice: number;
  avgBuyPrice: number;
  slotIndex?: number;
  slotLabel?: string;
  currentQuantity?: number;
  saleStatus?: "HOLDING" | "PARTIAL_SOLD" | "FULL_SOLD";
}

export interface SquadFeedComment {
  id: string;
  feedId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface SquadFeedPost {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  formation: string;
  players: SquadFeedPlayerSnapshot[];
  createdAt: string;
  comments: SquadFeedComment[];
  /** Server-resolved live holdings of the author for cross-user sell badge accuracy. */
  authorHoldings?: Record<string, Holding>;
}

export interface ActiveMatchContext {
  matchId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "PRE" | "LIVE" | "FT";
  rawStatus?: string;
  kickoffTime: string;
  minute?: number;
}

export function buildActiveMatchContext(match: Match): ActiveMatchContext {
  const rawUpper = (match.rawStatus || "").trim().toUpperCase();
  const isFinished =
    match.status === "FT" || rawUpper === "FINISHED" || rawUpper === "AWARDED";
  const isUpcoming =
    !isFinished &&
    (match.status === "UPCOMING" ||
      rawUpper === "TIMED" ||
      rawUpper === "SCHEDULED" ||
      rawUpper === "POSTPONED");
  const isHalfTime =
    !isFinished &&
    !isUpcoming &&
    (rawUpper === "PAUSED" || rawUpper === "HT" || rawUpper === "HALF_TIME");
  const status: "PRE" | "LIVE" | "FT" = isFinished
    ? "FT"
    : isUpcoming
    ? "PRE"
    : "LIVE";

  return {
    matchId: match.id,
    competition: match.leagueName,
    homeTeam: match.homeTeam.shortName || match.homeTeam.name,
    awayTeam: match.awayTeam.shortName || match.awayTeam.name,
    homeScore: match.homeTeam.score ?? 0,
    awayScore: match.awayTeam.score ?? 0,
    status,
    ...(match.rawStatus ? { rawStatus: match.rawStatus } : {}),
    kickoffTime: isFinished ? "종료" : match.kickoffTime,
    minute:
      status === "FT"
        ? 90
        : status === "PRE"
        ? 0
        : isHalfTime
        ? 45
        : match.minute,
  };
}
