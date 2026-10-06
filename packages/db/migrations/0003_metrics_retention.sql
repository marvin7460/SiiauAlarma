ALTER TABLE "metrics_daily" ADD COLUMN "searches" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");