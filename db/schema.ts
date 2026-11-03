import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const answers = sqliteTable("answers", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["restaurants", "idea", "both"] }).notNull(),
  restaurants: text("restaurants").notNull(),
  message: text("message").notNull(),
  sessionId: text("session_id").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("answers_created_at").on(table.createdAt), index("answers_session_id").on(table.sessionId)]);
