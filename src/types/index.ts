export type Position = "FW" | "MF" | "DF" | "GK";

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

export interface PricePoint {
  timeLabel: string;
  price: number;
}

export interface Player {
  id: string;
  name: string;
  englishName: string;
  matchId: string;
  teamId: string;
  teamName: string;
  teamShort: string;
  teamColor: string; // Hex color for team badge
  position: Position;
  backNumber: number;
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
  name: string;
  position?: string;
  shirtNumber?: number;
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
