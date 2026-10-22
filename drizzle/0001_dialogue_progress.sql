CREATE TABLE `dialogue_progress` (
	`user_id` text NOT NULL,
	`dialogue_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `dialogue_id`),
	CONSTRAINT "dialogue_progress_status_check" CHECK("dialogue_progress"."status" IN ('listened', 'revisit', 'understood'))
);
