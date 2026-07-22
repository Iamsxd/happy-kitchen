import type { AppDatabase, AppPreparedStatement } from "./types";

export type RecipeIngredientInput = {
  code?: string;
  name: string;
  quantity: number;
  unit: string;
  grams?: number | null;
  optional?: boolean;
  rawText?: string;
};

export type RecipeStepInput = {
  instruction: string;
  timerSeconds?: number | null;
  ingredientCodes?: string[];
};

export type RecipeSourceInput = {
  type: string;
  name: string;
  url?: string | null;
  license?: string | null;
  parserVersion?: string | null;
};

const ingredientAliases: Record<string, string> = {
  "番茄": "tomato", "西红柿": "tomato", "鸡蛋": "egg", "蛋": "egg",
  "菠菜": "spinach", "鸡胸肉": "chicken", "鸡胸": "chicken", "意面": "pasta",
  "意大利面": "pasta", "牛肉": "beef", "米饭": "rice", "大米": "rice",
  "豆腐": "tofu", "菌菇": "mushroom", "蘑菇": "mushroom", "面条": "noodle",
  "食用油": "cooking-oil", "盐": "salt", "糖": "sugar", "葱花": "scallion",
  "tomato": "tomato", "egg": "egg", "spinach": "spinach", "chicken": "chicken", "pasta": "pasta", "beef": "beef", "rice": "rice", "tofu": "tofu", "mushroom": "mushroom", "noodle": "noodle", "pork": "pork", "fish": "fish", "shrimp": "shrimp", "broccoli": "broccoli", "carrot": "carrot", "cabbage": "cabbage", "potato": "potato", "cucumber": "cucumber", "pepper": "pepper", "onion": "onion", "corn": "corn", "pumpkin": "pumpkin", "oats": "oats", "milk": "milk", "yogurt": "yogurt", "soybean": "soybean", "cooking-oil": "cooking-oil",
};

export function normalizeIngredientCode(name: string) {
  const normalized = name.trim().replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "").toLowerCase();
  return ingredientAliases[normalized] ?? `custom:${encodeURIComponent(normalized).slice(0, 80)}`;
}

export async function saveRecipeDetails(db: AppDatabase, recipeId: string, ingredients: RecipeIngredientInput[], steps: RecipeStepInput[], source: RecipeSourceInput) {
  const statements: AppPreparedStatement[] = [
    db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id=?").bind(recipeId),
    db.prepare("DELETE FROM recipe_steps WHERE recipe_id=?").bind(recipeId),
    db.prepare("DELETE FROM recipe_sources WHERE recipe_id=?").bind(recipeId),
  ];
  ingredients.forEach((ingredient, index) => {
    const name = ingredient.name.trim();
    const code = ingredient.code || normalizeIngredientCode(name);
    statements.push(db.prepare("INSERT INTO recipe_ingredients (id,recipe_id,sort_order,ingredient_code,ingredient_name,quantity_value,unit_code,quantity_g,optional,raw_text) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(`${recipeId}-ingredient-${index + 1}`, recipeId, index, code, name, String(ingredient.quantity), ingredient.unit || "g", ingredient.grams == null ? null : String(ingredient.grams), ingredient.optional ? 1 : 0, ingredient.rawText || `${name} ${ingredient.quantity}${ingredient.unit || "g"}`));
  });
  steps.forEach((step, index) => {
    statements.push(db.prepare("INSERT INTO recipe_steps (id,recipe_id,step_no,instruction,timer_seconds,ingredient_codes_json) VALUES (?,?,?,?,?,?)")
      .bind(`${recipeId}-step-${index + 1}`, recipeId, index + 1, step.instruction.trim(), step.timerSeconds ?? null, JSON.stringify(step.ingredientCodes ?? [])));
  });
  statements.push(db.prepare("INSERT INTO recipe_sources (recipe_id,source_type,source_name,source_url,source_license,parser_version,imported_at) VALUES (?,?,?,?,?,?,?)")
    .bind(recipeId, source.type, source.name, source.url ?? null, source.license ?? null, source.parserVersion ?? null, new Date().toISOString()));
  await db.batch(statements);
}

export async function synchronizeShoppingList(db: AppDatabase, householdId: string) {
  const [plans, lots, detailRows, existing] = await Promise.all([
    db.prepare("SELECT p.recipe_id,p.total_servings,r.servings,r.ingredients_json FROM meal_plan_items p JOIN recipes r ON r.id=p.recipe_id WHERE p.household_id=? AND p.state NOT IN ('COOKED','REMOVED')").bind(householdId).all<{ recipe_id: string; total_servings: string; servings: string; ingredients_json: string }>(),
    db.prepare("SELECT ingredient_code,current_quantity_g,reserved_quantity_g,best_before_at,use_by_at FROM inventory_lots WHERE household_id=? AND status='ACTIVE'").bind(householdId).all<{ ingredient_code: string; current_quantity_g: string; reserved_quantity_g: string; best_before_at: string | null; use_by_at: string | null }>(),
    db.prepare("SELECT ri.* FROM recipe_ingredients ri JOIN recipes r ON r.id=ri.recipe_id WHERE r.household_id=? AND r.status='ACTIVE'").bind(householdId).all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM shopping_list_items WHERE household_id=? AND source_type='SYSTEM'").bind(householdId).all<Record<string, unknown>>(),
  ]);
  const detailsByRecipe = new Map<string, Record<string, unknown>[]>();
  for (const row of detailRows.results) {
    const id = String(row.recipe_id);
    detailsByRecipe.set(id, [...(detailsByRecipe.get(id) ?? []), row]);
  }
  const needs = new Map<string, { name: string; required: number; unresolved: boolean }>();
  for (const plan of plans.results) {
    const scale = Number(plan.total_servings) / Math.max(.01, Number(plan.servings));
    const detail = detailsByRecipe.get(plan.recipe_id);
    const ingredients = detail?.length ? detail.filter((row) => !Boolean(row.optional)).map((row) => ({ code: String(row.ingredient_code), name: String(row.ingredient_name), grams: row.quantity_g == null ? null : Number(row.quantity_g) })) : parseLegacyIngredients(plan.ingredients_json);
    for (const ingredient of ingredients) {
      const current = needs.get(ingredient.code) ?? { name: ingredient.name, required: 0, unresolved: false };
      if (ingredient.grams == null || !Number.isFinite(ingredient.grams)) current.unresolved = true;
      else current.required += ingredient.grams * scale;
      needs.set(ingredient.code, current);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const stock = new Map<string, number>();
  for (const lot of lots.results) {
    const expiry = lot.use_by_at ?? lot.best_before_at;
    if (expiry && expiry < today) continue;
    const available = Math.max(0, Number(lot.current_quantity_g) - Number(lot.reserved_quantity_g));
    stock.set(lot.ingredient_code, (stock.get(lot.ingredient_code) ?? 0) + available);
  }
  const existingByCode = new Map(existing.results.map((row) => [String(row.ingredient_code), row]));
  const touched = new Set<string>();
  const now = new Date().toISOString();
  const writes: AppPreparedStatement[] = [];
  for (const [code, need] of needs) {
    const available = stock.get(code) ?? 0;
    const shortage = Math.max(0, round(need.required - available));
    const old = existingByCode.get(code);
    const override = old?.user_quantity_override_g == null ? null : Number(old.user_quantity_override_g);
    if (shortage <= 0 && !need.unresolved && override == null) continue;
    const id = old ? String(old.id) : `${householdId}-shopping-${code}`;
    const quantity = override ?? shortage;
    touched.add(code);
    writes.push(db.prepare(`INSERT INTO shopping_list_items (id,household_id,ingredient_code,ingredient_name,required_quantity_g,inventory_quantity_g,quantity_g,unit_code,source_type,status,user_quantity_override_g,needs_review,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'g','SYSTEM',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ingredient_name=excluded.ingredient_name,required_quantity_g=excluded.required_quantity_g,inventory_quantity_g=excluded.inventory_quantity_g,quantity_g=excluded.quantity_g,needs_review=excluded.needs_review,note=excluded.note,updated_at=excluded.updated_at`)
      .bind(id, householdId, code, need.name, String(round(need.required)), String(round(available)), String(round(quantity)), old?.status ?? "OPEN", override == null ? null : String(override), need.unresolved ? 1 : 0, need.unresolved ? "部分用量或单位需要人工确认" : null, old?.created_at ?? now, now));
  }
  for (const row of existing.results) {
    if (!touched.has(String(row.ingredient_code))) writes.push(db.prepare("DELETE FROM shopping_list_items WHERE id=? AND source_type='SYSTEM'").bind(row.id));
  }
  if (writes.length) await db.batch(writes);
}

function parseLegacyIngredients(value: string) {
  try {
    const rows = JSON.parse(value) as { code?: string; name?: string; grams?: number }[];
    return rows.map((row) => ({ code: row.code || normalizeIngredientCode(row.name || "食材"), name: row.name || "食材", grams: Number.isFinite(Number(row.grams)) ? Number(row.grams) : null }));
  } catch { return []; }
}

function round(value: number) { return Math.round(value * 10) / 10; }
