import fs from "node:fs";
import path from "node:path";
import { getPositionLine } from "../../types/index.ts";
import {
  fanOutTeamEventsToPlayers,
  type GoalContext,
  type MatchParticipant,
} from "../priceEngine.ts";
import { diffScoreSnapshotsToTeamEvents } from "./scoreDiff.ts";
import {
  FORBIDDEN_SIMULATED_EVENT_TYPES,
  SIMULATED_AVAILABLE_EVENT_TYPES,
  type MatchDataProvider,
  type ProviderEvaluationResult,
  type ScoreDerivedTeamEvent,
  type ScoreSnapshot,
} from "./types.ts";

export const AVAILABLE_EVENT_TYPES = SIMULATED_AVAILABLE_EVENT_TYPES;

export interface LedgerEntry {
  eventId: string;
  matchId: string;
  minute: number;
  teamSide: "HOME" | "AWAY";
  scoringSide: "HOME" | "AWAY";
  goalIndex: number;
  kind: "GOAL" | "ASSIST";
  actorPlayerId: string;
  goalContext?: GoalContext;
  source: "SIMULATED";
  estimated: true;
  metadata: { estimated: true };
  description: string;
}

export interface LedgerStore {
  version: 1;
  entries: Record<string, LedgerEntry>;
}

function hashSeedToUnit(seedStr: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pickParticipantByPositionShare(
  candidates: MatchParticipant[],
  shares: Record<"FW" | "MF" | "DF" | "GK", number>,
  uRoll: number,
  uMember: number
): MatchParticipant {
  const byGroup: Record<"FW" | "MF" | "DF" | "GK", MatchParticipant[]> = {
    FW: [],
    MF: [],
    DF: [],
    GK: [],
  };
  for (const c of candidates) {
    byGroup[getPositionLine(String(c.position))].push(c);
  }
  const groups = (["FW", "MF", "DF", "GK"] as const).filter(
    (g) => byGroup[g].length > 0 && shares[g] > 0
  );
  if (groups.length === 0) {
    return candidates[Math.floor(uMember * candidates.length)];
  }
  const totalShare = groups.reduce((s, g) => s + shares[g], 0);
  let target = uRoll * totalShare;
  let chosen = groups[groups.length - 1];
  for (const g of groups) {
    target -= shares[g];
    if (target <= 0) {
      chosen = g;
      break;
    }
  }
  const pool = byGroup[chosen];
  return pool[Math.min(pool.length - 1, Math.floor(uMember * pool.length))];
}

/**
 * Server-only simulated event provider (`ENABLE_SIMULATED_EVENTS=true`).
 * - Uses server secret seed (`process.env.SIMULATION_SECRET_SEED`).
 * - Persists synthesized `GOAL` and `ASSIST` events in `.cache/ledger.json` by `eventId`
 *   and reuses them verbatim on subsequent lookups without recalculation.
 * - Strictly prohibits `YELLOW_CARD`, `RED_CARD`, and `KEY_ACTION`.
 */
export class SimulatedEventsProvider implements MatchDataProvider {
  readonly name = "SimulatedEventsProvider";
  readonly mode = "SIMULATED_EVENTS" as const;
  readonly availableEventTypes = AVAILABLE_EVENT_TYPES;
  readonly isSimulated = true;
  readonly usesDummyLineupFallback = true;

  private static readonly memoryFallback = new Map<string, LedgerStore>();
  private readonly ledgerFilePath: string;
  private readonly explicitSecretSeed?: string;

  constructor(options?: { ledgerFilePath?: string; secretSeed?: string }) {
    this.ledgerFilePath =
      options?.ledgerFilePath ??
      path.join(process.cwd(), ".cache", "ledger.json");
    this.explicitSecretSeed = options?.secretSeed;
  }

  static isEnabled(): boolean {
    return process.env.ENABLE_SIMULATED_EVENTS === "true";
  }

  private getSecretSeed(): string {
    return (
      this.explicitSecretSeed ??
      process.env.SIMULATION_SECRET_SEED ??
      "pitchtrade-server-only-default-seed"
    );
  }

  readLedger(): LedgerStore {
    try {
      if (fs.existsSync(this.ledgerFilePath)) {
        const raw = fs.readFileSync(this.ledgerFilePath, "utf8");
        const parsed = JSON.parse(raw) as LedgerStore;
        if (parsed && typeof parsed.entries === "object") {
          const mem = SimulatedEventsProvider.memoryFallback.get(
            this.ledgerFilePath
          );
          if (mem && Object.keys(mem.entries).length > 0) {
            return {
              version: 1,
              entries: { ...parsed.entries, ...mem.entries },
            };
          }
          return parsed;
        }
      }
    } catch {
      // Ignore corrupt or missing file and check memory fallback
    }
    const mem = SimulatedEventsProvider.memoryFallback.get(this.ledgerFilePath);
    if (mem) {
      return { version: 1, entries: { ...mem.entries } };
    }
    return { version: 1, entries: {} };
  }

  private writeLedger(store: LedgerStore): void {
    SimulatedEventsProvider.memoryFallback.set(this.ledgerFilePath, {
      version: 1,
      entries: { ...store.entries },
    });
    try {
      const dir = path.dirname(this.ledgerFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.ledgerFilePath,
        JSON.stringify(store, null, 2),
        "utf8"
      );
    } catch {
      // In read-only sandbox environments, memoryFallback preserves ledger determinism
    }
  }

  async evaluateSnapshot(
    prev: ScoreSnapshot | null,
    curr: ScoreSnapshot,
    existingTeamEvents: ScoreDerivedTeamEvent[] = [],
    participants: MatchParticipant[] = []
  ): Promise<ProviderEvaluationResult> {
    const baseScoreEvents = diffScoreSnapshotsToTeamEvents(
      prev,
      curr,
      existingTeamEvents
    );
    const ledger = this.readLedger();
    let ledgerChanged = false;
    const secret = this.getSecretSeed();

    const safeHome = Math.max(0, Math.floor(curr.homeScore));
    const safeAway = Math.max(0, Math.floor(curr.awayScore));

    // Prune any rolled-back ledger entries for this match when VAR reduces score
    for (const [key, entry] of Object.entries(ledger.entries)) {
      if (entry.matchId !== curr.matchId) continue;
      const maxAllowed = entry.scoringSide === "HOME" ? safeHome : safeAway;
      if (entry.goalIndex > maxAllowed) {
        delete ledger.entries[key];
        ledgerChanged = true;
      }
    }

    const synthesizedEvents: ScoreDerivedTeamEvent[] = [];
    const teamGoalEvents = baseScoreEvents.filter(
      (e) => e.kind === "TEAM_GOAL" && e.goalIndex !== undefined
    );

    for (const tg of teamGoalEvents) {
      const side = tg.teamSide;
      const gIdx = tg.goalIndex ?? 1;
      const goalEventId = `${curr.matchId}-${side.toLowerCase()}-g${gIdx}-sim_goal`;
      const assistEventId = `${curr.matchId}-${side.toLowerCase()}-g${gIdx}-sim_assist`;

      const sidePlayers = participants.filter(
        (p) => p.teamSide === side && !p.isBenchUnused
      );

      if (ledger.entries[goalEventId]) {
        const cachedGoal = ledger.entries[goalEventId];
        synthesizedEvents.push({
          id: cachedGoal.eventId,
          matchId: cachedGoal.matchId,
          minute: cachedGoal.minute,
          teamSide: cachedGoal.teamSide,
          scoringSide: cachedGoal.scoringSide,
          goalIndex: cachedGoal.goalIndex,
          kind: "GOAL",
          actorPlayerId: cachedGoal.actorPlayerId,
          goalContext: cachedGoal.goalContext,
          source: "SIMULATED",
          estimated: true,
          metadata: { estimated: true },
          description: cachedGoal.description,
        });
      } else if (sidePlayers.length > 0) {
        const scorer = pickParticipantByPositionShare(
          sidePlayers,
          { FW: 0.6, MF: 0.3, DF: 0.09, GK: 0.01 },
          hashSeedToUnit(`${secret}:${goalEventId}:pos`),
          hashSeedToUnit(`${secret}:${goalEventId}:member`)
        );
        const newGoalEntry: LedgerEntry = {
          eventId: goalEventId,
          matchId: curr.matchId,
          minute: tg.minute,
          teamSide: side,
          scoringSide: side,
          goalIndex: gIdx,
          kind: "GOAL",
          actorPlayerId: scorer.playerId,
          goalContext: tg.goalContext ?? "OPENER",
          source: "SIMULATED",
          estimated: true,
          metadata: { estimated: true },
          description: "시뮬레이션 추정 득점",
        };
        ledger.entries[goalEventId] = newGoalEntry;
        ledgerChanged = true;
        synthesizedEvents.push({
          id: newGoalEntry.eventId,
          matchId: newGoalEntry.matchId,
          minute: newGoalEntry.minute,
          teamSide: newGoalEntry.teamSide,
          scoringSide: newGoalEntry.scoringSide,
          goalIndex: newGoalEntry.goalIndex,
          kind: "GOAL",
          actorPlayerId: newGoalEntry.actorPlayerId,
          goalContext: newGoalEntry.goalContext,
          source: "SIMULATED",
          estimated: true,
          metadata: { estimated: true },
          description: newGoalEntry.description,
        });

        const assistRoll = hashSeedToUnit(`${secret}:${assistEventId}:prob`);
        const assistCandidates = sidePlayers.filter(
          (p) => p.playerId !== scorer.playerId
        );
        if (assistRoll < 0.7 && assistCandidates.length > 0) {
          const assister = pickParticipantByPositionShare(
            assistCandidates,
            { FW: 0.32, MF: 0.48, DF: 0.19, GK: 0.01 },
            hashSeedToUnit(`${secret}:${assistEventId}:pos`),
            hashSeedToUnit(`${secret}:${assistEventId}:member`)
          );
          const newAssistEntry: LedgerEntry = {
            eventId: assistEventId,
            matchId: curr.matchId,
            minute: tg.minute,
            teamSide: side,
            scoringSide: side,
            goalIndex: gIdx,
            kind: "ASSIST",
            actorPlayerId: assister.playerId,
            source: "SIMULATED",
            estimated: true,
            metadata: { estimated: true },
            description: "시뮬레이션 추정 도움",
          };
          ledger.entries[assistEventId] = newAssistEntry;
          ledgerChanged = true;
        }
      }

      if (ledger.entries[assistEventId]) {
        const cachedAssist = ledger.entries[assistEventId];
        synthesizedEvents.push({
          id: cachedAssist.eventId,
          matchId: cachedAssist.matchId,
          minute: cachedAssist.minute,
          teamSide: cachedAssist.teamSide,
          scoringSide: cachedAssist.scoringSide,
          goalIndex: cachedAssist.goalIndex,
          kind: "ASSIST",
          actorPlayerId: cachedAssist.actorPlayerId,
          source: "SIMULATED",
          estimated: true,
          metadata: { estimated: true },
          description: cachedAssist.description,
        });
      }
    }

    if (ledgerChanged) {
      this.writeLedger(ledger);
    }

    // Enforce invariant: no forbidden negative/action event types may ever be synthesized
    const safeSynthesized = synthesizedEvents.filter(
      (ev) =>
        !FORBIDDEN_SIMULATED_EVENT_TYPES.includes(
          ev.kind as (typeof FORBIDDEN_SIMULATED_EVENT_TYPES)[number]
        ) &&
        (ev.kind === "GOAL" || ev.kind === "ASSIST")
    );

    const combinedTeamEvents: ScoreDerivedTeamEvent[] = [
      ...baseScoreEvents,
      ...safeSynthesized,
    ].sort((a, b) => a.minute - b.minute);

    // For fan-out, avoid double-counting TEAM_GOAL/TEAM_CONCEDED when a synthesized GOAL event exists for that (scoringSide, goalIndex)
    const synthesizedGoalKeys = new Set(
      safeSynthesized
        .filter((e) => e.kind === "GOAL")
        .map((e) => `${e.scoringSide}:${e.goalIndex}`)
    );
    const fanOutInput = combinedTeamEvents.filter((e) => {
      if (
        (e.kind === "TEAM_GOAL" || e.kind === "TEAM_CONCEDED") &&
        e.scoringSide &&
        e.goalIndex !== undefined &&
        synthesizedGoalKeys.has(`${e.scoringSide}:${e.goalIndex}`)
      ) {
        return false;
      }
      return true;
    });

    const playerEvents = fanOutTeamEventsToPlayers(participants, fanOutInput);

    return {
      providerMode: this.mode,
      teamEvents: combinedTeamEvents,
      playerEvents,
      usesDummyLineupFallback: this.usesDummyLineupFallback,
      hasSimulatedEvents: safeSynthesized.length > 0,
    };
  }
}
