CREATE TABLE `dietary_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`ingredient_code` text NOT NULL,
	`ingredient_name` text NOT NULL,
	`rule_type` text NOT NULL,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
