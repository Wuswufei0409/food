CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`restaurants` text NOT NULL,
	`message` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `answers_created_at` ON `answers` (`created_at`);--> statement-breakpoint
CREATE INDEX `answers_session_id` ON `answers` (`session_id`);