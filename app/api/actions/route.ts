import { env } from "../../../db/runtime";
import { createHouseholdInvite, ensureDatabase, removeHouseholdAccount } from "../../../db/bootstrap";
import type { AppPreparedStatement } from "../../../db/types";
import { normalizeIngredientCode, saveRecipeDetails, synchronizeShoppingList, type RecipeIngredientInput, type RecipeStepInput } from "../../../db/kitchen";
import { assertRecipeAllowed, planParticipants, rankRecipes } from "../../../db/recommendation";
import { estimateRecipeNutrition, isUsableNutrition } from "../../nutrition";
import { getSessionUserFromRequest } from "../../auth";
import { findHowToCookRecipe, HOW_TO_COOK_META, parseHowToCookMarkdown } from "../../howtocook-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const actorId = `account:${user.id}`;
  const householdId = await ensureDatabase(user.id, user.displayName);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求格式无效，请刷新后重试" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  try {
    if (action === "ADD_INVENTORY") return addInventory(body, householdId);
    if (action === "ADD_RECIPE") return addRecipe(body, householdId);
    if (action === "UPDATE_RECIPE") return updateRecipe(body, householdId);
    if (action === "IMPORT_HOWTOCOOK") return importHowToCook(body, householdId);
    if (action === "RECALCULATE_SHOPPING") return recalculateShopping(householdId);
    if (action === "ADD_SHOPPING_ITEM") return addShoppingItem(body, householdId);
    if (action === "TOGGLE_SHOPPING_ITEM") return toggleShoppingItem(body, householdId);
    if (action === "PURCHASE_SHOPPING_ITEM") return purchaseShoppingItem(body, householdId, actorId);
    if (action === "ADD_MEMBER") return addMember(body, householdId);
    if (action === "CREATE_HOUSEHOLD_INVITE") return createInvite(body, user.id);
    if (action === "REMOVE_HOUSEHOLD_ACCOUNT") return removeAccount(body, user.id);
    if (action === "UPDATE_MEMBER") return updateMember(body, householdId, actorId);
    if (action === "ADD_DIETARY_RULE") return addDietaryRule(body, householdId);
    if (action === "DELETE_DIETARY_RULE") return deleteDietaryRule(body, householdId);
    if (action === "RECOMMEND") return recommend(householdId);
    if (action === "SET_PLAN_ITEM") return setPlanItem(body, householdId, actorId);
    if (action === "REMOVE_PLAN_ITEM") return removePlanItem(body, householdId, actorId);
    if (action === "TOGGLE_PLAN_LOCK") return togglePlanLock(body, householdId, actorId);
    if (action === "GENERATE_WEEK_PLAN") return generateWeekPlan(body, householdId, actorId);
    if (action === "REPLACE_PLAN") return replacePlan(body, householdId, actorId);
    if (action === "COMPLETE_MEAL") return completeMeal(body, householdId, actorId);
    return Response.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 400 });
  }
}

async function createInvite(body: Record<string, unknown>, userId: string) {
  const invite = await createHouseholdInvite(userId, Number(body.maxUses ?? 1));
  return Response.json({ ok: true, invite });
}

async function removeAccount(body: Record<string, unknown>, userId: string) {
  const targetUserId = String(body.userId ?? "");
  if (!targetUserId) throw new Error("请选择要移除的账号成员");
  await removeHouseholdAccount(userId, targetUserId);
  return Response.json({ ok: true });
}

async function addInventory(body: Record<string, unknown>, householdId: string) {
  const name = String(body.name ?? "").trim();
  const quantity = Number(body.quantity ?? 0);
  if (!name || quantity <= 0) throw new Error("请填写有效的食材和重量");
  const code = normalizeIngredientCode(name);
  const id = `${householdId}-lot-${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO inventory_lots (id,household_id,ingredient_code,ingredient_name,emoji,category,location,initial_quantity_g,current_quantity_g,reserved_quantity_g,best_before_at,use_by_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'0',?,NULL,'ACTIVE',?)")
    .bind(id, householdId, code, name, String(body.emoji ?? "🥕"), String(body.category ?? "其他"), String(body.location ?? "冷藏室"), String(quantity), String(quantity), body.expiry ? String(body.expiry) : null, new Date().toISOString()).run();
  return Response.json({ ok: true, id });
}

async function addRecipe(body: Record<string, unknown>, householdId: string) {
  const title = String(body.title ?? "").trim();
  if (!title) throw new Error("请填写菜谱名称");
  const ingredients = parseRecipeIngredients(body.ingredients);
  const steps = parseRecipeSteps(body.steps, ingredients);
  if (!ingredients.length) throw new Error("请至少添加一种食材和用量");
  if (!steps.length) throw new Error("请至少添加一个操作步骤");
  const id = `${householdId}-recipe-${crypto.randomUUID()}`;
  const legacyIngredients = ingredients.map((ingredient) => ({ code: ingredient.code, name: ingredient.name, grams: ingredient.grams }));
  const complete = ingredients.every((ingredient) => ingredient.optional || (ingredient.grams != null && ingredient.grams > 0));
  const nutrition = resolveRecipeNutrition(ingredients, body);
  await env.DB.prepare("INSERT INTO recipes (id,household_id,title,description,emoji,cook_minutes,servings,cuisine_code,completeness_status,verification_status,ingredients_json,nutrition_json,tags_json,version_no,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'ACTIVE',?)")
    .bind(id, householdId, title, String(body.description ?? "家庭自建菜谱"), String(body.emoji ?? "🍽️"), Number(body.cookMinutes ?? 30), String(body.servings ?? 2), "CHINESE", complete ? "COMPLETE" : "PARTIAL", "USER_ENTERED", JSON.stringify(legacyIngredients), JSON.stringify(nutrition), JSON.stringify(["家庭菜谱"]), new Date().toISOString()).run();
  await saveRecipeDetails(env.DB, id, ingredients, steps, { type: "MANUAL", name: "家庭手动录入", parserVersion: "manual-v1" });
  return Response.json({ ok: true, id });
}

async function updateRecipe(body: Record<string, unknown>, householdId: string) {
  const id = String(body.id ?? "");
  const existing = await env.DB.prepare("SELECT r.id,r.nutrition_json,s.source_type,s.source_name,s.source_url,s.source_license,s.parser_version FROM recipes r LEFT JOIN recipe_sources s ON s.recipe_id=r.id WHERE r.id=? AND r.household_id=?").bind(id, householdId).first<Record<string, unknown>>();
  if (!existing) throw new Error("未找到要编辑的菜谱");
  const title = String(body.title ?? "").trim();
  const ingredients = parseRecipeIngredients(body.ingredients);
  const steps = parseRecipeSteps(body.steps, ingredients);
  if (!title || !ingredients.length || !steps.length) throw new Error("名称、食材和操作步骤不能为空");
  const legacyIngredients = ingredients.map((ingredient) => ({ code: ingredient.code, name: ingredient.name, grams: ingredient.grams }));
  const complete = ingredients.every((ingredient) => ingredient.optional || (ingredient.grams != null && ingredient.grams > 0));
  const nutrition = resolveRecipeNutrition(ingredients, body, String(existing.nutrition_json ?? "{}"));
  await env.DB.prepare("UPDATE recipes SET title=?,description=?,cook_minutes=?,servings=?,completeness_status=?,ingredients_json=?,nutrition_json=?,version_no=version_no+1 WHERE id=? AND household_id=?")
    .bind(title, String(body.description ?? "家庭自建菜谱"), Number(body.cookMinutes ?? 30), String(body.servings ?? 2), complete ? "COMPLETE" : "PARTIAL", JSON.stringify(legacyIngredients), JSON.stringify(nutrition), id, householdId).run();
  await saveRecipeDetails(env.DB, id, ingredients, steps, {
    type: String(existing.source_type ?? "MANUAL"),
    name: String(existing.source_name ?? "家庭手动录入"),
    url: existing.source_url ? String(existing.source_url) : null,
    license: existing.source_license ? String(existing.source_license) : null,
    parserVersion: String(existing.parser_version ?? "manual-v1"),
  });
  return Response.json({ ok: true, id });
}

function parseRecipeIngredients(value: unknown): RecipeIngredientInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const quantity = Number(row.quantity ?? 0);
    const rawGrams = row.grams;
    const grams = rawGrams == null || rawGrams === "" ? null : Number(rawGrams);
    return {
      name,
      code: normalizeIngredientCode(name),
      quantity,
      unit: String(row.unit ?? "g").trim() || "g",
      grams: grams != null && Number.isFinite(grams) ? grams : null,
      optional: Boolean(row.optional),
      rawText: String(row.rawText ?? "").trim() || undefined,
    };
  }).filter((item) => item.name && item.quantity > 0);
}

function parseRecipeSteps(value: unknown, ingredients: RecipeIngredientInput[]): RecipeStepInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = typeof item === "string" ? { instruction: item } : item as Record<string, unknown>;
    const instruction = String(row.instruction ?? "").trim();
    const ingredientCodes = ingredients.filter((ingredient) => instruction.includes(ingredient.name)).map((ingredient) => ingredient.code!).filter(Boolean);
    const timerSeconds = row.timerSeconds ? Number(row.timerSeconds) : row.timerMinutes ? Number(row.timerMinutes) * 60 : null;
    return { instruction, timerSeconds, ingredientCodes };
  }).filter((step) => step.instruction);
}

function resolveRecipeNutrition(ingredients: RecipeIngredientInput[], body: Record<string, unknown>, previous = "{}") {
  const supplied = { energy: Number(body.energy ?? 0), protein: Number(body.protein ?? 0), fiber: Number(body.fiber ?? 0), fat: Number(body.fat ?? 0), carbs: Number(body.carbs ?? 0) };
  if (isUsableNutrition(supplied)) return supplied;
  const estimated = estimateRecipeNutrition(ingredients);
  if (estimated.knownIngredientCount) return { energy: estimated.energy, protein: estimated.protein, fiber: estimated.fiber, fat: estimated.fat, carbs: estimated.carbs, source: "INGREDIENT_ESTIMATE", knownIngredientCount: estimated.knownIngredientCount, totalIngredientCount: estimated.totalIngredientCount };
  try { return JSON.parse(previous) as Record<string, unknown>; } catch { return { energy: 0, protein: 0, fiber: 0, fat: 0, carbs: 0, source: "UNAVAILABLE" }; }
}

function safeTarget(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 10000 ? number : fallback;
}

function normaliseParticipation(value: unknown) {
  const input = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    breakfast: input.breakfast !== false && input.breakfast !== "false",
    lunch: input.lunch !== false && input.lunch !== "false",
    dinner: input.dinner !== false && input.dinner !== "false",
    snack: input.snack === true || input.snack === "true",
  };
}

function parseMemberIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item)).filter(Boolean))).slice(0, 20);
}

function mealParticipation(value: string, mealType: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed[mealType.toLowerCase()] !== false;
  } catch { return mealType !== "SNACK"; }
}

async function importHowToCook(body: Record<string, unknown>, householdId: string) {
  const recipe = findHowToCookRecipe(String(body.path ?? "dishes/vegetable_dish/西红柿炒鸡蛋.md"));
  if (!recipe) throw new Error("未找到该开源菜谱");
  const parsed = parseHowToCookMarkdown(recipe.markdown);
  const existing = await env.DB.prepare("SELECT r.id FROM recipes r JOIN recipe_sources s ON s.recipe_id=r.id WHERE r.household_id=? AND r.title=? AND s.source_type='GITHUB_MARKDOWN'").bind(householdId, parsed.title).first<{ id: string }>();
  if (existing) return Response.json({ ok: true, id: existing.id, alreadyImported: true });
  if (!parsed.steps.length) throw new Error("该菜谱的步骤格式暂时无法解析");
  const id = `${householdId}-recipe-${crypto.randomUUID()}`;
  const legacyIngredients = parsed.ingredients.map((ingredient) => ({ code: ingredient.code, name: ingredient.name, grams: ingredient.grams }));
  const nutrition = resolveRecipeNutrition(parsed.ingredients, {});
  await env.DB.prepare("INSERT INTO recipes (id,household_id,title,description,emoji,cook_minutes,servings,cuisine_code,completeness_status,verification_status,ingredients_json,nutrition_json,tags_json,version_no,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'ACTIVE',?)")
    .bind(id, householdId, parsed.title, parsed.description || recipe.summary, recipe.emoji, parsed.cookMinutes, String(parsed.servings), "CHINESE", parsed.ingredients.length && parsed.ingredients.every((ingredient) => ingredient.optional || ingredient.grams != null) ? "COMPLETE" : "PARTIAL", "IMPORTED", JSON.stringify(legacyIngredients), JSON.stringify(nutrition), JSON.stringify(["开源菜谱", recipe.category, "程序员做饭指南"]), new Date().toISOString()).run();
  await saveRecipeDetails(env.DB, id, parsed.ingredients, parsed.steps, {
    type: "GITHUB_MARKDOWN",
    name: "程序员做饭指南 / Anduin2017/HowToCook",
    url: recipe.sourceUrl,
    license: HOW_TO_COOK_META.license,
    parserVersion: "howtocook-md-v2",
  });
  return Response.json({ ok: true, id });
}

async function recalculateShopping(householdId: string) {
  await synchronizeShoppingList(env.DB, householdId);
  return Response.json({ ok: true });
}

async function addShoppingItem(body: Record<string, unknown>, householdId: string) {
  const name = String(body.name ?? "").trim();
  const quantity = Number(body.quantity ?? 0);
  if (!name || quantity <= 0) throw new Error("请填写采购食材和数量");
  const now = new Date().toISOString();
  const id = `${householdId}-shopping-manual-${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO shopping_list_items (id,household_id,ingredient_code,ingredient_name,required_quantity_g,inventory_quantity_g,quantity_g,unit_code,source_type,status,user_quantity_override_g,needs_review,note,created_at,updated_at) VALUES (?,?,?,?,0,0,?,?,'MANUAL','OPEN',NULL,0,?,?,?)")
    .bind(id, householdId, normalizeIngredientCode(name), name, String(quantity), String(body.unit ?? "g"), String(body.note ?? "") || null, now, now).run();
  return Response.json({ ok: true, id });
}

async function toggleShoppingItem(body: Record<string, unknown>, householdId: string) {
  const id = String(body.id ?? "");
  const status = String(body.checked) === "true" || body.checked === true ? "CHECKED" : "OPEN";
  const result = await env.DB.prepare("UPDATE shopping_list_items SET status=?,updated_at=? WHERE id=? AND household_id=?").bind(status, new Date().toISOString(), id, householdId).run();
  if (!result.meta.changes) throw new Error("未找到采购项");
  return Response.json({ ok: true });
}

async function purchaseShoppingItem(body: Record<string, unknown>, householdId: string, actorId: string) {
  const id = String(body.id ?? "");
  const item = await env.DB.prepare("SELECT * FROM shopping_list_items WHERE id=? AND household_id=?").bind(id, householdId).first<Record<string, unknown>>();
  if (!item) throw new Error("未找到采购项");
  const quantity = Number(body.actualQuantity ?? item.quantity_g);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("请填写实际购入重量");
  const lotId = `${householdId}-lot-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO inventory_lots (id,household_id,ingredient_code,ingredient_name,emoji,category,location,initial_quantity_g,current_quantity_g,reserved_quantity_g,best_before_at,use_by_at,status,created_at) VALUES (?,?,?,?,?,'采购',?,?,?,0,?,NULL,'ACTIVE',?)")
      .bind(lotId, householdId, String(item.ingredient_code), String(item.ingredient_name), "🛒", String(body.location ?? "冷藏室"), String(quantity), String(quantity), body.expiry ? String(body.expiry) : null, now),
    env.DB.prepare("INSERT INTO inventory_transactions (id,lot_id,transaction_type,quantity_delta_g,quantity_after_g,reason_code,actor_email,occurred_at) VALUES (?,?, 'ADD',?,?, 'SHOPPING_PURCHASE',?,?)")
      .bind(crypto.randomUUID(), lotId, String(quantity), String(quantity), actorId, now),
    env.DB.prepare("UPDATE shopping_list_items SET status=CASE WHEN source_type='MANUAL' THEN 'CHECKED' ELSE 'OPEN' END,note=?,updated_at=? WHERE id=?")
      .bind(`实际购入 ${quantity}g`, now, id),
  ]);
  await synchronizeShoppingList(env.DB, householdId);
  return Response.json({ ok: true, lotId, actualQuantity: quantity, surplus: Math.max(0, quantity - Number(item.quantity_g)) });
}

async function addMember(body: Record<string, unknown>, householdId: string) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("请填写成员姓名");
  const id = `${householdId}-member-${crypto.randomUUID()}`;
  const type = String(body.memberType ?? "ADULT");
  const now = new Date().toISOString();
  const participation = normaliseParticipation(body.mealParticipation);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO household_members (id,household_id,name,role,member_type,avatar_seed,timezone,personal_status,meal_participation_json,active) VALUES (?,?,?,?,?,?,?,'MANAGED',?,1)").bind(id, householdId, name, "MEMBER", type, name, "Asia/Shanghai", JSON.stringify(participation)),
    env.DB.prepare("INSERT INTO nutrition_profile_versions (id,member_id,version_no,effective_from,source_type,targets_json,meal_split_json,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(`${id}-profile-1`, id, 1, now.slice(0, 10), "MANUAL", JSON.stringify({ energy: safeTarget(body.energyTarget, 1800), protein: safeTarget(body.proteinTarget, 70), fiber: safeTarget(body.fiberTarget, 25) }), JSON.stringify({ breakfast: .25, lunch: .35, dinner: .35, snack: .05 }), now),
  ]);
  return Response.json({ ok: true, id });
}

async function updateMember(body: Record<string, unknown>, householdId: string, actorId: string) {
  const id = String(body.id ?? "");
  const name = String(body.name ?? "").trim();
  const memberType = String(body.memberType ?? "ADULT");
  if (!name || !["ADULT", "CHILD", "DEPENDENT"].includes(memberType)) throw new Error("请填写有效的成员信息");
  const member = await env.DB.prepare("SELECT id FROM household_members WHERE id=? AND household_id=? AND active=1").bind(id, householdId).first<{ id: string }>();
  if (!member) throw new Error("未找到家庭成员");
  const now = new Date().toISOString();
  const nextVersion = await env.DB.prepare("SELECT COALESCE(MAX(version_no),0)+1 AS value FROM nutrition_profile_versions WHERE member_id=?").bind(id).first<{ value: number }>();
  const participation = normaliseParticipation(body.mealParticipation);
  await env.DB.batch([
    env.DB.prepare("UPDATE household_members SET name=?,member_type=?,avatar_seed=?,meal_participation_json=? WHERE id=? AND household_id=?").bind(name, memberType, name, JSON.stringify(participation), id, householdId),
    env.DB.prepare("INSERT INTO nutrition_profile_versions (id,member_id,version_no,effective_from,source_type,targets_json,meal_split_json,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(`${id}-profile-${Number(nextVersion?.value ?? 1)}`, id, Number(nextVersion?.value ?? 1), now.slice(0, 10), "MANUAL", JSON.stringify({ energy: safeTarget(body.energyTarget, 1800), protein: safeTarget(body.proteinTarget, 70), fiber: safeTarget(body.fiberTarget, 25) }), JSON.stringify({ breakfast: .25, lunch: .35, dinner: .35, snack: .05 }), now),
    env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "member.profile.updated.v1", JSON.stringify({ memberId: id }), actorId, now),
  ]);
  return Response.json({ ok: true, id });
}

async function addDietaryRule(body: Record<string, unknown>, householdId: string) {
  const memberId = String(body.memberId ?? "");
  const name = String(body.ingredientName ?? "").trim();
  const ruleType = String(body.ruleType ?? "AVOID");
  if (!memberId || !name || !["ALLERGY", "AVOID", "DISLIKE", "PREFER"].includes(ruleType)) throw new Error("请填写成员、食材和规则类型");
  const member = await env.DB.prepare("SELECT id FROM household_members WHERE id=? AND household_id=? AND active=1").bind(memberId, householdId).first<{ id: string }>();
  if (!member) throw new Error("未找到家庭成员");
  const id = `${householdId}-diet-${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO dietary_rules (id,household_id,member_id,ingredient_code,ingredient_name,rule_type,note,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, householdId, memberId, normalizeIngredientCode(name), name, ruleType, String(body.note ?? "").trim() || null, 1, new Date().toISOString()).run();
  return Response.json({ ok: true, id });
}

async function deleteDietaryRule(body: Record<string, unknown>, householdId: string) {
  const id = String(body.id ?? "");
  const result = await env.DB.prepare("UPDATE dietary_rules SET active=0 WHERE id=? AND household_id=?").bind(id, householdId).run();
  if (!result.meta.changes) throw new Error("未找到饮食限制");
  return Response.json({ ok: true });
}

async function setPlanItem(body: Record<string, unknown>, householdId: string, actorId: string) {
  const recipeId = String(body.recipeId ?? "");
  const mealDate = String(body.mealDate ?? "");
  const mealType = String(body.mealType ?? "DINNER").toUpperCase();
  const totalServings = Number(body.totalServings ?? 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate) || !["BREAKFAST", "LUNCH", "DINNER", "SNACK"].includes(mealType) || !Number.isFinite(totalServings) || totalServings <= 0 || totalServings > 24) throw new Error("请填写有效的日期、餐次和份数");
  const requestedMembers = parseMemberIds(body.participantIds);
  if (body.participantIds != null && !requestedMembers.length) throw new Error("请至少选择一位用餐成员");
  const participants = await planParticipants(env.DB, householdId, mealType, totalServings, requestedMembers);
  if (!participants.length) throw new Error("所选成员当前不可参与该餐次");
  const recipe = await assertRecipeAllowed(env.DB, householdId, recipeId, participants.map((member) => member.memberId));
  const requestedId = String(body.id ?? "");
  const existing = requestedId
    ? await env.DB.prepare("SELECT id,locked,state FROM meal_plan_items WHERE id=? AND household_id=?").bind(requestedId, householdId).first<{ id: string; locked: number; state: string }>()
    : await env.DB.prepare("SELECT id,locked,state FROM meal_plan_items WHERE household_id=? AND meal_date=? AND meal_type=? AND state NOT IN ('REMOVED','COOKED') LIMIT 1").bind(householdId, mealDate, mealType).first<{ id: string; locked: number; state: string }>();
  if (existing && (existing.locked || existing.state === "COOKED")) throw new Error("已锁定或已完成的餐次不能直接修改");
  const now = new Date().toISOString();
  const explanation = [`已按 ${participants.map((member) => member.name).join("、")} 的营养目标、库存和饮食限制校验`];
  if (existing) {
    await env.DB.batch([
      env.DB.prepare("UPDATE meal_plan_items SET meal_date=?,meal_type=?,recipe_id=?,state='PLANNED',total_servings=?,participants_json=?,explanation_json=?,revision=revision+1 WHERE id=?").bind(mealDate, mealType, recipe.id, String(totalServings), JSON.stringify(participants), JSON.stringify(explanation), existing.id),
      env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "meal_plan.item.updated.v1", JSON.stringify({ itemId: existing.id, recipeId: recipe.id }), actorId, now),
    ]);
  } else {
    const id = `${householdId}-plan-${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO meal_plan_items (id,household_id,meal_date,meal_type,recipe_id,state,locked,total_servings,participants_json,explanation_json,revision) VALUES (?,?,?,?,?,'PLANNED',0,?,?,?,1)").bind(id, householdId, mealDate, mealType, recipe.id, String(totalServings), JSON.stringify(participants), JSON.stringify(explanation)),
      env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "meal_plan.item.created.v1", JSON.stringify({ itemId: id, recipeId: recipe.id }), actorId, now),
    ]);
  }
  await synchronizeShoppingList(env.DB, householdId);
  return Response.json({ ok: true });
}

async function removePlanItem(body: Record<string, unknown>, householdId: string, actorId: string) {
  const id = String(body.id ?? "");
  const item = await env.DB.prepare("SELECT id,locked,state FROM meal_plan_items WHERE id=? AND household_id=?").bind(id, householdId).first<{ id: string; locked: number; state: string }>();
  if (!item) throw new Error("未找到计划项");
  if (item.locked || item.state === "COOKED") throw new Error("已锁定或已完成的餐次不能删除");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE meal_plan_items SET state='REMOVED',revision=revision+1 WHERE id=?").bind(id),
    env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "meal_plan.item.removed.v1", JSON.stringify({ itemId: id }), actorId, now),
  ]);
  await synchronizeShoppingList(env.DB, householdId);
  return Response.json({ ok: true });
}

async function togglePlanLock(body: Record<string, unknown>, householdId: string, actorId: string) {
  const id = String(body.id ?? "");
  const item = await env.DB.prepare("SELECT id,locked,state FROM meal_plan_items WHERE id=? AND household_id=?").bind(id, householdId).first<{ id: string; locked: number; state: string }>();
  if (!item || item.state === "COOKED") throw new Error("未找到可锁定的计划项");
  const locked = item.locked ? 0 : 1;
  await env.DB.batch([
    env.DB.prepare("UPDATE meal_plan_items SET locked=?,revision=revision+1 WHERE id=?").bind(locked, id),
    env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "meal_plan.item.locked.v1", JSON.stringify({ itemId: id, locked: Boolean(locked) }), actorId, new Date().toISOString()),
  ]);
  return Response.json({ ok: true, locked: Boolean(locked) });
}

async function generateWeekPlan(body: Record<string, unknown>, householdId: string, actorId: string) {
  const startValue = String(body.startDate ?? new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startValue)) throw new Error("请选择计划开始日期");
  const start = new Date(`${startValue}T12:00:00`);
  const members = await env.DB.prepare("SELECT id,meal_participation_json FROM household_members WHERE household_id=? AND active=1").bind(householdId).all<{ id: string; meal_participation_json: string }>();
  const mealTypes = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
  const writes: AppPreparedStatement[] = [];
  const rankings = new Map<string, Awaited<ReturnType<typeof rankRecipes>>>();
  const usage = new Map<string, number>();
  let updatedSlots = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start); date.setDate(start.getDate() + offset);
    const mealDate = date.toISOString().slice(0, 10);
    const usedToday = new Set<string>();
    for (const mealType of mealTypes) {
      const memberIds = members.results.filter((member) => mealParticipation(member.meal_participation_json, mealType)).map((member) => member.id);
      if (!memberIds.length) continue;
      const existing = await env.DB.prepare("SELECT id,locked,state FROM meal_plan_items WHERE household_id=? AND meal_date=? AND meal_type=? AND state NOT IN ('REMOVED') LIMIT 1").bind(householdId, mealDate, mealType).first<{ id: string; locked: number; state: string }>();
      if (existing?.locked || existing?.state === "COOKED") continue;
      const key = `${mealType}:${memberIds.join(",")}`;
      let candidates = rankings.get(key);
      if (!candidates) { candidates = await rankRecipes(env.DB, householdId, { mealType, memberIds }); rankings.set(key, candidates); }
      if (!candidates.length) continue;
      const selected = candidates.map((candidate) => ({ candidate, adjusted: candidate.score - (usage.get(candidate.id) ?? 0) * .12 - (usedToday.has(candidate.id) ? .25 : 0) }))
        .sort((a, b) => b.adjusted - a.adjusted)[0].candidate;
      const participants = await planParticipants(env.DB, householdId, mealType, 0, memberIds);
      const totalServings = participants.reduce((sum, participant) => sum + participant.serving, 0);
      const explanation = [`整周优化：${participants.map((participant) => participant.name).join("、")}参与`, ...selected.reasons.slice(0, 2)];
      if (existing) writes.push(env.DB.prepare("UPDATE meal_plan_items SET recipe_id=?,state='SUGGESTED',total_servings=?,participants_json=?,explanation_json=?,revision=revision+1 WHERE id=?").bind(selected.id, String(totalServings), JSON.stringify(participants), JSON.stringify(explanation), existing.id));
      else writes.push(env.DB.prepare("INSERT INTO meal_plan_items (id,household_id,meal_date,meal_type,recipe_id,state,locked,total_servings,participants_json,explanation_json,revision) VALUES (?,?,?,?,?,'SUGGESTED',0,?,?,?,1)").bind(`${householdId}-plan-${crypto.randomUUID()}`, householdId, mealDate, mealType, selected.id, String(totalServings), JSON.stringify(participants), JSON.stringify(explanation)));
      usage.set(selected.id, (usage.get(selected.id) ?? 0) + 1);
      usedToday.add(selected.id);
      updatedSlots += 1;
    }
  }
  if (writes.length) {
    writes.push(env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "meal_plan.week.generated.v2", JSON.stringify({ startDate: startValue, days: 7, slots: updatedSlots }), actorId, new Date().toISOString()));
    await env.DB.batch(writes);
  }
  await synchronizeShoppingList(env.DB, householdId);
  return Response.json({ ok: true, updated: updatedSlots, startDate: startValue });
}

async function recommend(householdId: string) {
  const candidates = (await rankRecipes(env.DB, householdId)).slice(0, 3);
  return Response.json({ candidates, rulesetVersion: "rules-v1.0", deterministic: true });
}

async function replacePlan(body: Record<string, unknown>, householdId: string, email: string) {
  const itemId = String(body.itemId ?? "");
  const recipeId = String(body.recipeId ?? "");
  const item = await env.DB.prepare("SELECT id,locked FROM meal_plan_items WHERE id=? AND household_id=?").bind(itemId, householdId).first<{ id: string; locked: number }>();
  if (!item) throw new Error("未找到计划项");
  if (item.locked) throw new Error("已锁定的计划不能替换");
  await assertRecipeAllowed(env.DB, householdId, recipeId);
  await env.DB.batch([
    env.DB.prepare("UPDATE meal_plan_items SET recipe_id=?, state='REPLACED', explanation_json=?, revision=revision+1 WHERE id=?").bind(recipeId, JSON.stringify(["根据当前营养缺口和库存重新推荐"]), itemId),
    env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "meal_plan.item.replaced.v1", JSON.stringify({ itemId, recipeId }), email, new Date().toISOString()),
  ]);
  await synchronizeShoppingList(env.DB, householdId);
  return Response.json({ ok: true });
}

async function completeMeal(body: Record<string, unknown>, householdId: string, email: string) {
  const itemId = String(body.itemId ?? "");
  const item = await env.DB.prepare("SELECT p.id,p.state,p.recipe_id,p.total_servings,r.servings,r.ingredients_json FROM meal_plan_items p JOIN recipes r ON r.id=p.recipe_id WHERE p.id=? AND p.household_id=?").bind(itemId, householdId).first<{ id: string; state: string; recipe_id: string; total_servings: string; servings: string; ingredients_json: string }>();
  if (!item) throw new Error("未找到计划项");
  if (item.state === "COOKED") return Response.json({ ok: true, alreadyCompleted: true });
  const scale = Number(item.total_servings) / Math.max(.01, Number(item.servings));
  const ingredients = JSON.parse(item.ingredients_json) as { code: string; name: string; grams: number }[];
  const deductions: { lotId: string; grams: number; after: number }[] = [];
  for (const ingredient of ingredients) {
    const lots = await env.DB.prepare("SELECT id,current_quantity_g FROM inventory_lots WHERE household_id=? AND ingredient_code=? AND status='ACTIVE' ORDER BY COALESCE(use_by_at,best_before_at,'9999-12-31')").bind(householdId, ingredient.code).all<{ id: string; current_quantity_g: string }>();
    const total = lots.results.reduce((sum, lot) => sum + Number(lot.current_quantity_g), 0);
    const required = Number(ingredient.grams) * scale;
    if (total < required) throw new Error(`${ingredient.name}库存不足 ${Math.round((required - total) * 10) / 10} 克，未产生负库存`);
    let remaining = required;
    for (const lot of lots.results) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(lot.current_quantity_g));
      deductions.push({ lotId: lot.id, grams: take, after: Number(lot.current_quantity_g) - take });
      remaining -= take;
    }
  }
  const statements: AppPreparedStatement[] = [];
  for (const d of deductions) {
    statements.push(env.DB.prepare("UPDATE inventory_lots SET current_quantity_g=?, status=CASE WHEN ?=0 THEN 'CONSUMED' ELSE status END WHERE id=?").bind(String(d.after), d.after, d.lotId));
    statements.push(env.DB.prepare("INSERT INTO inventory_transactions (id,lot_id,transaction_type,quantity_delta_g,quantity_after_g,reason_code,actor_email,occurred_at) VALUES (?,?,?,?,?,'MEAL_COMPLETED',?,?)").bind(crypto.randomUUID(), d.lotId, "CONSUME", String(-d.grams), String(d.after), email, new Date().toISOString()));
  }
  statements.push(env.DB.prepare("UPDATE meal_plan_items SET state='COOKED',revision=revision+1 WHERE id=?").bind(itemId));
  statements.push(env.DB.prepare("INSERT INTO app_events (id,household_id,event_type,payload_json,actor_email,occurred_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), householdId, "meal_plan.item.completed.v1", JSON.stringify({ itemId, deductions }), email, new Date().toISOString()));
  await env.DB.batch(statements);
  return Response.json({ ok: true, deductions });
}
