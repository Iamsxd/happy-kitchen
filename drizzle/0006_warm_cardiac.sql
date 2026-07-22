CREATE TABLE `household_account_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`member_id` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_account_memberships_user_id_unique` ON `household_account_memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `household_memberships_household_idx` ON `household_account_memberships` (`household_id`,`active`);--> statement-breakpoint
CREATE TABLE `household_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invitations_code_hash_unique` ON `household_invitations` (`code_hash`);--> statement-breakpoint
CREATE INDEX `household_invitations_household_idx` ON `household_invitations` (`household_id`,`status`,`expires_at`);