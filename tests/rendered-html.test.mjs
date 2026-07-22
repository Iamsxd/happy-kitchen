import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const file = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("defines the authenticated Happy Kitchen application shell", async () => {
  const [page, portal, app, admin, layout] = await Promise.all([
    file("app/page.tsx"), file("app/AuthPortal.tsx"), file("app/HappyKitchenApp.tsx"), file("app/admin/AdminDashboard.tsx"), file("app/layout.tsx"),
  ]);
  assert.match(page, /<AuthPortal/);
  assert.match(page, /<HappyKitchenApp/);
  assert.match(portal, /inviteCode/);
  assert.match(portal, /管理员/);
  assert.match(app, /CREATE_HOUSEHOLD_INVITE/);
  assert.match(app, /REMOVE_HOUSEHOLD_ACCOUNT/);
  assert.match(admin, /ADMIN/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(`${page}${portal}${app}${layout}`, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("stores password hashes and protects cookie based sessions", async () => {
  const [auth, register, login, adminRoute] = await Promise.all([
    file("app/auth.ts"), file("app/api/auth/register/route.ts"), file("app/api/auth/login/route.ts"), file("app/api/admin/users/route.ts"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /100_000/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(auth, /Priority=High/);
  assert.match(register, /password_hash/);
  assert.doesNotMatch(register, /INSERT INTO auth_users[^\n]*password[,)]/);
  assert.match(register, /joinHouseholdByInvite/);
  assert.match(login, /verifyPassword/);
  assert.match(adminRoute, /role !== "ADMIN"/);
});

test("ships a Node.js and SQLite self-hosted deployment with defense in depth", async () => {
  const [manifest, packageJson, nextConfig, dockerfile, compose, runtime, guide, env] = await Promise.all([
    file("public/manifest.webmanifest"), file("package.json"), file("next.config.ts"), file("Dockerfile"), file("docker-compose.yml"), file("db/runtime.ts"), file("docs/NAS与Unraid部署安全方案_v0.1.md"), file(".env.example"),
  ]);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(packageJson, /"next build"/);
  assert.match(packageJson, /better-sqlite3/);
  assert.match(nextConfig, /output: "standalone"/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /Cache-Control.*no-store/);
  assert.match(dockerfile, /node:22-bookworm-slim/);
  assert.match(dockerfile, /USER 10001:10001/);
  assert.match(compose, /127\.0\.0\.1/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop/);
  assert.match(runtime, /better-sqlite3/);
  assert.match(runtime, /DATABASE_PATH/);
  assert.match(guide, /Docker Compose/);
  assert.match(guide, /Tailscale Serve/);
  assert.match(env, /APPDATA_PATH/);
  await access(new URL("../deploy/unraid/backup.sh", import.meta.url));
  await access(new URL("../deploy/unraid/restore.sh", import.meta.url));
  await assert.rejects(access(new URL("../worker/index.ts", import.meta.url)));
  await assert.rejects(access(new URL("../.openai/hosting.json", import.meta.url)));
});

test("supports a single shared household with individual adult accounts", async () => {
  const [bootstrap, schema, state, actions, migration, chatgpt] = await Promise.all([
    file("db/bootstrap.ts"), file("db/schema.ts"), file("app/api/state/route.ts"), file("app/api/actions/route.ts"), file("drizzle/0006_warm_cardiac.sql"), file("app/chatgpt-auth.ts"),
  ]);
  assert.match(bootstrap, /household_account_memberships/);
  assert.match(bootstrap, /household_invitations/);
  assert.match(bootstrap, /createHouseholdInvite/);
  assert.match(bootstrap, /joinHouseholdByInvite/);
  assert.match(bootstrap, /removeHouseholdAccount/);
  assert.match(schema, /householdAccountMemberships/);
  assert.match(schema, /householdInvitations/);
  assert.match(state, /accountMembers/);
  assert.match(state, /access:/);
  assert.match(actions, /CREATE_HOUSEHOLD_INVITE/);
  assert.match(actions, /REMOVE_HOUSEHOLD_ACCOUNT/);
  assert.match(migration, /household_account_memberships/);
  assert.match(migration, /household_invitations/);
  assert.match(chatgpt, /ENABLE_CHATGPT_LOGIN/);
});

test("supports detailed recipes, full HowToCook learning and practical shopping purchases", async () => {
  const [app, actions, state, kitchen, importer, howToCookApi, catalogText, styles, migration] = await Promise.all([
    file("app/HappyKitchenApp.tsx"), file("app/api/actions/route.ts"), file("app/api/state/route.ts"), file("db/kitchen.ts"), file("app/howtocook-import.ts"), file("app/api/howtocook/route.ts"), file("data/howtocook-catalog.json"), file("app/globals.css"), file("drizzle/0002_glorious_charles_xavier.sql"),
  ]);
  assert.match(app, /IMPORT_HOWTOCOOK/);
  assert.match(app, /ingredientsDetailed/);
  assert.match(app, /PURCHASE_SHOPPING_ITEM/);
  assert.match(app, /actualQuantity/);
  assert.match(app, /LearningView/);
  assert.match(actions, /saveRecipeDetails/);
  assert.match(actions, /synchronizeShoppingList/);
  assert.match(state, /shopping_list_items/);
  assert.match(kitchen, /required - available/);
  assert.match(importer, /parseLearningArticle/);
  assert.match(howToCookApi, /listHowToCookRecipes/);
  const catalog = JSON.parse(catalogText);
  assert.equal(catalog.source, "Anduin2017/HowToCook");
  assert.equal(catalog.license, "Unlicense");
  assert.equal(catalog.recipes.length, 368);
  assert.equal(catalog.learning.length, 18);
  assert.match(styles, /modal:has\(\.recipe-detail\)/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(migration, /CREATE TABLE `recipe_steps`/);
  assert.match(migration, /CREATE TABLE `shopping_list_items`/);
});

test("supports nutrition profiles, hard dietary rules and editable meal plans", async () => {
  const [app, actions, state, recommendation, nutrition, schema, bootstrap, migration] = await Promise.all([
    file("app/HappyKitchenApp.tsx"), file("app/api/actions/route.ts"), file("app/api/state/route.ts"), file("db/recommendation.ts"), file("app/nutrition.ts"), file("db/schema.ts"), file("db/bootstrap.ts"), file("drizzle/0003_serious_scarecrow.sql"),
  ]);
  assert.match(app, /DietaryRuleForm/);
  assert.match(app, /PlanItemForm/);
  assert.match(app, /GENERATE_WEEK_PLAN/);
  assert.match(app, /weekly-planner/);
  assert.match(actions, /ADD_DIETARY_RULE/);
  assert.match(actions, /SET_PLAN_ITEM/);
  assert.match(actions, /TOGGLE_PLAN_LOCK/);
  assert.match(actions, /BREAKFAST/);
  assert.match(actions, /SNACK/);
  assert.match(actions, /assertRecipeAllowed/);
  assert.match(state, /dietary_rules/);
  assert.match(recommendation, /rule_type === "ALLERGY"/);
  assert.match(recommendation, /rule_type === "AVOID"/);
  assert.match(nutrition, /estimateRecipeNutrition/);
  assert.match(schema, /dietaryRules/);
  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS dietary_rules/);
  assert.match(migration, /CREATE TABLE `dietary_rules`/);
});
