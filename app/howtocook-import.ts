import catalogData from "../data/howtocook-catalog.json" with { type: "json" };
import { normalizeIngredientCode, type RecipeIngredientInput, type RecipeStepInput } from "../db/kitchen";

export type HowToCookCatalogRecipe = {
  id: string; title: string; category: string; emoji: string; path: string;
  summary: string; sourceUrl: string; markdown: string;
};
export type HowToCookLearningArticle = {
  id: string; title: string; category: string; path: string;
  summary: string; sourceUrl: string; markdown: string;
};

const catalog = catalogData as {
  source: string; revision: string; license: string; generatedAt: string;
  recipes: HowToCookCatalogRecipe[];
  learning: HowToCookLearningArticle[];
};

export const HOW_TO_COOK_META = {
  source: catalog.source,
  revision: catalog.revision,
  license: catalog.license,
  recipeCount: catalog.recipes.length,
  learningCount: catalog.learning.length,
};

export function listHowToCookRecipes() {
  return catalog.recipes.map((recipe) => ({ id: recipe.id, title: recipe.title, category: recipe.category, emoji: recipe.emoji, path: recipe.path, summary: recipe.summary, sourceUrl: recipe.sourceUrl }));
}

export function findHowToCookRecipe(path: string) {
  return catalog.recipes.find((recipe) => recipe.path === path) ?? null;
}

export function listHowToCookLearning() {
  return catalog.learning.map((article) => ({ id: article.id, title: article.title, category: article.category, path: article.path, summary: article.summary, sourceUrl: article.sourceUrl }));
}

export function findHowToCookLearning(path: string) {
  return catalog.learning.find((article) => article.path === path) ?? null;
}

export function parseHowToCookMarkdown(markdown: string) {
  const clean = markdown.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "");
  const title = clean.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(/的做法$/, "").trim() || "导入菜谱";
  const firstHeading = clean.search(/^##\s+/m);
  const opening = clean.slice(clean.indexOf("\n") + 1, firstHeading > 0 ? firstHeading : undefined);
  const description = plain(opening.split("\n").find((line) => plain(line).length > 10) || "来自《程序员做饭指南》").slice(0, 220);
  const difficulty = (clean.match(/预估烹饪难度[：:]([^\n]+)/)?.[1].match(/★/g) ?? []).length || 2;
  const cookMinutes = Number(clean.match(/(?:烹饪|制作|耗时)[^\n]{0,12}?(\d+)\s*分钟/)?.[1] ?? description.match(/(\d+)\s*分钟/)?.[1] ?? 30);
  const servings = Number(clean.match(/(?:一份正好够|建议份数|份量)[^\d]{0,8}(\d+(?:\.\d+)?)\s*个?人?/)?.[1] ?? 1);
  const calculation = section(clean, ["计算"]);
  const required = section(clean, ["必备原料和工具", "必备原料", "原料"]);
  const optionalNames = new Set([...required.matchAll(/^[*-]\s+(.+?)（可选）\s*$/gm)].map((match) => match[1].trim()));
  let ingredients = [...calculation.matchAll(/^[*-]\s+(.+?)\s*=\s*(.+)$/gm)]
    .map((match) => parseIngredient(match[1].trim(), match[2].trim(), servings, optionalNames.has(match[1].trim())));
  if (!ingredients.length) ingredients = parseRequiredIngredients(required, servings);
  const steps = parseSteps(section(clean, ["操作", "制作步骤", "做法"]));
  const ingredientNames = ingredients.map((ingredient) => ingredient.name);
  for (const step of steps) step.ingredientCodes = ingredients.filter((ingredient) => ingredientNames.some((name) => name === ingredient.name && step.instruction.includes(name))).map((ingredient) => ingredient.code!).filter(Boolean);
  return { title, description, difficulty, cookMinutes, servings, ingredients, steps };
}

export function parseLearningArticle(markdown: string) {
  const clean = markdown.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "").replace(/!\[[^\]]*]\([^)]*\)/g, "");
  const title = clean.match(/^#\s+(.+)$/m)?.[1]?.trim() || "厨艺知识";
  const chunks = clean.split(/^##\s+/m);
  const intro = plain(chunks[0].replace(/^#.*$/m, "")).slice(0, 500);
  const sections = chunks.slice(1).map((chunk) => {
    const [heading, ...body] = chunk.split("\n");
    const paragraphs = body.join("\n").split(/\n{2,}/).map(plain).filter(Boolean);
    return { heading: plain(heading), paragraphs };
  }).filter((item) => item.heading && item.paragraphs.length);
  return { title, intro, sections };
}

function parseRequiredIngredients(value: string, servings: number): RecipeIngredientInput[] {
  return [...value.matchAll(/^[*-]\s+(.+)$/gm)].map((match) => {
    const raw = match[1].replace(/（可选）/g, "").trim();
    const name = raw.split(/[：:=，,（(]/)[0].replace(/`/g, "").trim();
    const optional = /可选|适量/.test(match[1]);
    const quantityMatch = raw.match(/(\d+(?:\.\d+)?)\s*(g|克|kg|千克|ml|毫升|个|勺|片|根|颗)/i);
    const quantity = Number(quantityMatch?.[1] ?? 1);
    const unit = String(quantityMatch?.[2] ?? "适量").replace("克", "g").replace("千克", "kg").replace("毫升", "ml");
    const grams = unit === "g" ? quantity * servings : unit === "kg" ? quantity * 1000 * servings : null;
    return { code: normalizeIngredientCode(name), name, quantity, unit, grams, optional, rawText: match[1].trim() };
  }).filter((item) => item.name && !/锅|刀|碗|盘|勺子|烤箱|空气炸锅|电饭煲/.test(item.name));
}

function parseIngredient(name: string, formula: string, servings: number, optional: boolean): RecipeIngredientInput {
  const normalized = formula.replace(/`/g, "");
  const approxG = Number(normalized.match(/(?:共)?约\s*(\d+(?:\.\d+)?)\s*g/i)?.[1]);
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*[-~～至]\s*(\d+(?:\.\d+)?)\s*(g|ml|毫升|克|kg|千克|个|勺|片|根|颗)/i);
  const simple = normalized.match(/(\d+(?:\.\d+)?)\s*(g|ml|毫升|克|kg|千克|个|勺|片|根|颗)/i);
  let quantity = Number(range?.[2] ?? simple?.[1] ?? 1);
  const unit = String(range?.[3] ?? simple?.[2] ?? "适量").toLowerCase().replace("克", "g").replace("千克", "kg").replace("毫升", "ml");
  if (/食用油/.test(name) && /鸡蛋\/个/.test(normalized)) quantity *= 1.5 * servings;
  let grams: number | null = Number.isFinite(approxG) && approxG > 0 ? approxG * servings : unit === "g" ? quantity * servings : unit === "kg" ? quantity * 1000 * servings : null;
  if (/食用油/.test(name) && unit === "ml") grams = Math.round(quantity * 0.92 * 10) / 10;
  if (name === "鸡蛋" && unit === "个") grams = quantity * 50 * servings;
  if (/西红柿|番茄/.test(name) && unit === "个" && grams == null) grams = quantity * 180 * servings;
  return { code: normalizeIngredientCode(name), name, quantity: quantity * (unit === "g" || unit === "kg" ? servings : 1), unit, grams, optional, rawText: `${name} = ${formula}` };
}

function parseSteps(value: string): RecipeStepInput[] {
  const numbered = [...value.matchAll(/^\s*(\d+)[.、]\s+(.+?)(?=^\s*\d+[.、]\s+|\s*$)/gms)];
  const rows = numbered.length ? numbered.map((match) => match[2]) : [...value.matchAll(/^[*-]\s+(.+)$/gm)].map((match) => match[1]);
  return rows.map((row) => {
    const instruction = plain(row.replace(/^\s*[-*]\s+/gm, "提示："));
    const minutes = Number(instruction.match(/(\d+)\s*分钟/)?.[1] ?? 0);
    const seconds = Number(instruction.match(/(\d+)\s*秒/)?.[1] ?? 0);
    return { instruction, timerSeconds: minutes ? minutes * 60 : seconds || null };
  }).filter((step) => step.instruction.length > 1);
}

function section(markdown: string, names: string[]) {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  const match = headings.find((heading) => names.some((name) => plain(heading[1]).startsWith(name)));
  if (!match || match.index == null) return "";
  const start = match.index + match[0].length;
  const next = headings.find((heading) => (heading.index ?? 0) > match.index!);
  return markdown.slice(start, next?.index ?? markdown.length);
}

function plain(value: string) {
  return value.replace(/\[([^\]]+)]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "").replace(/[`*_>#]/g, "").replace(/^[-+]\s+/gm, "").replace(/\s+/g, " ").trim();
}
