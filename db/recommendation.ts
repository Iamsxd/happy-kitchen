import { estimateRecipeNutrition, isUsableNutrition, type Nutrition } from "../app/nutrition";
import type { AppDatabase } from "./types";

type RecipeRow = { id: string; title: string; emoji: string; cook_minutes: number; ingredients_json: string; nutrition_json: string; tags_json: string };
type LotRow = { ingredient_code: string; current_quantity_g: string; reserved_quantity_g: string; best_before_at: string | null; use_by_at: string | null };
type DietaryRuleRow = { member_id: string; member_name: string; ingredient_code: string; ingredient_name: string; rule_type: string };

export type RankedCandidate = {
  id: string; title: string; emoji: string; cookMinutes: number; score: number; inventory: number; reasons: string[];
  nutrition: Nutrition; nutritionSource: "recipe" | "estimated" | "unavailable";
};

export type RankingOptions = { mealType?: string; memberIds?: string[] };

function parse<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function today() { return new Date().toISOString().slice(0, 10); }

function matchesRule(ingredients: { code?: string; name?: string }[], rule: DietaryRuleRow) {
  return ingredients.some((ingredient) => ingredient.code === rule.ingredient_code || String(ingredient.name ?? "").includes(rule.ingredient_name));
}

function resolvedNutrition(recipe: RecipeRow, ingredients: { code?: string; name?: string; grams?: number | null }[]) {
  const stored = parse<Partial<Nutrition>>(recipe.nutrition_json, {});
  if (isUsableNutrition(stored)) {
    return { nutrition: { energy: Number(stored.energy ?? 0), protein: Number(stored.protein ?? 0), fiber: Number(stored.fiber ?? 0), fat: Number(stored.fat ?? 0), carbs: Number(stored.carbs ?? 0) }, source: "recipe" as const };
  }
  const estimated = estimateRecipeNutrition(ingredients);
  if (estimated.knownIngredientCount) return { nutrition: estimated, source: "estimated" as const };
  return { nutrition: { energy: 0, protein: 0, fiber: 0, fat: 0, carbs: 0 }, source: "unavailable" as const };
}

export async function rankRecipes(db: AppDatabase, householdId: string, options: RankingOptions = {}): Promise<RankedCandidate[]> {
  const mealType = String(options.mealType ?? "DINNER").toUpperCase();
  const requestedMemberIds = new Set((options.memberIds ?? []).filter(Boolean));
  const [recipesResult, lotsResult, profilesResult, rulesResult] = await Promise.all([
    db.prepare("SELECT id,title,emoji,cook_minutes,ingredients_json,nutrition_json,tags_json FROM recipes WHERE household_id=? AND status='ACTIVE' AND completeness_status='COMPLETE'").bind(householdId).all<RecipeRow>(),
    db.prepare("SELECT ingredient_code,current_quantity_g,reserved_quantity_g,best_before_at,use_by_at FROM inventory_lots WHERE household_id=? AND status='ACTIVE'").bind(householdId).all<LotRow>(),
    db.prepare("SELECT p.member_id,p.targets_json,p.meal_split_json FROM nutrition_profile_versions p JOIN household_members m ON m.id=p.member_id WHERE m.household_id=? AND m.active=1 AND p.version_no=(SELECT MAX(p2.version_no) FROM nutrition_profile_versions p2 WHERE p2.member_id=p.member_id)").bind(householdId).all<{ member_id: string; targets_json: string; meal_split_json: string }>(),
    db.prepare("SELECT d.member_id,m.name AS member_name,d.ingredient_code,d.ingredient_name,d.rule_type FROM dietary_rules d JOIN household_members m ON m.id=d.member_id WHERE d.household_id=? AND d.active=1 AND m.active=1").bind(householdId).all<DietaryRuleRow>(),
  ]);
  const profiles = requestedMemberIds.size ? profilesResult.results.filter((profile) => requestedMemberIds.has(profile.member_id)) : profilesResult.results;
  const activeRules = requestedMemberIds.size ? rulesResult.results.filter((rule) => requestedMemberIds.has(rule.member_id)) : rulesResult.results;
  const target = profiles.reduce((sum, profile) => {
    const values = parse<{ energy?: number; protein?: number; fiber?: number }>(profile.targets_json, {});
    const split = parse<Record<string, number>>(profile.meal_split_json, {});
    const share = Number(split[mealType.toLowerCase()] ?? (mealType === "SNACK" ? .05 : mealType === "DINNER" ? .35 : mealType === "LUNCH" ? .35 : .25));
    sum.energy += Number(values.energy ?? 0) * share;
    sum.protein += Number(values.protein ?? 0) * share;
    sum.fiber += Number(values.fiber ?? 0) * share;
    return sum;
  }, { energy: 0, protein: 0, fiber: 0 });
  const currentDay = today();

  return recipesResult.results.flatMap((recipe) => {
    const ingredients = parse<{ code?: string; name?: string; grams?: number }[]>(recipe.ingredients_json, []);
    const matchedRules = activeRules.filter((rule) => matchesRule(ingredients, rule));
    const hardRules = matchedRules.filter((rule) => rule.rule_type === "ALLERGY" || rule.rule_type === "AVOID");
    if (hardRules.length) return [];
    const { nutrition, source } = resolvedNutrition(recipe, ingredients);
    let covered = 0, total = 0, expiryBoost = 0;
    for (const ingredient of ingredients) {
      const grams = Number(ingredient.grams ?? 0);
      if (!Number.isFinite(grams) || grams <= 0) continue;
      total += grams;
      const usableLots = lotsResult.results.filter((lot) => {
        const expiry = lot.use_by_at ?? lot.best_before_at;
        return lot.ingredient_code === ingredient.code && (!expiry || expiry >= currentDay);
      });
      const available = usableLots.reduce((sum, lot) => sum + Math.max(0, Number(lot.current_quantity_g) - Number(lot.reserved_quantity_g)), 0);
      covered += Math.min(grams, available);
      for (const lot of usableLots) {
        const expiry = lot.use_by_at ?? lot.best_before_at;
        if (!expiry) continue;
        const days = Math.ceil((new Date(`${expiry}T00:00:00`).getTime() - Date.now()) / 86400000);
        if (days >= 0 && days <= 3) expiryBoost = Math.max(expiryBoost, days <= 1 ? 1 : .8);
      }
    }
    const inventory = total ? covered / total : 0;
    const proteinScore = target.protein ? Math.min(1, nutrition.protein / target.protein) : .5;
    const energyScore = target.energy ? Math.min(1, nutrition.energy / target.energy) : .5;
    const fiberScore = target.fiber ? Math.min(1, nutrition.fiber / target.fiber) : .5;
    const nutritionScore = .5 * proteinScore + .3 * energyScore + .2 * fiberScore;
    const dislikes = matchedRules.filter((rule) => rule.rule_type === "DISLIKE").length;
    const preferences = matchedRules.filter((rule) => rule.rule_type === "PREFER").length;
    const preferredMinutes = mealType === "BREAKFAST" ? 20 : mealType === "SNACK" ? 15 : 35;
    const time = recipe.cook_minutes <= preferredMinutes ? 1 : Math.max(0, 1 - (recipe.cook_minutes - preferredMinutes) / 35);
    const score = .34 * nutritionScore + .24 * inventory + .18 * expiryBoost + .12 * time + .06 * preferences - .24 * dislikes + .06;
    const reasons = [
      ...(activeRules.length ? ["已排除参与成员的过敏与忌口"] : []),
      ...(preferences ? ["符合家人喜欢的食材"] : []),
      ...(expiryBoost ? ["优先使用临期食材"] : []),
      ...(nutrition.protein > 0 ? [`约含 ${Math.round(nutrition.protein)}g 蛋白质`] : ["营养数据待补充"]),
      `冰箱已有 ${Math.round(inventory * 100)}% 的食材`,
    ].slice(0, 3);
    return [{ id: recipe.id, title: recipe.title, emoji: recipe.emoji, cookMinutes: recipe.cook_minutes, score: Number(Math.max(0, score).toFixed(2)), inventory: Math.round(inventory * 100), reasons, nutrition, nutritionSource: source }];
  }).sort((a, b) => b.score - a.score);
}

export async function assertRecipeAllowed(db: AppDatabase, householdId: string, recipeId: string, memberIds: string[] = []) {
  const [recipe, rulesResult] = await Promise.all([
    db.prepare("SELECT id,title,ingredients_json FROM recipes WHERE id=? AND household_id=? AND status='ACTIVE'").bind(recipeId, householdId).first<{ id: string; title: string; ingredients_json: string }>(),
    db.prepare("SELECT d.member_id,m.name AS member_name,d.ingredient_code,d.ingredient_name,d.rule_type FROM dietary_rules d JOIN household_members m ON m.id=d.member_id WHERE d.household_id=? AND d.active=1 AND m.active=1").bind(householdId).all<DietaryRuleRow>(),
  ]);
  if (!recipe) throw new Error("未找到可加入计划的菜谱");
  const ingredients = parse<{ code?: string; name?: string }[]>(recipe.ingredients_json, []);
  const selected = new Set(memberIds.filter(Boolean));
  const applicableRules = selected.size ? rulesResult.results.filter((rule) => selected.has(rule.member_id)) : rulesResult.results;
  const conflict = applicableRules.find((rule) => (rule.rule_type === "ALLERGY" || rule.rule_type === "AVOID") && matchesRule(ingredients, rule));
  if (conflict) throw new Error(`“${recipe.title}”含有${conflict.ingredient_name}，不符合${conflict.member_name}的${conflict.rule_type === "ALLERGY" ? "过敏" : "忌口"}限制`);
  return recipe;
}

export async function planParticipants(db: AppDatabase, householdId: string, mealType: string, totalServings: number, memberIds: string[] = []) {
  const members = await db.prepare("SELECT id,name,member_type,meal_participation_json FROM household_members WHERE household_id=? AND active=1 ORDER BY role='OWNER' DESC,name").bind(householdId).all<{ id: string; name: string; member_type: string; meal_participation_json: string }>();
  const selected = new Set(memberIds.filter(Boolean));
  const eligible = selected.size
    ? members.results.filter((member) => selected.has(member.id))
    : members.results.filter((member) => parse<Record<string, boolean>>(member.meal_participation_json, {})[mealType.toLowerCase()] !== false);
  const weights = eligible.map((member) => ({ member, weight: member.member_type === "CHILD" ? .75 : 1 }));
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return [];
  const resolvedServings = totalServings > 0 ? totalServings : totalWeight;
  return weights.map(({ member, weight }) => ({ memberId: member.id, name: member.name, serving: Math.round(resolvedServings * weight / totalWeight * 100) / 100 }));
}
