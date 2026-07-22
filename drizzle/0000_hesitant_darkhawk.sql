CREATE TABLE `app_events` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`actor_email` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`member_type` text NOT NULL,
	`avatar_seed` text NOT NULL,
	`timezone` text NOT NULL,
	`personal_status` text DEFAULT 'ACTIVE' NOT NULL,
	`meal_participation_json` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_email` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`ingredient_code` text NOT NULL,
	`ingredient_name` text NOT NULL,
	`emoji` text NOT NULL,
	`category` text NOT NULL,
	`location` text NOT NULL,
	`initial_quantity_g` text NOT NULL,
	`current_quantity_g` text NOT NULL,
	`reserved_quantity_g` text DEFAULT '0' NOT NULL,
	`best_before_at` text,
	`use_by_at` text,
	`opened_at` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`transaction_type` text NOT NULL,
	`quantity_delta_g` text NOT NULL,
	`quantity_after_g` text NOT NULL,
	`reason_code` text,
	`actor_email` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`meal_date` text NOT NULL,
	`meal_type` text NOT NULL,
	`recipe_id` text NOT NULL,
	`state` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`total_servings` text NOT NULL,
	`participants_json` text NOT NULL,
	`explanation_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nutrition_profile_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`effective_from` text NOT NULL,
	`source_type` text NOT NULL,
	`targets_json` text NOT NULL,
	`meal_split_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`emoji` text NOT NULL,
	`cook_minutes` integer NOT NULL,
	`servings` text NOT NULL,
	`cuisine_code` text NOT NULL,
	`completeness_status` text NOT NULL,
	`verification_status` text NOT NULL,
	`ingredients_json` text NOT NULL,
	`nutrition_json` text NOT NULL,
	`tags_json` text NOT NULL,
	`version_no` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL
);
