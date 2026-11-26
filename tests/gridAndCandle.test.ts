import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApiFootballFixture,
  type ApiFootballRawFixtureItem,
} from "../src/lib/providers/ApiFootballProvider.ts";
import {
  buildFormationRows,
  buildTeamLineupForMatch,
} from "../src/lib/lineupBuilder.ts";
import {
  deriveCandlesFromEvents,
  derivePlayerMarketData,
  roundToTen,
} from "../src/lib/priceEngine.ts";
import { WEIGHTS } from "../src/lib/weights.ts";
import type { CandleTimeframe, Match, MatchEvent } from "../src/types/index.ts";

describe("API-Football Grid Formation Layout & Candlestick OHLC Smoothing", () => {
  it("places a 4-2-3-1 API-Football lineup accurately by grid row (ST -> AM -> DM -> DF -> GK) and col (LB left -> RB right)", () => {
    const fixture: ApiFootballRawFixtureItem = {
      fixture: {
        id: 1600001,
        date: "2026-11-26T20:00:00+00:00",
        status: { short: "2H", elapsed: 67 },
      },
      league: { id: 39, name: "Premier League", country: "England" },
      teams: {
        home: { id: 40, name: "Liverpool" },
        away: { id: 42, name: "Arsenal" },
      },
      goals: { home: 2, away: 1 },
      lineups: [
        {
          team: { id: 40, name: "Liverpool" },
          coach: { id: 10, name: "Arne Slot" },
          formation: "4-2-3-1",
          // Intentionally scrambled input order to prove sorting relies on grid, not array order
          startXI: [
            { player: { id: 11, name: "M. Salah", number: 11, pos: "M", grid: "4:1" } },
            { player: { id: 1, name: "Alisson", number: 1, pos: "G", grid: "1:1" } },
            { player: { id: 30, name: "J. Frimpong", number: 30, pos: "D", grid: "2:1" } },
            { player: { id: 6, name: "M. Kerkez", number: 6, pos: "D", grid: "2:4" } },
            { player: { id: 38, name: "R. Gravenberch", number: 38, pos: "M", grid: "3:1" } },
            { player: { id: 5, name: "I. Konate", number: 5, pos: "D", grid: "2:2" } },
            { player: { id: 4, name: "V. van Dijk", number: 4, pos: "D", grid: "2:3" } },
            { player: { id: 10, name: "A. Mac Allister", number: 10, pos: "M", grid: "3:2" } },
            { player: { id: 7, name: "F. Wirtz", number: 7, pos: "M", grid: "4:2" } },
            { player: { id: 18, name: "C. Gakpo", number: 18, pos: "M", grid: "4:3" } },
            { player: { id: 22, name: "H. Ekitike", number: 22, pos: "F", grid: "5:1" } },
          ],
          substitutes: [
            { player: { id: 9, name: "D. Nunez", number: 9, pos: "F", grid: null } },
          ],
        },
        {
          team: { id: 42, name: "Arsenal" },
          coach: { id: 11, name: "Mikel Arteta" },
          formation: "4-3-3",
          startXI: [
            { player: { id: 201, name: "D. Raya", number: 22, pos: "G", grid: "1:1" } },
            { player: { id: 202, name: "J. Timber", number: 12, pos: "D", grid: "2:1" } },
            { player: { id: 203, name: "W. Saliba", number: 2, pos: "D", grid: "2:2" } },
            { player: { id: 204, name: "Gabriel", number: 6, pos: "D", grid: "2:3" } },
            { player: { id: 205, name: "R. Calafiori", number: 33, pos: "D", grid: "2:4" } },
            { player: { id: 206, name: "M. Odegaard", number: 8, pos: "M", grid: "3:1" } },
            { player: { id: 207, name: "D. Rice", number: 41, pos: "M", grid: "3:2" } },
            { player: { id: 208, name: "M. Merino", number: 23, pos: "M", grid: "3:3" } },
            { player: { id: 209, name: "B. Saka", number: 7, pos: "F", grid: "4:1" } },
            { player: { id: 210, name: "K. Havertz", number: 29, pos: "F", grid: "4:2" } },
            { player: { id: 211, name: "G. Martinelli", number: 11, pos: "F", grid: "4:3" } },
          ],
          substitutes: [],
        },
      ],
      events: [],
    };

    const match = normalizeApiFootballFixture(fixture);

    // 1. Verify ApiLineupPlayer preserves grid and maps col=1 -> RB / col=4 -> LB cleanly
    const frimpongApi = match.homeTeam.lineup?.find((p) => p.name === "J. Frimpong");
    const kerkezApi = match.homeTeam.lineup?.find((p) => p.name === "M. Kerkez");
    const salahApi = match.homeTeam.lineup?.find((p) => p.name === "M. Salah");
    const gakpoApi = match.homeTeam.lineup?.find((p) => p.name === "C. Gakpo");
    const wirtzApi = match.homeTeam.lineup?.find((p) => p.name === "F. Wirtz");

    assert.equal(frimpongApi?.grid, "2:1");
    assert.equal(frimpongApi?.position, "RB");
    assert.equal(kerkezApi?.grid, "2:4");
    assert.equal(kerkezApi?.position, "LB");
    assert.equal(salahApi?.grid, "4:1");
    assert.equal(salahApi?.position, "RAM");
    assert.equal(wirtzApi?.grid, "4:2");
    assert.equal(wirtzApi?.position, "CAM");
    assert.equal(gakpoApi?.grid, "4:3");
    assert.equal(gakpoApi?.position, "LAM");

    // 2. Verify buildTeamLineupForMatch + buildFormationRows produces exact 5 rows (1-3-2-4-1)
    const homeBuilt = buildTeamLineupForMatch(match, "HOME", []);
    assert.equal(homeBuilt.formation, "4-2-3-1");
    assert.equal(homeBuilt.startingLineup.length, 11);

    const homeRows = buildFormationRows(
      homeBuilt.startingLineup,
      homeBuilt.formation
    );
    assert.equal(homeRows.length, 5);
    assert.deepEqual(
      homeRows.map((r) => r.length),
      [1, 3, 2, 4, 1]
    );

    // Row 0: Striker (row 5)
    assert.deepEqual(
      homeRows[0].map((p) => p.englishName),
      ["H. Ekitike"]
    );
    // Row 1: Attacking Midfield 2선 (row 4, Left -> Right: 4:3, 4:2, 4:1)
    assert.deepEqual(
      homeRows[1].map((p) => p.englishName),
      ["C. Gakpo", "F. Wirtz", "M. Salah"]
    );
    // Row 2: Double Pivot 3선 (row 3, Left -> Right: 3:2, 3:1)
    assert.deepEqual(
      homeRows[2].map((p) => p.englishName),
      ["A. Mac Allister", "R. Gravenberch"]
    );
    // Row 3: Back-4 Defense (row 2, Left -> Right: Kerkez LB 2:4 -> Van Dijk -> Konate -> Frimpong RB 2:1)
    assert.deepEqual(
      homeRows[3].map((p) => p.englishName),
      ["M. Kerkez", "V. van Dijk", "I. Konate", "J. Frimpong"]
    );
    assert.equal(homeRows[3][0].position, "LB");
    assert.equal(homeRows[3][3].position, "RB");
    // Row 4: Goalkeeper (row 1)
    assert.deepEqual(
      homeRows[4].map((p) => p.id),
      ["af-p-1"]
    );
    assert.equal(homeRows[4][0].position, "GK");
    assert.equal(homeRows[4][0].grid, "1:1");

    // 3. Verify 4-3-3 away lineup also orders Left -> Right accurately (LW -> ST -> RW, LB -> CB -> CB -> RB)
    const awayBuilt = buildTeamLineupForMatch(match, "AWAY", []);
    const awayRows = buildFormationRows(
      awayBuilt.startingLineup,
      awayBuilt.formation
    );
    assert.deepEqual(
      awayRows.map((r) => r.length),
      [3, 3, 4, 1]
    );
    assert.deepEqual(
      awayRows[0].map((p) => p.grid),
      ["4:3", "4:2", "4:1"]
    );
    assert.deepEqual(
      awayRows[2].map((p) => p.grid),
      ["2:4", "2:3", "2:2", "2:1"]
    );
  });

  it("falls back cleanly to position-based formation rows when grid coordinates are absent", () => {
    const noGridMatch: Match = {
      id: "m-nogrid-fallback",
      leagueId: "epl",
      leagueName: "프리미어리그",
      leagueCountry: "잉글랜드",
      status: "LIVE",
      minute: 40,
      kickoffTime: "22:00",
      homeTeam: {
        id: "hom",
        name: "Home FC",
        shortName: "HOM",
        color: "#111827",
        formation: "4-3-3",
        lineup: [
          { id: "ng-1", name: "Keeper", position: "GK", shirtNumber: 1 },
          { id: "ng-2", name: "LeftBack", position: "LB", shirtNumber: 3 },
          { id: "ng-3", name: "CenterBack1", position: "CB", shirtNumber: 4 },
          { id: "ng-4", name: "CenterBack2", position: "CB", shirtNumber: 5 },
          { id: "ng-5", name: "RightBack", position: "RB", shirtNumber: 2 },
          { id: "ng-6", name: "Mid1", position: "DM", shirtNumber: 6 },
          { id: "ng-7", name: "Mid2", position: "CM", shirtNumber: 8 },
          { id: "ng-8", name: "Mid3", position: "CAM", shirtNumber: 10 },
          { id: "ng-9", name: "LeftWing", position: "LW", shirtNumber: 11 },
          { id: "ng-10", name: "Striker", position: "ST", shirtNumber: 9 },
          { id: "ng-11", name: "RightWing", position: "RW", shirtNumber: 7 },
        ],
        bench: [],
      },
      awayTeam: {
        id: "awy",
        name: "Away FC",
        shortName: "AWY",
        color: "#dc2626",
      },
    };

    const built = buildTeamLineupForMatch(noGridMatch, "HOME", []);
    const rows = buildFormationRows(built.startingLineup, built.formation);
    assert.deepEqual(
      rows.map((r) => r.length),
      [3, 3, 4, 1]
    );
    assert.equal(rows[3][0].position, "GK");
    assert.equal(rows[2][0].position, "LB");
    assert.equal(rows[2][3].position, "RB");
  });

  it("keeps candlestick wicks proportionate, softens single-event vertical cliffs, and preserves exact final close & event markers", () => {
    const basePrice = 10_000;
    const floorPrice = roundToTen(basePrice * (1 - WEIGHTS.CAP_LIMIT));
    const capPrice = roundToTen(basePrice * (1 + WEIGHTS.CAP_LIMIT));
    const singleGoalEvent: MatchEvent[] = [
      {
        id: "ev-single-goal-62",
        playerId: "p-candle-test",
        minute: 62,
        type: "GOAL",
        description: "선제골",
        priceImpactPercent: 8.5,
        source: "REAL",
      },
    ];

    const derived = derivePlayerMarketData({
      playerId: "p-candle-test",
      openPrice: basePrice,
      basePrice,
      events: singleGoalEvent,
      currentMinute: 90,
      matchStatus: "FT",
    });

    // Verify all timeframes preserve finalClose === derived.currentPrice, OHLC invariants, and tight wick ratios
    const timeframes: CandleTimeframe[] = ["1M", "3M", "15M", "1D"];
    for (const tf of timeframes) {
      const candles = deriveCandlesFromEvents({
        playerId: "p-candle-test",
        openPrice: derived.openPrice,
        basePrice,
        events: derived.events,
        timeframe: tf,
        matchStatus: "FT",
        currentMinute: 90,
      });

      assert.ok(candles.length >= 2, `${tf} should produce multiple candles`);
      assert.equal(
        candles[candles.length - 1].close,
        derived.currentPrice,
        `${tf} final close must equal derived.currentPrice`
      );

      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const bodyHigh = Math.max(c.open, c.close);
        const bodyLow = Math.min(c.open, c.close);
        const body = bodyHigh - bodyLow;
        const upperWick = c.high - bodyHigh;
        const lowerWick = bodyLow - c.low;

        assert.ok(c.low <= bodyLow && bodyHigh <= c.high, `${tf}[${i}] OHLC invariant failed`);
        assert.ok(c.low >= floorPrice && c.high <= capPrice, `${tf}[${i}] must stay within ±15% limits`);

        if (tf !== "1D") {
          if (i > 0) {
            assert.equal(
              c.open,
              candles[i - 1].close,
              `${tf}[${i}] open must connect continuously to prior close`
            );
          }
          const maxAllowedWick = c.matchEvent
            ? Math.max(10, roundToTen(basePrice * 0.006))
            : Math.max(10, roundToTen(basePrice * 0.003));
          assert.ok(
            upperWick <= maxAllowedWick,
            `${tf}[${i}] upper wick (${upperWick}) exceeds clean bound (${maxAllowedWick}) for body ${body}`
          );
          assert.ok(
            lowerWick <= maxAllowedWick,
            `${tf}[${i}] lower wick (${lowerWick}) exceeds clean bound (${maxAllowedWick}) for body ${body}`
          );
          if (!c.matchEvent && body === 0) {
            assert.ok(upperWick <= 10 && lowerWick <= 10, `${tf}[${i}] zero-body candle must not have tall wicks`);
          }
        } else if (i < candles.length - 1) {
          const maxDailyWick = Math.max(10, roundToTen(basePrice * 0.008));
          assert.ok(upperWick <= maxDailyWick && lowerWick <= maxDailyWick);
        }
      }
    }

    // Verify 3M single-event cliff softening & exact 62' marker preservation
    const candles3m = deriveCandlesFromEvents({
      playerId: "p-candle-test",
      openPrice: derived.openPrice,
      basePrice,
      events: derived.events,
      timeframe: "3M",
      matchStatus: "FT",
      currentMinute: 90,
    });
    const goalIdx = candles3m.findIndex((c) => c.matchEvent?.minute === 62);
    assert.ok(goalIdx > 0 && goalIdx < candles3m.length - 2);
    assert.equal(candles3m[goalIdx].matchEvent?.type, "GOAL");
    assert.equal(candles3m[goalIdx].minute, 62);

    const totalJump = derived.currentPrice - basePrice;
    const goalCandleBody = candles3m[goalIdx].close - candles3m[goalIdx].open;
    const followThroughBody = candles3m[goalIdx + 1].close - candles3m[goalIdx + 1].open;
    // Primary catalyst bar carries ~65-85% of the jump, followed by natural follow-through bar
    assert.ok(
      goalCandleBody > totalJump * 0.6 && goalCandleBody < totalJump * 0.9,
      `Goal bar body (${goalCandleBody}) should soften single-bar vertical cliff of ${totalJump}`
    );
    assert.ok(
      followThroughBody > 0,
      `Post-event bar should carry smooth follow-through (got ${followThroughBody})`
    );

    // Edge case: when event occurs at the final minute (62' of a live 62' match), final close still matches 100%
    const liveAt62 = derivePlayerMarketData({
      playerId: "p-candle-test",
      openPrice: basePrice,
      basePrice,
      events: singleGoalEvent,
      currentMinute: 62,
      matchStatus: "LIVE",
    });
    const liveCandlesAt62 = deriveCandlesFromEvents({
      playerId: "p-candle-test",
      openPrice: liveAt62.openPrice,
      basePrice,
      events: liveAt62.events,
      timeframe: "3M",
      matchStatus: "LIVE",
      currentMinute: 62,
    });
    assert.equal(
      liveCandlesAt62[liveCandlesAt62.length - 1].close,
      liveAt62.currentPrice
    );
  });
});
