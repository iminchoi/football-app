import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DeepDataLiveProvider,
  FORBIDDEN_SIMULATED_EVENT_TYPES,
  NotImplementedError,
  SCORE_ONLY_AVAILABLE_EVENT_TYPES,
  SIMULATED_AVAILABLE_EVENT_TYPES,
  ScoreOnlyLiveProvider,
  SimulatedEventsProvider,
  diffScoreSnapshotsToTeamEvents,
} from "../src/lib/providers/index.ts";
import {
  buildPriceSeries,
  type MatchParticipant,
} from "../src/lib/priceEngine.ts";

const TEST_LEDGER_PATH = path.join(
  process.cwd(),
  ".cache",
  "test-ledger.json"
);

const SAMPLE_PARTICIPANTS: MatchParticipant[] = [
  { playerId: "h-gk", teamSide: "HOME", position: "GK", isStarter: true },
  { playerId: "h-df1", teamSide: "HOME", position: "CB", isStarter: true },
  { playerId: "h-mf1", teamSide: "HOME", position: "CM", isStarter: true },
  { playerId: "h-fw1", teamSide: "HOME", position: "ST", isStarter: true },
  { playerId: "a-gk", teamSide: "AWAY", position: "GK", isStarter: true },
  { playerId: "a-df1", teamSide: "AWAY", position: "CB", isStarter: true },
  { playerId: "a-mf1", teamSide: "AWAY", position: "CM", isStarter: true },
  { playerId: "a-fw1", teamSide: "AWAY", position: "ST", isStarter: true },
];

test("1. SimulatedEventsProvider persists synthesized events in ledger.json and reuses them verbatim without recalculation", async () => {
  const provider1 = new SimulatedEventsProvider({
    ledgerFilePath: TEST_LEDGER_PATH,
    secretSeed: "seed-alpha-111",
  });

  const snap = {
    matchId: "m-ledger-1",
    homeScore: 2,
    awayScore: 1,
    status: "LIVE" as const,
    minute: 54,
  };

  const firstRun = await provider1.evaluateSnapshot(
    null,
    snap,
    [],
    SAMPLE_PARTICIPANTS
  );
  const storedEntries = provider1.readLedger().entries;
  assert.ok(Object.keys(storedEntries).length >= 3);

  // Second query with a DIFFERENT secretSeed must still return 100% identical events from ledger.json
  const provider2 = new SimulatedEventsProvider({
    ledgerFilePath: TEST_LEDGER_PATH,
    secretSeed: "completely-different-seed-999",
  });
  const secondRun = await provider2.evaluateSnapshot(
    null,
    snap,
    [],
    SAMPLE_PARTICIPANTS
  );

  const firstSim = firstRun.teamEvents.filter((e) => e.source === "SIMULATED");
  const secondSim = secondRun.teamEvents.filter(
    (e) => e.source === "SIMULATED"
  );
  assert.ok(firstSim.length >= 3);
  assert.deepEqual(secondSim, firstSim);
  assert.deepEqual(secondRun.playerEvents, firstRun.playerEvents);
});

test("2. VAR score correction (2:0 -> 1:0) removes cancelled TEAM_GOAL / TEAM_CONCEDED and marks polling events with { estimated: true }", async () => {
  const snap20 = {
    matchId: "m-var-1",
    homeScore: 2,
    awayScore: 0,
    status: "LIVE" as const,
    minute: 38,
  };
  const eventsAt20 = diffScoreSnapshotsToTeamEvents(null, snap20, []);
  const homeTeamGoals20 = eventsAt20.filter(
    (e) => e.kind === "TEAM_GOAL" && e.teamSide === "HOME"
  );
  const awayConceded20 = eventsAt20.filter(
    (e) => e.kind === "TEAM_CONCEDED" && e.teamSide === "AWAY"
  );
  assert.equal(homeTeamGoals20.length, 2);
  assert.equal(awayConceded20.length, 2);
  for (const ev of [...homeTeamGoals20, ...awayConceded20]) {
    assert.equal(ev.estimated, true);
    assert.deepEqual(ev.metadata, { estimated: true });
    assert.equal(ev.source, "REAL");
  }

  // Score corrected from 2:0 down to 1:0 (second goal cancelled by VAR)
  const snap10 = {
    matchId: "m-var-1",
    homeScore: 1,
    awayScore: 0,
    status: "LIVE" as const,
    minute: 41,
  };
  const eventsAt10 = diffScoreSnapshotsToTeamEvents(snap20, snap10, eventsAt20);
  const homeTeamGoals10 = eventsAt10.filter(
    (e) => e.kind === "TEAM_GOAL" && e.teamSide === "HOME"
  );
  const awayConceded10 = eventsAt10.filter(
    (e) => e.kind === "TEAM_CONCEDED" && e.teamSide === "AWAY"
  );
  assert.equal(homeTeamGoals10.length, 1);
  assert.equal(awayConceded10.length, 1);
  assert.equal(homeTeamGoals10[0].goalIndex, 1);
});

test("3. SimulatedEventsProvider only generates GOAL or ASSIST and never generates YELLOW_CARD, RED_CARD, or KEY_ACTION", async () => {
  const provider = new SimulatedEventsProvider({
    ledgerFilePath: TEST_LEDGER_PATH,
    secretSeed: "strict-whitelist-seed",
  });

  const res = await provider.evaluateSnapshot(
    null,
    {
      matchId: "m-whitelist-1",
      homeScore: 4,
      awayScore: 3,
      status: "FT",
      minute: 90,
    },
    [],
    SAMPLE_PARTICIPANTS
  );

  const simulatedTeamEvents = res.teamEvents.filter(
    (e) => e.source === "SIMULATED"
  );
  assert.ok(simulatedTeamEvents.length >= 7);

  for (const ev of simulatedTeamEvents) {
    assert.ok(ev.kind === "GOAL" || ev.kind === "ASSIST");
    assert.equal(
      FORBIDDEN_SIMULATED_EVENT_TYPES.includes(
        ev.kind as (typeof FORBIDDEN_SIMULATED_EVENT_TYPES)[number]
      ),
      false
    );
  }

  // Verify source is preserved across fan-out and buildPriceSeries
  for (const p of SAMPLE_PARTICIPANTS) {
    const pEvents = res.playerEvents[p.playerId] ?? [];
    for (const pev of pEvents) {
      assert.ok(pev.source === "REAL" || pev.source === "SIMULATED");
      if (pev.source === "SIMULATED") {
        assert.ok(pev.type === "GOAL" || pev.type === "ASSIST");
      }
    }
    const series = buildPriceSeries(
      10000,
      pEvents,
      { position: p.position, playerId: p.playerId, matchId: "m-whitelist-1", isStarter: true },
      90
    );
    for (const pt of series.points) {
      if (pt.event) {
        assert.ok(pt.event.source === "REAL" || pt.event.source === "SIMULATED");
      }
    }
  }

  const scoreOnly = new ScoreOnlyLiveProvider();
  assert.deepEqual(
    scoreOnly.availableEventTypes,
    SCORE_ONLY_AVAILABLE_EVENT_TYPES
  );
  assert.deepEqual(
    provider.availableEventTypes,
    SIMULATED_AVAILABLE_EVENT_TYPES
  );

  const deepProvider = new DeepDataLiveProvider();
  await assert.rejects(
    () =>
      deepProvider.evaluateSnapshot(null, {
        matchId: "m-deep",
        homeScore: 0,
        awayScore: 0,
        status: "LIVE",
        minute: 10,
      }),
    NotImplementedError
  );
});
