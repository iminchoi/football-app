import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MARKET_PAGE_SIZE,
  buildMarketRankingList,
  isMajorLeaguePlayer,
  paginateMarketPlayers,
  selectHotSpotlightPlayers,
} from "../src/lib/marketListing.ts";
import { resolvePlayerQuote, type PlayerQuote } from "../src/lib/playerQuote.ts";
import type { Match, Player } from "../src/types/index.ts";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "m-epl-1",
    leagueId: "pl-2021",
    leagueName: "프리미어리그",
    leagueCountry: "잉글랜드",
    status: "LIVE",
    minute: 65,
    kickoffTime: "22:00",
    homeTeam: { id: "ars", name: "Arsenal", shortName: "ARS", color: "#EF0107", score: 2 },
    awayTeam: { id: "liv", name: "Liverpool", shortName: "LIV", color: "#C8102E", score: 1 },
    ...overrides,
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  const base = overrides.basePrice ?? 10_000;
  const current = overrides.currentPrice ?? base;
  return {
    id: "p-default",
    name: "Default Player",
    englishName: "Default Player",
    nationalTeam: "잉글랜드",
    matchId: "m-epl-1",
    teamId: "ars",
    teamName: "Arsenal",
    teamShort: "ARS",
    teamColor: "#EF0107",
    position: "CM",
    backNumber: 8,
    tier: "A",
    totalShares: 1000,
    marketSupply: 400,
    basePrice: base,
    openPrice: base,
    initialPrice: base,
    currentPrice: current,
    previousPrice: base,
    volume: 100,
    events: [],
    priceHistory: [{ minute: 0, timeLabel: "0'", price: base }],
    lastEvent: { text: "", sentiment: "neutral", minute: 60 },
    stats: { rating: 7.2, goals: 0, assists: 0, shotsOnTarget: 0, keyPasses: 0 },
    ...overrides,
  };
}

describe("Market Listing Pagination, Major-League Filtering & Dynamic Hot Spotlight", () => {
  it("excludes minor-league clutter (e.g. Viking, Sabah FA) from default listing while keeping them searchable and paginating 30 per page", () => {
    const eplMatch = makeMatch({ id: "m-epl-1", leagueId: "pl-2021" });
    const vikingMatch = makeMatch({
      id: "af-901",
      leagueId: "af-league-103",
      leagueName: "Eliteserien",
      leagueCountry: "Norway",
      homeTeam: { id: "vik", name: "Viking", shortName: "VIK", color: "#1d4ed8" },
      awayTeam: { id: "mol", name: "Molde", shortName: "MOL", color: "#2563eb" },
    });
    const sabahMatch = makeMatch({
      id: "af-902",
      leagueId: "af-league-278",
      leagueName: "Super League",
      leagueCountry: "Malaysia",
      homeTeam: { id: "sab", name: "Sabah FA", shortName: "SAB", color: "#dc2626" },
      awayTeam: { id: "jdt", name: "Johor DT", shortName: "JDT", color: "#1e40af" },
    });
    const matches = [eplMatch, vikingMatch, sabahMatch];

    // 75 major league players + 15 minor league players (Viking / Sabah FA)
    const majorPlayers = Array.from({ length: 75 }, (_, i) =>
      makePlayer({
        id: `af-p-epl-${i}`,
        name: `Premier Star ${i}`,
        englishName: `Premier Star ${i}`,
        matchId: "m-epl-1",
        teamName: "Arsenal",
        teamShort: "ARS",
        basePrice: 10_000,
        currentPrice: 10_000 + (i % 10) * 100,
        volume: 100 + i * 5,
      })
    );
    const minorPlayers = [
      makePlayer({
        id: "af-p-vik-1",
        name: "Z. Tripic",
        englishName: "Z. Tripic",
        matchId: "af-901",
        teamId: "vik",
        teamName: "Viking",
        teamShort: "VIK",
        basePrice: 9_000,
        currentPrice: 9_900,
      }),
      makePlayer({
        id: "af-p-sab-1",
        name: "D. Lok",
        englishName: "D. Lok",
        matchId: "af-902",
        teamId: "sab",
        teamName: "Sabah FA",
        teamShort: "SAB",
        basePrice: 8_500,
        currentPrice: 9_350,
      }),
    ];

    const allPlayers = [...majorPlayers, ...minorPlayers];
    const quotes = new Map<string, PlayerQuote>(
      allPlayers.map((p) => [p.id, resolvePlayerQuote(p, "LIVE")])
    );

    assert.equal(isMajorLeaguePlayer(majorPlayers[0], matches), true);
    assert.equal(isMajorLeaguePlayer(minorPlayers[0], matches), false);
    assert.equal(isMajorLeaguePlayer(minorPlayers[1], matches), false);

    // 1. Default listing excludes minor-league teams (Viking, Sabah FA) and paginates to 30
    const defaultRes = buildMarketRankingList({
      players: allPlayers,
      matches,
      quoteByPlayerId: quotes,
      searchQuery: "",
      posFilter: "ALL",
      leagueFilter: "ALL",
      sortMode: "GAINERS",
      onlySurge5: false,
      onlyWonderkid: false,
      onlyWatchlist: false,
      watchlist: [],
    });

    assert.equal(defaultRes.items.length, 75);
    assert.equal(defaultRes.minorExcludedCount, 2);
    assert.equal(defaultRes.items.some((p) => p.teamName === "Viking"), false);
    assert.equal(defaultRes.items.some((p) => p.teamName === "Sabah FA"), false);

    const page1 = paginateMarketPlayers(defaultRes.items, DEFAULT_MARKET_PAGE_SIZE);
    assert.equal(page1.visibleItems.length, 30);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.remainingCount, 45);

    const page2 = paginateMarketPlayers(defaultRes.items, page1.nextVisibleCount);
    assert.equal(page2.visibleItems.length, 60);
    assert.equal(page2.remainingCount, 15);

    const page3 = paginateMarketPlayers(defaultRes.items, page2.nextVisibleCount);
    assert.equal(page3.visibleItems.length, 75);
    assert.equal(page3.hasMore, false);

    // 2. Searching finds minor-league players (Viking, Sabah FA) across the entire universe
    const searchViking = buildMarketRankingList({
      players: allPlayers,
      matches,
      quoteByPlayerId: quotes,
      searchQuery: "Viking",
      posFilter: "ALL",
      leagueFilter: "ALL",
      sortMode: "GAINERS",
      onlySurge5: false,
      onlyWonderkid: false,
      onlyWatchlist: false,
      watchlist: [],
    });
    assert.equal(searchViking.items.length, 1);
    assert.equal(searchViking.items[0].id, "af-p-vik-1");

    const searchSabah = buildMarketRankingList({
      players: allPlayers,
      matches,
      quoteByPlayerId: quotes,
      searchQuery: "Sabah",
      posFilter: "ALL",
      leagueFilter: "ALL",
      sortMode: "GAINERS",
      onlySurge5: false,
      onlyWonderkid: false,
      onlyWatchlist: false,
      watchlist: [],
    });
    assert.equal(searchSabah.items.length, 1);
    assert.equal(searchSabah.items[0].id, "af-p-sab-1");
  });

  it("dynamically selects 6 distinct Hot Spotlight players with quantitative evidence badges (no hardcoded IDs)", () => {
    const eplMatch = makeMatch({ id: "m-epl-1", leagueId: "pl-2021" });
    const players: Player[] = [
      makePlayer({
        id: "af-p-gainer",
        name: "A. Isak",
        englishName: "A. Isak",
        basePrice: 12_000,
        currentPrice: 13_440, // +12.0% -> TOP_GAINER
        volume: 600,
        stats: { rating: 7.8, goals: 1, assists: 0, shotsOnTarget: 2, keyPasses: 1 },
      }),
      makePlayer({
        id: "af-p-volume",
        name: "D. Rice",
        englishName: "D. Rice",
        basePrice: 11_000,
        currentPrice: 11_330, // +3.0%
        volume: 4_850, // -> TOP_VOLUME
        stats: { rating: 7.9, goals: 0, assists: 0, shotsOnTarget: 1, keyPasses: 2 },
      }),
      makePlayer({
        id: "af-p-rating",
        name: "M. Odegaard",
        englishName: "M. Odegaard",
        basePrice: 13_000,
        currentPrice: 13_520, // +4.0%
        volume: 900,
        stats: { rating: 9.3, goals: 0, assists: 1, shotsOnTarget: 2, keyPasses: 5 }, // -> TOP_RATING
      }),
      makePlayer({
        id: "af-p-attack",
        name: "B. Saka",
        englishName: "B. Saka",
        basePrice: 14_000,
        currentPrice: 14_980, // +7.0%
        volume: 1_200,
        stats: { rating: 8.6, goals: 2, assists: 1, shotsOnTarget: 4, keyPasses: 3 }, // -> TOP_ATTACK
      }),
      makePlayer({
        id: "af-p-bluechip",
        name: "E. Haaland",
        englishName: "E. Haaland",
        basePrice: 20_000,
        currentPrice: 20_400, // +2.0%, highest price -> TOP_BLUECHIP
        volume: 1_100,
        stats: { rating: 7.5, goals: 0, assists: 0, shotsOnTarget: 2, keyPasses: 0 },
      }),
      makePlayer({
        id: "af-p-momentum",
        name: "C. Palmer",
        englishName: "C. Palmer",
        basePrice: 13_500,
        currentPrice: 14_710, // +8.96% -> MOMENTUM runner-up
        volume: 1_050,
        stats: { rating: 8.1, goals: 1, assists: 0, shotsOnTarget: 3, keyPasses: 2 },
      }),
      makePlayer({
        id: "af-p-ordinary",
        name: "Bench Mid",
        englishName: "Bench Mid",
        basePrice: 9_000,
        currentPrice: 9_000,
        volume: 50,
        stats: { rating: 6.5, goals: 0, assists: 0, shotsOnTarget: 0, keyPasses: 0 },
      }),
    ];

    const quotes = new Map<string, PlayerQuote>(
      players.map((p) => [p.id, resolvePlayerQuote(p, "LIVE")])
    );

    const spotlight = selectHotSpotlightPlayers({
      players,
      matches: [eplMatch],
      quoteByPlayerId: quotes,
      count: 6,
    });

    assert.equal(spotlight.length, 6);
    assert.equal(new Set(spotlight.map((s) => s.player.id)).size, 6);

    assert.equal(spotlight[0].player.id, "af-p-gainer");
    assert.match(spotlight[0].reasonLabel, /수익률 1위 \+12\.0%/);

    assert.equal(spotlight[1].player.id, "af-p-volume");
    assert.match(spotlight[1].reasonLabel, /거래량 1위 · 4,850/);

    assert.equal(spotlight[2].player.id, "af-p-rating");
    assert.match(spotlight[2].reasonLabel, /평점 1위 ★9\.3/);

    assert.equal(spotlight[3].player.id, "af-p-attack");
    assert.match(spotlight[3].reasonLabel, /공격P · 2골 1도움/);

    assert.equal(spotlight[4].player.id, "af-p-bluechip");
    assert.match(spotlight[4].reasonLabel, /최고가 · 20,400P/);

    assert.equal(spotlight[5].player.id, "af-p-momentum");
    assert.match(spotlight[5].reasonLabel, /급등 상위 \+9\.0%|급등 상위 \+8\.9%/);
  });
});
