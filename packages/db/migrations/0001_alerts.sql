CREATE TABLE "login_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"next" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"watched_subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"nrc" text,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channels" text[] DEFAULT '{email}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_notified_at" timestamp with time zone,
	"first_notified_at" timestamp with time zone,
	"notify_count" integer DEFAULT 0 NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"alert_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "registration_windows" (
	"cycle" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seat_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"watched_subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"nrc" text,
	"available_before" integer,
	"available_after" integer,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_states" (
	"watched_subject_id" uuid NOT NULL,
	"nrc" text NOT NULL,
	"available" integer NOT NULL,
	"capacity" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_states_watched_subject_id_nrc_pk" PRIMARY KEY("watched_subject_id","nrc")
);
--> statement-breakpoint
CREATE TABLE "watched_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle" text NOT NULL,
	"center" text NOT NULL,
	"subject_code" text NOT NULL,
	"subject_name" text,
	"published" boolean,
	"next_poll_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"alerts_created" integer DEFAULT 0 NOT NULL,
	"seats_opened" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"telegram_sent" integer DEFAULT 0 NOT NULL,
	"push_sent" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poller_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_run_started_at" timestamp with time zone,
	"last_run_finished_at" timestamp with time zone,
	"last_run_subjects" integer DEFAULT 0 NOT NULL,
	"last_run_notifications" integer DEFAULT 0 NOT NULL,
	"last_run_error" text,
	CONSTRAINT "poller_state_singleton" CHECK ("poller_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watched_subject_id_watched_subjects_id_fk" FOREIGN KEY ("watched_subject_id") REFERENCES "public"."watched_subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_events" ADD CONSTRAINT "seat_events_watched_subject_id_watched_subjects_id_fk" FOREIGN KEY ("watched_subject_id") REFERENCES "public"."watched_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_states" ADD CONSTRAINT "section_states_watched_subject_id_watched_subjects_id_fk" FOREIGN KEY ("watched_subject_id") REFERENCES "public"."watched_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_watched_subject_status_idx" ON "alerts" USING btree ("watched_subject_id","status");--> statement-breakpoint
CREATE INDEX "alerts_user_id_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_status_next_attempt_idx" ON "notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "seat_events_occurred_at_idx" ON "seat_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watched_subjects_key" ON "watched_subjects" USING btree ("cycle","center","subject_code");--> statement-breakpoint
CREATE INDEX "watched_subjects_next_poll_at_idx" ON "watched_subjects" USING btree ("next_poll_at");--> statement-breakpoint
-- Singleton rows, created with their tables.
INSERT INTO "poller_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 2027A registration: Monday January 11 to Friday January 15, 2027, Guadalajara time (UTC-6).
-- Add a row per cycle as the university publishes its calendar.
INSERT INTO "registration_windows" ("cycle", "label", "starts_at", "ends_at")
VALUES ('202710', 'Registro de materias 2027A', '2027-01-11T00:00:00-06:00', '2027-01-16T00:00:00-06:00')
ON CONFLICT DO NOTHING;
