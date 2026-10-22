import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const vocabularyProgress = sqliteTable("vocabulary_progress", {
  userId: text("user_id").notNull(),
  term: text("term").notNull(),
  mastered: integer("mastered").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.term] })]);

export const dialogueProgress = sqliteTable("dialogue_progress", {
  userId: text("user_id").notNull(),
  dialogueId: text("dialogue_id").notNull(),
  status: text("status", { enum: ["listened", "revisit", "understood"] }).notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.dialogueId] }),
  check("dialogue_progress_status_check", sql`${table.status} IN ('listened', 'revisit', 'understood')`),
]);
