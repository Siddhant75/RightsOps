import { neon } from "@neondatabase/serverless";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import type { DemoWorkflowState } from "@/server/seed/demo-scenario";
import {
  withTransientDatabaseReadRetry,
  withTransientDatabaseWriteRetry,
} from "@/server/db/database-retry";
import { demoWorkflowStates } from "@/server/db/schema";

export interface WorkflowRepository {
  read(): Promise<DemoWorkflowState | null>;
  reset(state: DemoWorkflowState): Promise<void>;
  mutate<T>(
    mutation: (state: DemoWorkflowState) => T | Promise<T>,
  ): Promise<T>;
}

const WORKFLOW_ID = "default";
const MAX_WRITE_ATTEMPTS = 5;

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required for the persistent workflow repository",
    );
  }

  return drizzle(neon(connectionString), { schema: { demoWorkflowStates } });
}

type Database = ReturnType<typeof createDatabase>;

export class DrizzleWorkflowRepository implements WorkflowRepository {
  constructor(private readonly database: Database) {}

  async read(): Promise<DemoWorkflowState | null> {
    const [row] = await withTransientDatabaseReadRetry(() =>
      this.database
        .select({ state: demoWorkflowStates.state })
        .from(demoWorkflowStates)
        .where(eq(demoWorkflowStates.id, WORKFLOW_ID))
        .limit(1),
    );
    return row ? structuredClone(row.state) : null;
  }

  async reset(state: DemoWorkflowState): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.database
      .insert(demoWorkflowStates)
      .values({
        id: WORKFLOW_ID,
        revision: 0,
        state,
        updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          revision: sql`${demoWorkflowStates.revision} + 1`,
          state,
          updatedAt,
        },
        target: demoWorkflowStates.id,
      });
  }

  async mutate<T>(
    mutation: (state: DemoWorkflowState) => T | Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const [current] = await withTransientDatabaseReadRetry(() =>
        this.database
          .select({
            revision: demoWorkflowStates.revision,
            state: demoWorkflowStates.state,
          })
          .from(demoWorkflowStates)
          .where(eq(demoWorkflowStates.id, WORKFLOW_ID))
          .limit(1),
      );
      if (!current) {
        throw new Error("Demo workflow has not been initialized");
      }

      const nextState = structuredClone(current.state);
      const result = await mutation(nextState);
      const updated = await withTransientDatabaseWriteRetry(() =>
        this.database
          .update(demoWorkflowStates)
          .set({
            revision: current.revision + 1,
            state: nextState,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(demoWorkflowStates.id, WORKFLOW_ID),
              eq(demoWorkflowStates.revision, current.revision),
            ),
          )
          .returning({ revision: demoWorkflowStates.revision }),
      );

      if (updated.length === 1) return result;
    }

    throw new Error("Concurrent workflow update did not settle after 5 attempts");
  }
}

let repository: DrizzleWorkflowRepository | null = null;

export function getWorkflowRepository(): WorkflowRepository {
  if (!repository) {
    repository = new DrizzleWorkflowRepository(createDatabase());
  }
  return repository;
}
