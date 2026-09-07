CREATE TABLE `life_entries` (
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
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `life_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#ff9c69' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
