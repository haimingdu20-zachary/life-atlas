CREATE TABLE `life_media` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`stage` text DEFAULT 'moment' NOT NULL,
	`captured_at` text,
	`latitude` real,
	`longitude` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `life_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_media_entry_stage` ON `life_media` (`entry_id`,`stage`);--> statement-breakpoint
ALTER TABLE `life_entries` ADD `ended_at` text;--> statement-breakpoint
ALTER TABLE `life_entries` ADD `raw_detail` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `life_entries` ADD `emotion` text DEFAULT 'calm' NOT NULL;--> statement-breakpoint
ALTER TABLE `life_entries` ADD `visibility` text DEFAULT 'private' NOT NULL;