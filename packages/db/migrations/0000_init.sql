CREATE TABLE `login_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`next` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE INDEX `login_tokens_email_idx` ON `login_tokens` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_success_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `telegram_link_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `telegram_link_tokens_user_id_idx` ON `telegram_link_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_notifications` integer DEFAULT true NOT NULL,
	`telegram_chat_id` integer,
	`telegram_linked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_chat_id_unique` ON `users` (`telegram_chat_id`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`watched_subject_id` text NOT NULL,
	`kind` text NOT NULL,
	`nrc` text,
	`filters` text DEFAULT '{}' NOT NULL,
	`channels` text DEFAULT '["email"]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`last_notified_at` integer,
	`first_notified_at` integer,
	`notify_count` integer DEFAULT 0 NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watched_subject_id`) REFERENCES `watched_subjects`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `alerts_watched_subject_status_idx` ON `alerts` (`watched_subject_id`,`status`);--> statement-breakpoint
CREATE INDEX `alerts_user_id_idx` ON `alerts` (`user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alert_id` text NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_status_next_attempt_idx` ON `notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notifications_created_at_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_alert_id_idx` ON `notifications` (`alert_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_id_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `registration_windows` (
	`cycle` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seat_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watched_subject_id` text NOT NULL,
	`kind` text NOT NULL,
	`nrc` text,
	`available_before` integer,
	`available_after` integer,
	`occurred_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`watched_subject_id`) REFERENCES `watched_subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seat_events_occurred_at_idx` ON `seat_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `section_states` (
	`watched_subject_id` text NOT NULL,
	`nrc` text NOT NULL,
	`available` integer NOT NULL,
	`capacity` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`watched_subject_id`, `nrc`),
	FOREIGN KEY (`watched_subject_id`) REFERENCES `watched_subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watched_subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle` text NOT NULL,
	`center` text NOT NULL,
	`subject_code` text NOT NULL,
	`subject_name` text,
	`published` integer,
	`next_poll_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_polled_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`last_error_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watched_subjects_key` ON `watched_subjects` (`cycle`,`center`,`subject_code`);--> statement-breakpoint
CREATE INDEX `watched_subjects_next_poll_at_idx` ON `watched_subjects` (`next_poll_at`);--> statement-breakpoint
CREATE TABLE `metrics_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`alerts_created` integer DEFAULT 0 NOT NULL,
	`seats_opened` integer DEFAULT 0 NOT NULL,
	`emails_sent` integer DEFAULT 0 NOT NULL,
	`telegram_sent` integer DEFAULT 0 NOT NULL,
	`push_sent` integer DEFAULT 0 NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offer_snapshots` (
	`cycle` text NOT NULL,
	`center` text NOT NULL,
	`query_kind` text NOT NULL,
	`query_value` text NOT NULL,
	`fetched_at` integer,
	`total_records` integer,
	`sections` text,
	`last_error` text,
	`last_error_at` integer,
	PRIMARY KEY(`cycle`, `center`, `query_kind`, `query_value`)
);
--> statement-breakpoint
CREATE TABLE `poller_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`last_run_started_at` integer,
	`last_run_finished_at` integer,
	`last_run_subjects` integer DEFAULT 0 NOT NULL,
	`last_run_notifications` integer DEFAULT 0 NOT NULL,
	`last_run_error` text,
	CONSTRAINT "poller_state_singleton" CHECK("poller_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `siiau_gateway` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`last_request_finished_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`trips` integer DEFAULT 0 NOT NULL,
	`paused_until` integer,
	`pause_reason` text,
	`robots_txt` text,
	`robots_status` integer,
	`robots_fetched_at` integer,
	CONSTRAINT "siiau_gateway_singleton" CHECK("siiau_gateway"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `siiau_options` (
	`kind` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`kind`, `code`)
);
--> statement-breakpoint
CREATE TABLE `siiau_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`purpose` text NOT NULL,
	`path` text NOT NULL,
	`status` integer,
	`outcome` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `siiau_requests_started_at_idx` ON `siiau_requests` (`started_at`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`center` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`last_seen_cycle` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`center`, `code`)
);
