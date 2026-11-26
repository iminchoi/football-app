import { eq } from "drizzle-orm";
import type { Match } from "../../types/index.ts";
import { getDb, isDatabaseConfigured, type PitchTradeDb } from "../../db/index.ts";
import {
  fixturesCache,
  type FixtureCacheStatus,
} from "../../db/schema.ts";

export interface CachedMatchesByDateRecord {
  date: string;
  matches: Match[];
  status: FixtureCacheStatus;
  fetchedAtMs: number;
  /** `null` indicates permanent retention (e.g., all fixtures on date are FT). */
  expiresAtMs: number | null;
}

export interface CachedFixtureDetailRecord {
  fixtureId: number;
  match: Match;
  status: FixtureCacheStatus;
  fetchedAtMs: number;
  /** `null` indicates permanent retention (finished FT match with full detail). */
  expiresAtMs: number | null;
}

export interface FixtureCacheRepository {
  readonly kind: "memory" | "postgres";
  getMatchesByDate(
    date: string,
    nowMs?: number
  ): Promise<CachedMatchesByDateRecord | null>;
  getStaleMatchesByDate(date: string): Promise<CachedMatchesByDateRecord | null>;
  setMatchesByDate(input: {
    date: string;
    matches: Match[];
    status: FixtureCacheStatus;
    fetchedAtMs: number;
    ttlMs: number | null;
  }): Promise<void>;
  getFixtureDetail(
    fixtureId: number,
    nowMs?: number
  ): Promise<CachedFixtureDetailRecord | null>;
  getStaleFixtureDetail(
    fixtureId: number
  ): Promise<CachedFixtureDetailRecord | null>;
  setFixtureDetail(input: {
    fixtureId: number;
    match: Match;
    status: FixtureCacheStatus;
    fetchedAtMs: number;
    ttlMs: number | null;
  }): Promise<void>;
  patchFixtureInCachedDates(match: Match): Promise<void>;
  clear?(): void;
}

export function dateCacheKey(date: string): string {
  return `date:${date.trim()}`;
}

export function fixtureDetailCacheKey(fixtureId: number): string {
  return `fixture:${fixtureId}`;
}

export function deriveDateMatchesStatus(
  matches: readonly Match[]
): FixtureCacheStatus {
  if (matches.length === 0) return "PRE";
  if (matches.some((m) => m.status === "LIVE")) return "LIVE";
  if (matches.every((m) => m.status === "FT")) return "FT";
  return "PRE";
}

export function deriveSingleFixtureStatus(match: Match): FixtureCacheStatus {
  if (match.status === "FT") return "FT";
  if (match.status === "LIVE") return "LIVE";
  return "PRE";
}

function isRecordFresh(
  expiresAtMs: number | null,
  nowMs: number
): boolean {
  if (expiresAtMs === null) return true; // Permanent FT retention
  return nowMs < expiresAtMs;
}

/**
 * In-memory implementation used automatically when `DATABASE_URL` is unset
 * and in offline unit tests.
 */
export class MemoryFixtureCacheRepository implements FixtureCacheRepository {
  readonly kind = "memory" as const;

  private readonly byDate = new Map<string, CachedMatchesByDateRecord>();
  private readonly byFixture = new Map<number, CachedFixtureDetailRecord>();

  async getMatchesByDate(
    date: string,
    nowMs = Date.now()
  ): Promise<CachedMatchesByDateRecord | null> {
    const rec = this.byDate.get(date.trim());
    if (!rec) return null;
    return isRecordFresh(rec.expiresAtMs, nowMs) ? rec : null;
  }

  async getStaleMatchesByDate(
    date: string
  ): Promise<CachedMatchesByDateRecord | null> {
    return this.byDate.get(date.trim()) ?? null;
  }

  async setMatchesByDate(input: {
    date: string;
    matches: Match[];
    status: FixtureCacheStatus;
    fetchedAtMs: number;
    ttlMs: number | null;
  }): Promise<void> {
    const expiresAtMs =
      input.ttlMs === null ? null : input.fetchedAtMs + input.ttlMs;
    this.byDate.set(input.date.trim(), {
      date: input.date.trim(),
      matches: input.matches,
      status: input.status,
      fetchedAtMs: input.fetchedAtMs,
      expiresAtMs,
    });
  }

  async getFixtureDetail(
    fixtureId: number,
    nowMs = Date.now()
  ): Promise<CachedFixtureDetailRecord | null> {
    const rec = this.byFixture.get(fixtureId);
    if (!rec) return null;
    return isRecordFresh(rec.expiresAtMs, nowMs) ? rec : null;
  }

  async getStaleFixtureDetail(
    fixtureId: number
  ): Promise<CachedFixtureDetailRecord | null> {
    return this.byFixture.get(fixtureId) ?? null;
  }

  async setFixtureDetail(input: {
    fixtureId: number;
    match: Match;
    status: FixtureCacheStatus;
    fetchedAtMs: number;
    ttlMs: number | null;
  }): Promise<void> {
    const expiresAtMs =
      input.ttlMs === null ? null : input.fetchedAtMs + input.ttlMs;
    this.byFixture.set(input.fixtureId, {
      fixtureId: input.fixtureId,
      match: input.match,
      status: input.status,
      fetchedAtMs: input.fetchedAtMs,
      expiresAtMs,
    });
  }

  async patchFixtureInCachedDates(match: Match): Promise<void> {
    for (const [dateKey, rec] of this.byDate.entries()) {
      const idx = rec.matches.findIndex((m) => m.id === match.id);
      if (idx === -1) continue;
      const nextMatches = [...rec.matches];
      nextMatches[idx] = match;
      const nextStatus = deriveDateMatchesStatus(nextMatches);
      this.byDate.set(dateKey, {
        ...rec,
        matches: nextMatches,
        status: nextStatus,
        expiresAtMs: nextStatus === "FT" ? null : rec.expiresAtMs,
      });
    }
  }

  clear(): void {
    this.byDate.clear();
    this.byFixture.clear();
  }
}

/**
 * Supabase PostgreSQL + Drizzle ORM implementation backed by `fixtures_cache`.
 * Every read/write is guarded so transient DB errors never crash API routes
 * (returning `null` / no-op so memory cache or upstream fallback still works).
 */
export class PostgresFixtureCacheRepository implements FixtureCacheRepository {
  readonly kind = "postgres" as const;
  private readonly db: PitchTradeDb;

  constructor(db: PitchTradeDb) {
    this.db = db;
  }

  async getMatchesByDate(
    date: string,
    nowMs = Date.now()
  ): Promise<CachedMatchesByDateRecord | null> {
    const rec = await this.getStaleMatchesByDate(date);
    if (!rec) return null;
    return isRecordFresh(rec.expiresAtMs, nowMs) ? rec : null;
  }

  async getStaleMatchesByDate(
    date: string
  ): Promise<CachedMatchesByDateRecord | null> {
    try {
      const key = dateCacheKey(date);
      const rows = await this.db
        .select()
        .from(fixturesCache)
        .where(eq(fixturesCache.cacheKey, key))
        .limit(1);
      const row = rows[0];
      if (!row || !Array.isArray(row.payload)) return null;
      return {
        date: row.matchDate ?? date.trim(),
        matches: row.payload as Match[],
        status: row.status,
        fetchedAtMs: row.fetchedAt.getTime(),
        expiresAtMs: row.expiresAt ? row.expiresAt.getTime() : null,
      };
    } catch {
      return null;
    }
  }

  async setMatchesByDate(input: {
    date: string;
    matches: Match[];
    status: FixtureCacheStatus;
    fetchedAtMs: number;
    ttlMs: number | null;
  }): Promise<void> {
    try {
      const cleanDate = input.date.trim();
      const key = dateCacheKey(cleanDate);
      const fetchedAt = new Date(input.fetchedAtMs);
      const expiresAt =
        input.ttlMs === null ? null : new Date(input.fetchedAtMs + input.ttlMs);

      await this.db
        .insert(fixturesCache)
        .values({
          cacheKey: key,
          kind: "DATE_LIST",
          matchDate: cleanDate,
          fixtureId: null,
          status: input.status,
          payload: input.matches,
          fetchedAt,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: fixturesCache.cacheKey,
          set: {
            status: input.status,
            payload: input.matches,
            fetchedAt,
            expiresAt,
          },
        });
    } catch {
      // Non-fatal: caller retains in-memory cache snapshot
    }
  }

  async getFixtureDetail(
    fixtureId: number,
    nowMs = Date.now()
  ): Promise<CachedFixtureDetailRecord | null> {
    const rec = await this.getStaleFixtureDetail(fixtureId);
    if (!rec) return null;
    return isRecordFresh(rec.expiresAtMs, nowMs) ? rec : null;
  }

  async getStaleFixtureDetail(
    fixtureId: number
  ): Promise<CachedFixtureDetailRecord | null> {
    try {
      const key = fixtureDetailCacheKey(fixtureId);
      const rows = await this.db
        .select()
        .from(fixturesCache)
        .where(eq(fixturesCache.cacheKey, key))
        .limit(1);
      const row = rows[0];
      if (!row || Array.isArray(row.payload)) return null;
      return {
        fixtureId: row.fixtureId ?? fixtureId,
        match: row.payload as Match,
        status: row.status,
        fetchedAtMs: row.fetchedAt.getTime(),
        expiresAtMs: row.expiresAt ? row.expiresAt.getTime() : null,
      };
    } catch {
      return null;
    }
  }

  async setFixtureDetail(input: {
    fixtureId: number;
    match: Match;
    status: FixtureCacheStatus;
    fetchedAtMs: number;
    ttlMs: number | null;
  }): Promise<void> {
    try {
      const key = fixtureDetailCacheKey(input.fixtureId);
      const fetchedAt = new Date(input.fetchedAtMs);
      const expiresAt =
        input.ttlMs === null ? null : new Date(input.fetchedAtMs + input.ttlMs);
      const matchDate = input.match.utcDate?.slice(0, 10) ?? null;

      await this.db
        .insert(fixturesCache)
        .values({
          cacheKey: key,
          kind: "FIXTURE_DETAIL",
          matchDate,
          fixtureId: input.fixtureId,
          status: input.status,
          payload: input.match,
          fetchedAt,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: fixturesCache.cacheKey,
          set: {
            matchDate,
            status: input.status,
            payload: input.match,
            fetchedAt,
            expiresAt,
          },
        });
    } catch {
      // Non-fatal: caller retains in-memory cache snapshot
    }
  }

  async patchFixtureInCachedDates(match: Match): Promise<void> {
    try {
      const dateStr = match.utcDate?.slice(0, 10);
      if (!dateStr) return;
      const existing = await this.getStaleMatchesByDate(dateStr);
      if (!existing) return;
      const idx = existing.matches.findIndex((m) => m.id === match.id);
      if (idx === -1) return;
      const nextMatches = [...existing.matches];
      nextMatches[idx] = match;
      const nextStatus = deriveDateMatchesStatus(nextMatches);
      const ttlMs =
        nextStatus === "FT" || existing.expiresAtMs === null
          ? null
          : Math.max(0, existing.expiresAtMs - existing.fetchedAtMs);
      await this.setMatchesByDate({
        date: dateStr,
        matches: nextMatches,
        status: nextStatus,
        fetchedAtMs: existing.fetchedAtMs,
        ttlMs,
      });
    } catch {
      // Non-fatal
    }
  }
}

const defaultMemoryRepo = new MemoryFixtureCacheRepository();

/**
 * Factory returning `PostgresFixtureCacheRepository` when `DATABASE_URL` is configured,
 * or safely falling back to `MemoryFixtureCacheRepository` when unset.
 */
export function getDefaultFixtureCacheRepository(
  rawUrl: string | undefined = process.env.DATABASE_URL
): FixtureCacheRepository {
  if (!isDatabaseConfigured(rawUrl)) {
    return defaultMemoryRepo;
  }
  const db = getDb(rawUrl);
  if (!db) {
    return defaultMemoryRepo;
  }
  return new PostgresFixtureCacheRepository(db);
}

export function clearDefaultFixtureCacheRepositoryForTesting(): void {
  defaultMemoryRepo.clear();
}
