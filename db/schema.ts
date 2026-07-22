import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const authUsers = sqliteTable("auth_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordSalt: text("password_salt"),
  passwordHash: text("password_hash"),
  passwordIterations: integer("password_iterations"),
  authProvider: text("auth_provider").notNull().default("PASSWORD"),
  role: text("role").notNull().default("USER"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
});

export const authLoginAttempts = sqliteTable("auth_login_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  lastAttemptAt: text("last_attempt_at").notNull(),
}, (table) => [index("auth_login_attempts_last_attempt_idx").on(table.lastAttemptAt)]);

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  createdAt: text("created_at").notNull(),
});

export const householdAccountMemberships = sqliteTable("household_account_memberships", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  userId: text("user_id").notNull().unique(),
  memberId: text("member_id").notNull(),
  role: text("role").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
}, (table) => [index("household_memberships_household_idx").on(table.householdId, table.active)]);

export const householdInvitations = sqliteTable("household_invitations", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  codeHash: text("code_hash").notNull().unique(),
  createdByUserId: text("created_by_user_id").notNull(),
  role: text("role").notNull().default("MEMBER"),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("household_invitations_household_idx").on(table.householdId, table.status, table.expiresAt)]);

export const householdMembers = sqliteTable("household_members", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  memberType: text("member_type").notNull(),
  avatarSeed: text("avatar_seed").notNull(),
  timezone: text("timezone").notNull(),
  personalStatus: text("personal_status").notNull().default("ACTIVE"),
  mealParticipationJson: text("meal_participation_json").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const nutritionProfileVersions = sqliteTable("nutrition_profile_versions", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  versionNo: integer("version_no").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  sourceType: text("source_type").notNull(),
  targetsJson: text("targets_json").notNull(),
  mealSplitJson: text("meal_split_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const dietaryRules = sqliteTable("dietary_rules", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  memberId: text("member_id").notNull(),
  ingredientCode: text("ingredient_code").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  ruleType: text("rule_type").notNull(),
  note: text("note"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  emoji: text("emoji").notNull(),
  cookMinutes: integer("cook_minutes").notNull(),
  servings: text("servings").notNull(),
  cuisineCode: text("cuisine_code").notNull(),
  completenessStatus: text("completeness_status").notNull(),
  verificationStatus: text("verification_status").notNull(),
  ingredientsJson: text("ingredients_json").notNull(),
  nutritionJson: text("nutrition_json").notNull(),
  tagsJson: text("tags_json").notNull(),
  versionNo: integer("version_no").notNull().default(1),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull(),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  sortOrder: integer("sort_order").notNull(),
  ingredientCode: text("ingredient_code").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  quantityValue: text("quantity_value").notNull(),
  unitCode: text("unit_code").notNull(),
  quantityG: text("quantity_g"),
  optional: integer("optional", { mode: "boolean" }).notNull().default(false),
  rawText: text("raw_text").notNull(),
});

export const recipeSteps = sqliteTable("recipe_steps", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  stepNo: integer("step_no").notNull(),
  instruction: text("instruction").notNull(),
  timerSeconds: integer("timer_seconds"),
  ingredientCodesJson: text("ingredient_codes_json").notNull().default("[]"),
});

export const recipeSources = sqliteTable("recipe_sources", {
  recipeId: text("recipe_id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  sourceLicense: text("source_license"),
  parserVersion: text("parser_version"),
  importedAt: text("imported_at").notNull(),
});

export const inventoryLots = sqliteTable("inventory_lots", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  ingredientCode: text("ingredient_code").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  emoji: text("emoji").notNull(),
  category: text("category").notNull(),
  location: text("location").notNull(),
  initialQuantityG: text("initial_quantity_g").notNull(),
  currentQuantityG: text("current_quantity_g").notNull(),
  reservedQuantityG: text("reserved_quantity_g").notNull().default("0"),
  bestBeforeAt: text("best_before_at"),
  useByAt: text("use_by_at"),
  openedAt: text("opened_at"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull(),
});

export const inventoryTransactions = sqliteTable("inventory_transactions", {
  id: text("id").primaryKey(),
  lotId: text("lot_id").notNull(),
  type: text("transaction_type").notNull(),
  quantityDeltaG: text("quantity_delta_g").notNull(),
  quantityAfterG: text("quantity_after_g").notNull(),
  reasonCode: text("reason_code"),
  actorEmail: text("actor_email").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const mealPlanItems = sqliteTable("meal_plan_items", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  mealDate: text("meal_date").notNull(),
  mealType: text("meal_type").notNull(),
  recipeId: text("recipe_id").notNull(),
  state: text("state").notNull(),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  totalServings: text("total_servings").notNull(),
  participantsJson: text("participants_json").notNull(),
  explanationJson: text("explanation_json").notNull(),
  revision: integer("revision").notNull().default(1),
});

export const appEvents = sqliteTable("app_events", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  actorEmail: text("actor_email").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const shoppingListItems = sqliteTable("shopping_list_items", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  ingredientCode: text("ingredient_code").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  requiredQuantityG: text("required_quantity_g").notNull().default("0"),
  inventoryQuantityG: text("inventory_quantity_g").notNull().default("0"),
  quantityG: text("quantity_g").notNull(),
  unitCode: text("unit_code").notNull().default("g"),
  sourceType: text("source_type").notNull(),
  status: text("status").notNull().default("OPEN"),
  userQuantityOverrideG: text("user_quantity_override_g"),
  needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
