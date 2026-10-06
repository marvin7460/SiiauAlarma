CREATE TABLE "offer_snapshots" (
	"cycle" text NOT NULL,
	"center" text NOT NULL,
	"query_kind" text NOT NULL,
	"query_value" text NOT NULL,
	"fetched_at" timestamp with time zone,
	"total_records" integer,
	"sections" jsonb,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	CONSTRAINT "offer_snapshots_cycle_center_query_kind_query_value_pk" PRIMARY KEY("cycle","center","query_kind","query_value")
);
--> statement-breakpoint
CREATE TABLE "siiau_gateway" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_request_finished_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"trips" integer DEFAULT 0 NOT NULL,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"robots_txt" text,
	"robots_status" integer,
	"robots_fetched_at" timestamp with time zone,
	CONSTRAINT "siiau_gateway_singleton" CHECK ("siiau_gateway"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "siiau_options" (
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "siiau_options_kind_code_pk" PRIMARY KEY("kind","code")
);
--> statement-breakpoint
CREATE TABLE "siiau_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "siiau_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"purpose" text NOT NULL,
	"path" text NOT NULL,
	"status" integer,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"center" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"last_seen_cycle" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_center_code_pk" PRIMARY KEY("center","code")
);
--> statement-breakpoint
CREATE INDEX "siiau_requests_started_at_idx" ON "siiau_requests" USING btree ("started_at");--> statement-breakpoint
-- The gateway is a single row; create it with the table.
INSERT INTO "siiau_gateway" ("id") VALUES (1) ON CONFLICT DO NOTHING;
