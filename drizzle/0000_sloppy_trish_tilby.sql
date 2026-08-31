CREATE TABLE "demo_workflow_states" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
