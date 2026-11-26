import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ActiveMatchContext,
  Match,
  Position,
  TradeType,
} from "../types/index.ts";

export type FixtureCacheKind = "DATE_LIST" | "FIXTURE_DETAIL";
export type FixtureCacheStatus = "PRE" | "LIVE" | "FT";

/**
 * 1. API-Football persistent cache (`fixtures_cache`)
 * - Stores both date-level fixture lists (`cache_key = "date:YYYY-MM-DD"`)
 *   and single-fixture details (`cache_key = "fixture:<id>"`).
 * - Finished (`FT`) matches set `expires_at = NULL` for permanent retention
 *   so daily 100-call Free Plan quota is never re-spent on completed fixtures.
 */
export const fixturesCache = pgTable(
  "fixtures_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    kind: text("kind").$type<FixtureCacheKind>().notNull(),
    matchDate: text("match_date"),
    fixtureId: integer("fixture_id"),
    status: text("status").$type<FixtureCacheStatus>().notNull(),
    payload: jsonb("payload").$type<Match[] | Match>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("fixtures_cache_kind_date_idx").on(table.kind, table.matchDate),
    index("fixtures_cache_fixture_id_idx").on(table.fixtureId),
    index("fixtures_cache_status_expires_idx").on(table.status, table.expiresAt),
  ]
);

/**
 * 2. User accounts (`users`)
 * - `cash_balance` stored as integer bigint in PitchTrade Points (P).
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  nickname: text("nickname").notNull(),
  cashBalance: bigint("cash_balance", { mode: "number" })
    .notNull()
    .default(100_000),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * 3. Current portfolio positions (`holdings`)
 * - Composite unique index on `(user_id, player_id)` enforces one position row per player.
 */
export const holdings = pgTable(
  "holdings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    quantity: integer("quantity").notNull().default(0),
    avgPrice: bigint("avg_price", { mode: "number" }).notNull().default(0),
    matchContext: jsonb("match_context").$type<ActiveMatchContext | null>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("holdings_user_player_uidx").on(table.userId, table.playerId),
    index("holdings_user_idx").on(table.userId),
  ]
);

/**
 * 4. Append-only trade ledger (`ledger_entries`)
 * - Immutable audit record of every BUY/SELL execution.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    side: text("side").$type<TradeType>().notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ledger_entries_user_created_idx").on(table.userId, table.createdAt),
    index("ledger_entries_player_idx").on(table.playerId),
  ]
);

/**
 * 5. Published 11-player squad community posts (`squad_posts`)
 * - Immutable after publish (delete-only at application layer).
 */
export const squadPosts = pgTable(
  "squad_posts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    formation: text("formation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("squad_posts_author_created_idx").on(table.authorId, table.createdAt),
  ]
);

/**
 * 6. Per-slot player snapshots for published squads (`squad_slots`)
 * - Stores `snapshot_quantity` at publish time to evaluate '일부 매도' / '전량 매도' badges.
 * - Unique constraints on `(post_id, slot_index)` and `(post_id, player_id)` prevent duplicate players.
 */
export const squadSlots = pgTable(
  "squad_slots",
  {
    id: serial("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => squadPosts.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    slotLabel: text("slot_label").notNull(),
    playerId: text("player_id").notNull(),
    playerName: text("player_name").notNull(),
    teamName: text("team_name").notNull(),
    teamShort: text("team_short").notNull(),
    teamColor: text("team_color").notNull(),
    position: text("position").$type<Position>().notNull(),
    backNumber: integer("back_number").notNull().default(0),
    snapshotQuantity: integer("snapshot_quantity").notNull(),
    snapshotPrice: bigint("snapshot_price", { mode: "number" }).notNull(),
    avgBuyPrice: bigint("avg_buy_price", { mode: "number" })
      .notNull()
      .default(0),
  },
  (table) => [
    uniqueIndex("squad_slots_post_slot_uidx").on(table.postId, table.slotIndex),
    uniqueIndex("squad_slots_post_player_uidx").on(table.postId, table.playerId),
    index("squad_slots_post_idx").on(table.postId),
  ]
);

/**
 * 7. Community comments on published squads (`squad_comments`)
 */
export const squadComments = pgTable(
  "squad_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => squadPosts.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("squad_comments_post_created_idx").on(table.postId, table.createdAt),
  ]
);

export type FixtureCacheRow = typeof fixturesCache.$inferSelect;
export type NewFixtureCacheRow = typeof fixturesCache.$inferInsert;
export type DbUser = typeof users.$inferSelect;
export type DbHolding = typeof holdings.$inferSelect;
export type DbLedgerEntry = typeof ledgerEntries.$inferSelect;
export type DbSquadPost = typeof squadPosts.$inferSelect;
export type DbSquadSlot = typeof squadSlots.$inferSelect;
export type DbSquadComment = typeof squadComments.$inferSelect;
