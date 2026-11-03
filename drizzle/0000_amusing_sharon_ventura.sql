CREATE TABLE `operations_events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operations_events_date` ON `operations_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `operations_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`steps` text NOT NULL,
	`contact` text NOT NULL,
	`page` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_feedback_submission_id_unique` ON `operations_feedback` (`submission_id`);--> statement-breakpoint
CREATE INDEX `operations_feedback_date` ON `operations_feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `operations_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operations_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`action` text NOT NULL,
	`status` integer NOT NULL,
	`created_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`rag_attempted` integer DEFAULT 0 NOT NULL,
	`rag_matched` integer DEFAULT 0 NOT NULL,
	`retrieval_mode` text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operations_requests_date` ON `operations_requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `operations_visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL
);
