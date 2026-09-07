CREATE TABLE `life_goal_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`from_goal_id` text NOT NULL,
	`to_goal_id` text NOT NULL,
	`relation` text DEFAULT 'depends' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`from_goal_id`) REFERENCES `life_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_goal_id`) REFERENCES `life_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_goal_edges_from` ON `life_goal_edges` (`from_goal_id`);--> statement-breakpoint
CREATE INDEX `idx_goal_edges_to` ON `life_goal_edges` (`to_goal_id`);--> statement-breakpoint
CREATE TABLE `life_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`target_date` text NOT NULL,
	`start_date` text NOT NULL,
	`domain` text DEFAULT 'career' NOT NULL,
	`node_type` text DEFAULT 'goal' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`track_id` text,
	`linked_entry_id` text,
	`location_name` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `life_tracks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_entry_id`) REFERENCES `life_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_goals_domain_target` ON `life_goals` (`domain`,`target_date`);--> statement-breakpoint
CREATE INDEX `idx_goals_track_id` ON `life_goals` (`track_id`);--> statement-breakpoint
CREATE TABLE `life_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`birth_date` text NOT NULL,
	`birth_city` text DEFAULT '' NOT NULL,
	`current_city` text DEFAULT '' NOT NULL,
	`identity` text DEFAULT '' NOT NULL,
	`planning_age` integer DEFAULT 80 NOT NULL,
	`values` text DEFAULT '[]' NOT NULL,
	`avatar_symbol` text DEFAULT '星' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
