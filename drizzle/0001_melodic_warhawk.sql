CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_life_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`occurred_at` text NOT NULL,
	`location_name` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`category` text DEFAULT 'growth' NOT NULL,
	`status` text DEFAULT 'memory' NOT NULL,
	`mood` integer DEFAULT 4 NOT NULL,
	`significance` integer DEFAULT 3 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`lessons` text DEFAULT '' NOT NULL,
	`people` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`track_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `life_tracks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_life_entries`("id", "title", "occurred_at", "location_name", "latitude", "longitude", "category", "status", "mood", "significance", "summary", "detail", "lessons", "people", "tags", "track_id", "created_at") SELECT "id", "title", "occurred_at", "location_name", "latitude", "longitude", "category", "status", "mood", "significance", "summary", "detail", "lessons", "people", "tags", "track_id", "created_at" FROM `life_entries`;--> statement-breakpoint
DROP TABLE `life_entries`;--> statement-breakpoint
ALTER TABLE `__new_life_entries` RENAME TO `life_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_entries_occurred_at` ON `life_entries` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_entries_track_id` ON `life_entries` (`track_id`);--> statement-breakpoint
CREATE INDEX `idx_tracks_status_order` ON `life_tracks` (`status`,`sort_order`);