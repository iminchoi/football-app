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

export type BottomTab = "MATCHES" | "PORTFOLIO" | "MARKET";

export type TradeType = "BUY" | "SELL";

export type UserRole = "user" | "admin";

export interface UserSession {
  id: string;
  name: string;
  role: UserRole;
  cash: number;
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
  createdAt: string;
}

export interface PricePoint {
  timeLabel: string;
  price: number;
}

export interface PersistedPlayerPrice {
  currentPrice: number;
  previousPrice: number;
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
  backNumber: number;
  tier: PlayerTier;
  totalShares: number; // 총 발행 주식 수 (S티어 500, A티어 1000, B티어 2500, C티어 5000)
  marketSupply: number; // 초기 시장 잔여 한도 (정적 기준값)
  basePrice?: number; // Permanent initial reference price for ±30% cap/floor
  initialPrice: number;
  currentPrice: number;
  previousPrice: number;
  priceHistory: PricePoint[];
  lastEvent: {
    text: string;
    sentiment: EventSentiment;
    minute: number;
  };
  stats: {
    rating: number;
    goals: number;
    assists: number;
    shotsOnTarget: number;
    keyPasses: number;
  };
}

export interface ApiLineupPlayer {
  id?: number | string;
  externalId?: string;
  name: string;
  position?: Position | string;
  shirtNumber?: number;
  team?: string;
  nationalTeam?: string;
  age?: number;
}

export interface TeamInfo {
  id: string;
  name: string;
  shortName: string;
  color: string;
  crest?: string;
  score?: number;
  formation?: string;
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
  highlightText?: string;
}

export interface Holding {
  playerId: string;
  quantity: number;
  avgBuyPrice: number;
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
