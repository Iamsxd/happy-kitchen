export type Nutrition = { energy: number; protein: number; fiber: number; fat: number; carbs: number };

type IngredientNutrition = Nutrition & { aliases?: string[] };

const zero: Nutrition = { energy: 0, protein: 0, fiber: 0, fat: 0, carbs: 0 };

// Values are rounded per 100g from commonly used food composition references.
// They are a planning aid only, never a medical prescription.
const ingredientNutrition: Record<string, IngredientNutrition> = {
  tomato: { energy: 18, protein: 0.9, fiber: 1.2, fat: 0.2, carbs: 3.9, aliases: ["番茄", "西红柿"] },
  egg: { energy: 143, protein: 12.6, fiber: 0, fat: 9.5, carbs: 0.7, aliases: ["鸡蛋", "蛋"] },
  spinach: { energy: 23, protein: 2.9, fiber: 2.2, fat: 0.4, carbs: 3.6, aliases: ["菠菜"] },
  chicken: { energy: 165, protein: 31, fiber: 0, fat: 3.6, carbs: 0, aliases: ["鸡胸肉", "鸡肉"] },
  pasta: { energy: 371, protein: 13, fiber: 3.2, fat: 1.5, carbs: 75, aliases: ["意面", "意大利面"] },
  beef: { energy: 250, protein: 26, fiber: 0, fat: 15, carbs: 0, aliases: ["牛肉"] },
  rice: { energy: 116, protein: 2.6, fiber: 0.3, fat: 0.3, carbs: 25.9, aliases: ["米饭", "大米"] },
  tofu: { energy: 76, protein: 8.1, fiber: 0.3, fat: 4.2, carbs: 1.9, aliases: ["豆腐"] },
  mushroom: { energy: 22, protein: 3.1, fiber: 1, fat: 0.3, carbs: 3.3, aliases: ["菌菇", "蘑菇", "香菇"] },
  noodle: { energy: 138, protein: 4.5, fiber: 1.8, fat: 2.1, carbs: 25, aliases: ["面条", "挂面"] },
  pork: { energy: 242, protein: 27, fiber: 0, fat: 14, carbs: 0, aliases: ["猪肉", "五花肉", "里脊肉"] },
  fish: { energy: 129, protein: 20, fiber: 0, fat: 4.2, carbs: 0, aliases: ["鱼", "鱼肉", "鲈鱼", "鳕鱼"] },
  shrimp: { energy: 99, protein: 24, fiber: 0, fat: 0.3, carbs: 0.2, aliases: ["虾", "虾仁"] },
  broccoli: { energy: 34, protein: 2.8, fiber: 2.6, fat: 0.4, carbs: 6.6, aliases: ["西兰花", "花椰菜"] },
  carrot: { energy: 41, protein: 0.9, fiber: 2.8, fat: 0.2, carbs: 9.6, aliases: ["胡萝卜"] },
  cabbage: { energy: 25, protein: 1.3, fiber: 2.5, fat: 0.1, carbs: 5.8, aliases: ["白菜", "卷心菜", "甘蓝"] },
  potato: { energy: 77, protein: 2, fiber: 2.2, fat: 0.1, carbs: 17, aliases: ["土豆", "马铃薯"] },
  cucumber: { energy: 15, protein: 0.7, fiber: 0.5, fat: 0.1, carbs: 3.6, aliases: ["黄瓜"] },
  pepper: { energy: 40, protein: 1.9, fiber: 1.5, fat: 0.4, carbs: 9, aliases: ["青椒", "彩椒", "辣椒"] },
  onion: { energy: 40, protein: 1.1, fiber: 1.7, fat: 0.1, carbs: 9.3, aliases: ["洋葱"] },
  corn: { energy: 96, protein: 3.4, fiber: 2.4, fat: 1.5, carbs: 21, aliases: ["玉米"] },
  pumpkin: { energy: 26, protein: 1, fiber: 0.5, fat: 0.1, carbs: 6.5, aliases: ["南瓜"] },
  oats: { energy: 389, protein: 16.9, fiber: 10.6, fat: 6.9, carbs: 66.3, aliases: ["燕麦"] },
  milk: { energy: 61, protein: 3.2, fiber: 0, fat: 3.3, carbs: 4.8, aliases: ["牛奶"] },
  yogurt: { energy: 72, protein: 3.8, fiber: 0, fat: 3.2, carbs: 7.1, aliases: ["酸奶"] },
  soybean: { energy: 172, protein: 16.6, fiber: 6, fat: 9, carbs: 10, aliases: ["黄豆", "毛豆"] },
  "cooking-oil": { energy: 884, protein: 0, fiber: 0, fat: 100, carbs: 0, aliases: ["食用油", "植物油", "橄榄油"] },
};

function cleanName(value: string) {
  const raw = value.replace(/^custom:/, "");
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* keep original value */ }
  return decoded.replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "").trim().toLowerCase();
}

export function ingredientNutritionFor(code: string, name = ""): IngredientNutrition | null {
  if (ingredientNutrition[code]) return ingredientNutrition[code];
  const clean = cleanName(name || code);
  return Object.values(ingredientNutrition).find((item) => item.aliases?.some((alias) => clean.includes(alias))) ?? null;
}

export function estimateRecipeNutrition(ingredients: { code?: string; name?: string; grams?: number | null }[]): Nutrition & { knownIngredientCount: number; totalIngredientCount: number } {
  let knownIngredientCount = 0;
  const sum = { ...zero };
  for (const ingredient of ingredients) {
    const grams = Number(ingredient.grams);
    const item = ingredientNutritionFor(String(ingredient.code ?? ""), String(ingredient.name ?? ""));
    if (!item || !Number.isFinite(grams) || grams <= 0) continue;
    knownIngredientCount += 1;
    const scale = grams / 100;
    sum.energy += item.energy * scale;
    sum.protein += item.protein * scale;
    sum.fiber += item.fiber * scale;
    sum.fat += item.fat * scale;
    sum.carbs += item.carbs * scale;
  }
  return {
    energy: Math.round(sum.energy), protein: Math.round(sum.protein * 10) / 10, fiber: Math.round(sum.fiber * 10) / 10,
    fat: Math.round(sum.fat * 10) / 10, carbs: Math.round(sum.carbs * 10) / 10,
    knownIngredientCount, totalIngredientCount: ingredients.length,
  };
}

export function isUsableNutrition(value: Partial<Nutrition> | null | undefined) {
  return Boolean(value && (Number(value.energy) > 0 || Number(value.protein) > 0));
}
