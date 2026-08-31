import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { DemoWorkflowState } from "@/server/seed/demo-scenario";

export const demoWorkflowStates = pgTable("demo_workflow_states", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  state: jsonb("state").$type<DemoWorkflowState>().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "string",
    withTimezone: true,
  }).notNull(),
});
