import { env } from "./runtime";
import { saveRecipeDetails } from "./kitchen";
import type { AppDatabase, AppPreparedStatement } from "./types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS auth_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_salt TEXT, password_hash TEXT, password_iterations INTEGER, auth_provider TEXT NOT NULL DEFAULT 'PASSWORD', role TEXT NOT NULL DEFAULT 'USER', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS auth_login_attempts (attempt_key TEXT PRIMARY KEY, failed_count INTEGER NOT NULL DEFAULT 0, window_started_at TEXT NOT NULL, last_attempt_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS household_account_memberships (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, user_id TEXT NOT NULL UNIQUE, member_id TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS household_invitations (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, created_by_user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'MEMBER', max_uses INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS household_members (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, member_type TEXT NOT NULL, avatar_seed TEXT NOT NULL, timezone TEXT NOT NULL, personal_status TEXT NOT NULL DEFAULT 'ACTIVE', meal_participation_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS nutrition_profile_versions (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, version_no INTEGER NOT NULL, effective_from TEXT NOT NULL, source_type TEXT NOT NULL, targets_json TEXT NOT NULL, meal_split_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dietary_rules (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, member_id TEXT NOT NULL, ingredient_code TEXT NOT NULL, ingredient_name TEXT NOT NULL, rule_type TEXT NOT NULL, note TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, emoji TEXT NOT NULL, cook_minutes INTEGER NOT NULL, servings TEXT NOT NULL, cuisine_code TEXT NOT NULL, completeness_status TEXT NOT NULL, verification_status TEXT NOT NULL, ingredients_json TEXT NOT NULL, nutrition_json TEXT NOT NULL, tags_json TEXT NOT NULL, version_no INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS recipe_ingredients (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, sort_order INTEGER NOT NULL, ingredient_code TEXT NOT NULL, ingredient_name TEXT NOT NULL, quantity_value TEXT NOT NULL, unit_code TEXT NOT NULL, quantity_g TEXT, optional INTEGER NOT NULL DEFAULT 0, raw_text TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS recipe_steps (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, step_no INTEGER NOT NULL, instruction TEXT NOT NULL, timer_seconds INTEGER, ingredient_codes_json TEXT NOT NULL DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS recipe_sources (recipe_id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_name TEXT NOT NULL, source_url TEXT, source_license TEXT, parser_version TEXT, imported_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inventory_lots (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, ingredient_code TEXT NOT NULL, ingredient_name TEXT NOT NULL, emoji TEXT NOT NULL, category TEXT NOT NULL, location TEXT NOT NULL, initial_quantity_g TEXT NOT NULL, current_quantity_g TEXT NOT NULL, reserved_quantity_g TEXT NOT NULL DEFAULT '0', best_before_at TEXT, use_by_at TEXT, opened_at TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inventory_transactions (id TEXT PRIMARY KEY, lot_id TEXT NOT NULL, transaction_type TEXT NOT NULL, quantity_delta_g TEXT NOT NULL, quantity_after_g TEXT NOT NULL, reason_code TEXT, actor_email TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meal_plan_items (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, meal_date TEXT NOT NULL, meal_type TEXT NOT NULL, recipe_id TEXT NOT NULL, state TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0, total_servings TEXT NOT NULL, participants_json TEXT NOT NULL, explanation_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS app_events (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, actor_email TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS shopping_list_items (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, ingredient_code TEXT NOT NULL, ingredient_name TEXT NOT NULL, required_quantity_g TEXT NOT NULL DEFAULT '0', inventory_quantity_g TEXT NOT NULL DEFAULT '0', quantity_g TEXT NOT NULL, unit_code TEXT NOT NULL DEFAULT 'g', source_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', user_quantity_override_g TEXT, needs_review INTEGER NOT NULL DEFAULT 0, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS inventory_household_expiry_idx ON inventory_lots(household_id, best_before_at)`,
  `CREATE INDEX IF NOT EXISTS plan_household_date_idx ON meal_plan_items(household_id, meal_date)`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_token_idx ON auth_sessions(token_hash, expires_at)`,
  `CREATE INDEX IF NOT EXISTS auth_login_attempts_last_attempt_idx ON auth_login_attempts(last_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS household_memberships_household_idx ON household_account_memberships(household_id, active)`,
  `CREATE INDEX IF NOT EXISTS household_invitations_household_idx ON household_invitations(household_id, status, expires_at)`,
  `CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON recipe_ingredients(recipe_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS recipe_steps_recipe_idx ON recipe_steps(recipe_id, step_no)`,
  `CREATE INDEX IF NOT EXISTS dietary_rules_household_idx ON dietary_rules(household_id, member_id, active)`,
  `CREATE INDEX IF NOT EXISTS shopping_household_status_idx ON shopping_list_items(household_id, status)`,
];

export type HouseholdMembership = { id: string; household_id: string; user_id: string; member_id: string; role: "OWNER" | "MEMBER"; active: number };

export async function ensureSchema() {
  const db = env.DB;
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  return db;
}

export async function getHouseholdMembership(accountId: string): Promise<HouseholdMembership | null> {
  const db = await ensureSchema();
  const userId = normaliseAccountId(accountId);
  return db.prepare("SELECT id,household_id,user_id,member_id,role,active FROM household_account_memberships WHERE user_id=? AND active=1 LIMIT 1")
    .bind(userId).first<HouseholdMembership>();
}

export async function ensureDatabase(accountId: string, displayName?: string) {
  const db = await ensureSchema();
  const userId = normaliseAccountId(accountId);
  const membership = await getHouseholdMembership(userId);
  if (membership) return membership.household_id;

  const legacy = await db.prepare("SELECT id FROM households WHERE owner_email=? LIMIT 1").bind(`account:${userId}`).first<{ id: string }>();
  if (legacy) {
    const owner = await db.prepare("SELECT id FROM household_members WHERE household_id=? AND role='OWNER' ORDER BY id LIMIT 1").bind(legacy.id).first<{ id: string }>();
    const memberId = owner?.id ?? `${legacy.id}-owner-${userId}`;
    const now = new Date().toISOString();
    const writes: AppPreparedStatement[] = [];
    if (!owner) writes.push(db.prepare("INSERT INTO household_members (id,household_id,name,role,member_type,avatar_seed,timezone,personal_status,meal_participation_json,active) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,1)")
      .bind(memberId, legacy.id, displayName || "家庭所有者", "OWNER", "ADULT", displayName || "owner", "Asia/Shanghai", JSON.stringify(defaultParticipation())));
    writes.push(db.prepare("INSERT OR IGNORE INTO household_account_memberships (id,household_id,user_id,member_id,role,active,created_at) VALUES (?,?,?,?, 'OWNER',1,?)")
      .bind(crypto.randomUUID(), legacy.id, userId, memberId, now));
    await db.batch(writes);
    return legacy.id;
  }

  const householdId = `home-${crypto.randomUUID()}`;
  const memberId = `${householdId}-owner`;
  const now = new Date().toISOString();
  const writes: AppPreparedStatement[] = [
    db.prepare("INSERT INTO households (id,name,owner_email,timezone,created_at) VALUES (?,?,?,?,?)").bind(householdId, "我的家庭", `account:${userId}`, "Asia/Shanghai", now),
    db.prepare("INSERT INTO household_members (id,household_id,name,role,member_type,avatar_seed,timezone,personal_status,meal_participation_json,active) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,1)")
      .bind(memberId, householdId, displayName || "我", "OWNER", "ADULT", displayName || "owner", "Asia/Shanghai", JSON.stringify(defaultParticipation())),
    db.prepare("INSERT INTO household_account_memberships (id,household_id,user_id,member_id,role,active,created_at) VALUES (?,?,?,?, 'OWNER',1,?)")
      .bind(crypto.randomUUID(), householdId, userId, memberId, now),
    db.prepare("INSERT INTO nutrition_profile_versions (id,member_id,version_no,effective_from,source_type,targets_json,meal_split_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(`${memberId}-profile-1`, memberId, 1, now.slice(0, 10), "MANUAL", JSON.stringify({ energy: 2000, protein: 90, fiber: 25 }), JSON.stringify(defaultMealSplit()), now),
    db.prepare("INSERT INTO inventory_lots (id,household_id,ingredient_code,ingredient_name,emoji,category,location,initial_quantity_g,current_quantity_g,reserved_quantity_g,best_before_at,use_by_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'0',?,NULL,'ACTIVE',?)")
      .bind(`${householdId}-lot-tomato`, householdId, "tomato", "西红柿", "🍅", "蔬菜", "冷藏室", "500", "500", dateString(new Date(), 5), now),
    db.prepare("INSERT INTO inventory_lots (id,household_id,ingredient_code,ingredient_name,emoji,category,location,initial_quantity_g,current_quantity_g,reserved_quantity_g,best_before_at,use_by_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'0',?,NULL,'ACTIVE',?)")
      .bind(`${householdId}-lot-egg`, householdId, "egg", "鸡蛋", "🥚", "蛋奶", "冷藏室", "300", "300", dateString(new Date(), 10), now),
  ];
  await db.batch(writes);
  await seedStarterRecipe(db, householdId);
  return householdId;
}

export async function createHouseholdInvite(accountId: string, maxUses = 1) {
  const membership = await getHouseholdMembership(accountId);
  if (!membership || membership.role !== "OWNER") throw new Error("只有家庭所有者可以创建邀请码");
  const db = await ensureSchema();
  const code = `HK-${randomCode(12)}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  await db.prepare("INSERT INTO household_invitations (id,household_id,code_hash,created_by_user_id,role,max_uses,uses,expires_at,status,created_at) VALUES (?,?,?,?, 'MEMBER',?,0,?,'ACTIVE',?)")
    .bind(crypto.randomUUID(), membership.household_id, await sha256(code), membership.user_id, Math.max(1, Math.min(10, Math.floor(maxUses))), expires.toISOString(), now.toISOString()).run();
  return { code, expiresAt: expires.toISOString() };
}

export async function joinHouseholdByInvite(accountId: string, displayName: string, inviteCode: string) {
  const userId = normaliseAccountId(accountId);
  if (await getHouseholdMembership(userId)) throw new Error("该账号已经属于一个家庭");
  const db = await ensureSchema();
  const codeHash = await sha256(normaliseInviteCode(inviteCode));
  const invitation = await db.prepare("SELECT household_id FROM household_invitations WHERE code_hash=? LIMIT 1").bind(codeHash).first<{ household_id: string }>();
  const now = new Date().toISOString();
  const memberId = `${invitation?.household_id ?? "invite"}-account-${crypto.randomUUID()}`;
  const inviteIsUsable = "code_hash=? AND status='ACTIVE' AND uses<max_uses AND expires_at>?";
  const results = await db.batch([
    db.prepare(`INSERT INTO household_members (id,household_id,name,role,member_type,avatar_seed,timezone,personal_status,meal_participation_json,active) SELECT ?,household_id,?,'MEMBER','ADULT',?,'Asia/Shanghai','ACTIVE',?,1 FROM household_invitations WHERE ${inviteIsUsable}`)
      .bind(memberId, displayName, displayName, JSON.stringify(defaultParticipation()), codeHash, now),
    db.prepare(`INSERT INTO household_account_memberships (id,household_id,user_id,member_id,role,active,created_at) SELECT ?,household_id,?,?,'MEMBER',1,? FROM household_invitations WHERE ${inviteIsUsable}`)
      .bind(crypto.randomUUID(), userId, memberId, now, codeHash, now),
    db.prepare(`INSERT INTO nutrition_profile_versions (id,member_id,version_no,effective_from,source_type,targets_json,meal_split_json,created_at) SELECT ?,?,1,?,'MANUAL',?,?,? FROM household_invitations WHERE ${inviteIsUsable}`)
      .bind(`${memberId}-profile-1`, memberId, now.slice(0, 10), JSON.stringify({ energy: 2000, protein: 90, fiber: 25 }), JSON.stringify(defaultMealSplit()), now, codeHash, now),
    db.prepare(`UPDATE household_invitations SET uses=uses+1,status=CASE WHEN uses+1>=max_uses THEN 'USED' ELSE status END WHERE ${inviteIsUsable}`)
      .bind(codeHash, now),
  ]);
  if (results[0]?.meta.changes !== 1 || !invitation) throw new Error("邀请码无效、已过期或已被使用");
  return invitation.household_id;
}

export async function removeHouseholdAccount(actorAccountId: string, targetUserId: string) {
  const actor = await getHouseholdMembership(actorAccountId);
  if (!actor || actor.role !== "OWNER") throw new Error("只有家庭所有者可以移除账号成员");
  const db = await ensureSchema();
  const target = await db.prepare("SELECT * FROM household_account_memberships WHERE user_id=? AND household_id=? AND active=1 LIMIT 1").bind(targetUserId, actor.household_id).first<HouseholdMembership>();
  if (!target) throw new Error("未找到该家庭账号成员");
  if (target.user_id === actor.user_id || target.role === "OWNER") throw new Error("不能移除家庭所有者");
  await db.batch([
    db.prepare("UPDATE household_account_memberships SET active=0 WHERE id=?").bind(target.id),
    db.prepare("UPDATE household_members SET active=0 WHERE id=?").bind(target.member_id),
  ]);
}

async function seedStarterRecipe(db: AppDatabase, householdId: string) {
  const id = `${householdId}-recipe-tomato-egg`;
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO recipes (id,household_id,title,description,emoji,cook_minutes,servings,cuisine_code,completeness_status,verification_status,ingredients_json,nutrition_json,tags_json,version_no,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'ACTIVE',?)")
    .bind(id, householdId, "西红柿炒鸡蛋", "简单可靠的家庭入门菜。", "🍅", 15, "2", "CHINESE", "COMPLETE", "DEMO_VERIFIED", JSON.stringify([{ code: "tomato", name: "西红柿", grams: 300 }, { code: "egg", name: "鸡蛋", grams: 150 }, { code: "cooking-oil", name: "食用油", grams: 15 }]), JSON.stringify({ energy: 360, protein: 22, fiber: 3, fat: 24, carbs: 12 }), JSON.stringify(["家常", "快手"]), now).run();
  await saveRecipeDetails(db, id,
    [{ code: "tomato", name: "西红柿", quantity: 300, unit: "g", grams: 300 }, { code: "egg", name: "鸡蛋", quantity: 3, unit: "个", grams: 150 }, { code: "cooking-oil", name: "食用油", quantity: 15, unit: "g", grams: 15 }],
    [{ instruction: "西红柿洗净切块，鸡蛋打散。" }, { instruction: "热锅加油，炒熟鸡蛋后盛出。", timerSeconds: 90 }, { instruction: "炒软西红柿，放回鸡蛋调味后出锅。", timerSeconds: 180 }],
    { type: "DEMO", name: "快乐厨房示例菜谱", parserVersion: "selfhost-v1" });
}

function normaliseAccountId(value: string) { return value.replace(/^account:/, ""); }
function normaliseInviteCode(value: string) { return value.trim().toUpperCase().replace(/\s+/g, ""); }
function defaultParticipation() { return { breakfast: true, lunch: true, dinner: true, snack: false }; }
function defaultMealSplit() { return { breakfast: .25, lunch: .35, dinner: .35, snack: .05 }; }
export function dateString(date: Date, offsetDays: number) { const copy = new Date(date); copy.setDate(copy.getDate() + offsetDays); return copy.toISOString().slice(0, 10); }
function randomCode(length: number) { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const bytes = crypto.getRandomValues(new Uint8Array(length)); return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join(""); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
