import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const lifeDomains = sqliteTable("life_domains", {
  id: text("id").primaryKey(),
  ownerKey: text("owner_key").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#70cfcf"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  index("idx_domains_owner_order").on(table.ownerKey, table.sortOrder),
  uniqueIndex("idx_domains_owner_label").on(table.ownerKey, table.label),
]);

export const lifeTracks = sqliteTable("life_tracks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  why: text("why").notNull().default(""),
  nextStep: text("next_step").notNull().default(""),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("active"),
  progress: integer("progress").notNull().default(0),
  color: text("color").notNull().default("#ff9c69"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, table => [
  index("idx_tracks_status_order").on(table.status, table.sortOrder),
]);

export const lifeEntries = sqliteTable("life_entries", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  occurredAt: text("occurred_at").notNull(),
  endedAt: text("ended_at"),
  locationName: text("location_name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  category: text("category").notNull().default("growth"),
  status: text("status").notNull().default("memory"),
  mood: integer("mood").notNull().default(4),
  significance: integer("significance").notNull().default(3),
  summary: text("summary").notNull().default(""),
  rawDetail: text("raw_detail").notNull().default(""),
  detail: text("detail").notNull().default(""),
  lessons: text("lessons").notNull().default(""),
  people: text("people").notNull().default(""),
  emotion: text("emotion").notNull().default("calm"),
  emotionTags: text("emotion_tags").notNull().default("[]"),
  lifePhase: text("life_phase").notNull().default(""),
  visibility: text("visibility").notNull().default("private"),
  tags: text("tags").notNull().default("[]"),
  trackId: text("track_id").references(() => lifeTracks.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
}, table => [
  index("idx_entries_occurred_at").on(table.occurredAt),
  index("idx_entries_track_id").on(table.trackId),
]);

export const lifeMedia = sqliteTable("life_media", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => lifeEntries.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  stage: text("stage").notNull().default("moment"),
  capturedAt: text("captured_at"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: text("created_at").notNull(),
}, table => [
  index("idx_media_entry_stage").on(table.entryId, table.stage),
]);

export const lifeProfiles = sqliteTable("life_profiles", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  birthDate: text("birth_date").notNull(),
  birthCity: text("birth_city").notNull().default(""),
  currentCity: text("current_city").notNull().default(""),
  identity: text("identity").notNull().default(""),
  planningAge: integer("planning_age").notNull().default(80),
  values: text("core_values").notNull().default("[]"),
  avatarSymbol: text("avatar_symbol").notNull().default("星"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const lifeGoals = sqliteTable("life_goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  why: text("why").notNull().default(""),
  nextStep: text("next_step").notNull().default(""),
  targetDate: text("target_date").notNull(),
  startDate: text("start_date").notNull(),
  domain: text("domain").notNull().default("career"),
  timeMode: text("time_mode").notNull().default("point"),
  nodeType: text("node_type").notNull().default("goal"),
  status: text("status").notNull().default("planned"),
  progress: integer("progress").notNull().default(0),
  trackId: text("track_id").references(() => lifeTracks.id, { onDelete: "set null" }),
  linkedEntryId: text("linked_entry_id").references(() => lifeEntries.id, { onDelete: "set null" }),
  locationName: text("location_name").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, table => [
  index("idx_goals_domain_target").on(table.domain, table.targetDate),
  index("idx_goals_track_id").on(table.trackId),
]);

export const lifeGoalEdges = sqliteTable("life_goal_edges", {
  id: text("id").primaryKey(),
  fromGoalId: text("from_goal_id").notNull().references(() => lifeGoals.id, { onDelete: "cascade" }),
  toGoalId: text("to_goal_id").notNull().references(() => lifeGoals.id, { onDelete: "cascade" }),
  relation: text("relation").notNull().default("depends"),
  createdAt: text("created_at").notNull(),
}, table => [
  index("idx_goal_edges_from").on(table.fromGoalId),
  index("idx_goal_edges_to").on(table.toGoalId),
]);
