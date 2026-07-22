CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`ingredient_code` text NOT NULL,
	`ingredient_name` text NOT NULL,
	`quantity_value` text NOT NULL,
	`unit_code` text NOT NULL,
	`quantity_g` text,
	`optional` integer DEFAULT false NOT NULL,
	`raw_text` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_sources` (
	`recipe_id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text,
	`source_license` text,
	`parser_version` text,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`step_no` integer NOT NULL,
	`instruction` text NOT NULL,
	`timer_seconds` integer,
	`ingredient_codes_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`ingredient_code` text NOT NULL,
	`ingredient_name` text NOT NULL,
	`required_quantity_g` text DEFAULT '0' NOT NULL,
	`inventory_quantity_g` text DEFAULT '0' NOT NULL,
	`quantity_g` text NOT NULL,
	`unit_code` text DEFAULT 'g' NOT NULL,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`user_quantity_override_g` text,
	`needs_review` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
