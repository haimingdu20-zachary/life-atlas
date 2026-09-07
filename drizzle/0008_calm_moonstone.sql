CREATE TABLE `life_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#70cfcf' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_domains_owner_order` ON `life_domains` (`owner_key`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_domains_owner_label` ON `life_domains` (`owner_key`,`label`);