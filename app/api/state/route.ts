import { env } from "../../../db/runtime";
import { ensureDatabase, getHouseholdMembership } from "../../../db/bootstrap";
import { synchronizeShoppingList } from "../../../db/kitchen";
import { getSessionUserFromRequest } from "../../auth";
import { estimateRecipeNutrition, isUsableNutrition } from "../../nutrition";

export const dynamic = "force-dynamic";

function parse<T>(value: unknown, fallback: T): T {
  try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export async function GET(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const householdId = await ensureDatabase(user.id, user.displayName);
  const db = env.DB;
  await synchronizeShoppingList(db, householdId);
  const [household, membership, members, profiles, rules, recipes, inventory, plan, recipeIngredients, recipeSteps, recipeSources, shopping, accountMembers] = await Promise.all([
    db.prepare("SELECT * FROM households WHERE id = ?").bind(householdId).first(),
    getHouseholdMembership(user.id),
    db.prepare("SELECT * FROM household_members WHERE household_id = ? AND active = 1 ORDER BY role = 'OWNER' DESC, name").bind(householdId).all(),
    db.prepare("SELECT p.* FROM nutrition_profile_versions p JOIN household_members m ON m.id=p.member_id WHERE m.household_id=? AND p.version_no=(SELECT MAX(p2.version_no) FROM nutrition_profile_versions p2 WHERE p2.member_id=p.member_id) ORDER BY m.role='OWNER' DESC,m.name").bind(householdId).all(),
    db.prepare("SELECT d.*,m.name AS member_name FROM dietary_rules d JOIN household_members m ON m.id=d.member_id WHERE d.household_id=? AND d.active=1 ORDER BY m.name,d.created_at DESC").bind(householdId).all(),
    db.prepare("SELECT * FROM recipes WHERE household_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC").bind(householdId).all(),
    db.prepare("SELECT * FROM inventory_lots WHERE household_id = ? AND status = 'ACTIVE' ORDER BY COALESCE(use_by_at,best_before_at,'9999-12-31')").bind(householdId).all(),
    db.prepare("SELECT p.*, r.title, r.emoji, r.cook_minutes, r.nutrition_json FROM meal_plan_items p JOIN recipes r ON r.id=p.recipe_id WHERE p.household_id=? ORDER BY p.meal_date").bind(householdId).all(),
    db.prepare("SELECT ri.* FROM recipe_ingredients ri JOIN recipes r ON r.id=ri.recipe_id WHERE r.household_id=? ORDER BY ri.recipe_id,ri.sort_order").bind(householdId).all(),
    db.prepare("SELECT rs.* FROM recipe_steps rs JOIN recipes r ON r.id=rs.recipe_id WHERE r.household_id=? ORDER BY rs.recipe_id,rs.step_no").bind(householdId).all(),
    db.prepare("SELECT s.* FROM recipe_sources s JOIN recipes r ON r.id=s.recipe_id WHERE r.household_id=?").bind(householdId).all(),
    db.prepare("SELECT * FROM shopping_list_items WHERE household_id=? ORDER BY status='CHECKED',source_type,ingredient_name").bind(householdId).all(),
    db.prepare("SELECT m.user_id,m.member_id,m.role,m.active,u.username,u.display_name FROM household_account_memberships m JOIN auth_users u ON u.id=m.user_id WHERE m.household_id=? AND m.active=1 ORDER BY m.role='OWNER' DESC,u.display_name").bind(householdId).all(),
  ]);
  const ingredientsByRecipe = new Map<string, unknown[]>();
  for (const row of recipeIngredients.results) {
    const recipeId = String(row.recipe_id);
    ingredientsByRecipe.set(recipeId, [...(ingredientsByRecipe.get(recipeId) ?? []), row]);
  }
  const stepsByRecipe = new Map<string, unknown[]>();
  for (const row of recipeSteps.results) {
    const recipeId = String(row.recipe_id);
    stepsByRecipe.set(recipeId, [...(stepsByRecipe.get(recipeId) ?? []), { ...row, ingredientCodes: parse(row.ingredient_codes_json, []) }]);
  }
  const sourcesByRecipe = new Map(recipeSources.results.map((row) => [String(row.recipe_id), row]));
  const normalizedRecipes: Array<Record<string, unknown> & { id: string; nutrition: Record<string, number> | ReturnType<typeof estimateRecipeNutrition> }> = recipes.results.map((r) => {
    const ingredients = parse<{ code?: string; name?: string; grams?: number | null }[]>(r.ingredients_json, []);
    const storedNutrition = parse<Record<string, number>>(r.nutrition_json, {});
    const estimated = estimateRecipeNutrition(ingredients);
    const nutrition = isUsableNutrition(storedNutrition) ? storedNutrition : estimated;
    return {
    ...r,
    id: String(r.id),
    ingredients,
    ingredientsDetailed: ingredientsByRecipe.get(String(r.id)) ?? [],
    steps: stepsByRecipe.get(String(r.id)) ?? [],
    source: sourcesByRecipe.get(String(r.id)) ?? null,
    nutrition,
    nutritionSource: isUsableNutrition(storedNutrition) ? "recipe" : estimated.knownIngredientCount ? "estimated" : "unavailable",
    tags: parse(r.tags_json, []),
  }; });
  const nutritionByRecipe = new Map(normalizedRecipes.map((recipe) => [String(recipe.id), recipe.nutrition]));
  const normalizedPlan: Array<Record<string, unknown> & { participants: unknown[]; explanations: unknown[]; nutrition: unknown }> = plan.results.filter((p) => p.state !== "REMOVED").map((p) => ({ ...p, participants: parse(p.participants_json, []), explanations: parse(p.explanation_json, []), nutrition: nutritionByRecipe.get(String(p.recipe_id)) ?? parse(p.nutrition_json, {}) }));
  const normalizedProfiles = profiles.results.map((p) => ({ ...p, targets: parse(p.targets_json, {}), mealSplit: parse(p.meal_split_json, {}) }));
  const targets = normalizedProfiles.reduce((sum, profile) => {
    const values = profile.targets as Record<string, unknown>;
    sum.energyTarget += Number(values.energy ?? 0); sum.proteinTarget += Number(values.protein ?? 0); sum.fiberTarget += Number(values.fiber ?? 0);
    return sum;
  }, { energyTarget: 0, proteinTarget: 0, fiberTarget: 0 });
  const today = new Date().toISOString().slice(0, 10);
  const planned = normalizedPlan.filter((item) => String(item.meal_date) === today && String(item.state) !== "REMOVED").reduce((sum, item) => {
    const nutrition = item.nutrition as Record<string, unknown>;
    sum.energy += Number(nutrition.energy ?? 0); sum.protein += Number(nutrition.protein ?? 0); sum.fiber += Number(nutrition.fiber ?? 0);
    return sum;
  }, { energy: 0, protein: 0, fiber: 0 });
  return Response.json({
    household,
    access: { role: membership?.role ?? "MEMBER", memberId: membership?.member_id ?? null, userId: user.id },
    accountMembers: accountMembers.results,
    members: members.results,
    profiles: normalizedProfiles,
    rules: rules.results,
    recipes: normalizedRecipes,
    inventory: inventory.results,
    plan: normalizedPlan,
    shopping: shopping.results,
    summary: { ...planned, ...targets, water: 0, waterTarget: 2000, mode: "planned" },
    generatedAt: new Date().toISOString(),
  });
}
