CREATE TABLE `vocabulary_progress` (
	`user_id` text NOT NULL,
	`term` text NOT NULL,
	`mastered` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `term`)
);
