#!/usr/bin/env node
/**
 * Import a private Happy Kitchen OCR export into one SQLite household.
 *
 * The export is intentionally not part of this repository. Re-running this
 * command is safe: source-folder identifiers are used for de-duplication.
 */

import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeIngredientCode(name) {
  const normalized = name.trim().replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "").toLowerCase();
  return `custom:${encodeURIComponent(normalized).slice(0, 80)}`;
}

function parseIngredients(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? item : {};
    const name = String(row.name ?? "").trim();
    const quantity = Number(row.quantity ?? 0);
    const grams = row.grams == null || row.grams === "" ? null : Number(row.grams);
    return {
      name,
      code: normalizeIngredientCode(name),
      quantity,
      unit: String(row.unit ?? "g").trim() || "g",
      grams: Number.isFinite(grams) ? grams : null,
      optional: Boolean(row.optional),
      rawText: String(row.rawText ?? "").trim(),
    };
  }).filter((ingredient) => ingredient.name && Number.isFinite(ingredient.quantity) && ingredient.quantity > 0);
}

function parseSteps(value, ingredients) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = typeof item === "string" ? { instruction: item } : item && typeof item === "object" ? item : {};
    const instruction = String(row.instruction ?? "").trim();
    const timerSeconds = Number(row.timerSeconds);
    return {
      instruction,
      timerSeconds: Number.isFinite(timerSeconds) && timerSeconds > 0 ? timerSeconds : null,
      ingredientCodes: ingredients.filter((ingredient) => instruction.includes(ingredient.name)).map((ingredient) => ingredient.code),
    };
  }).filter((step) => step.instruction);
}

async function main() {
  const dbPath = resolve(readOption("--db") ?? "./data/happy-kitchen.db");
  const importPath = resolve(readOption("--import") ?? "./data/imports/sui-one-recipes.json");
  const db = new Database(dbPath);
  try {
    const payload = JSON.parse(await readFile(importPath, "utf8"));
    if (payload.format !== "happy-kitchen-local-ocr-recipe-import/v1" || !Array.isArray(payload.recipes)) {
      throw new Error("导入文件不是快乐厨房本地 OCR 菜谱格式");
    }
    const requestedHousehold = readOption("--household");
    const households = db.prepare("SELECT id FROM households ORDER BY created_at").all();
    const householdId = requestedHousehold ?? (households.length === 1 ? households[0].id : null);
    if (!householdId) throw new Error("存在多个家庭时必须传入 --household <家庭ID>");
    if (!households.some((household) => household.id === householdId)) throw new Error("指定的家庭不存在");

    const findExisting = db.prepare("SELECT r.id FROM recipes r JOIN recipe_sources s ON s.recipe_id=r.id WHERE r.household_id=? AND s.source_type='LOCAL_IMAGE_OCR' AND s.parser_version=? LIMIT 1");
    const insertRecipe = db.prepare("INSERT INTO recipes (id,household_id,title,description,emoji,cook_minutes,servings,cuisine_code,completeness_status,verification_status,ingredients_json,nutrition_json,tags_json,version_no,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'ACTIVE',?)");
    const insertIngredient = db.prepare("INSERT INTO recipe_ingredients (id,recipe_id,sort_order,ingredient_code,ingredient_name,quantity_value,unit_code,quantity_g,optional,raw_text) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const insertStep = db.prepare("INSERT INTO recipe_steps (id,recipe_id,step_no,instruction,timer_seconds,ingredient_codes_json) VALUES (?,?,?,?,?,?)");
    const insertSource = db.prepare("INSERT INTO recipe_sources (recipe_id,source_type,source_name,source_url,source_license,parser_version,imported_at) VALUES (?,?,?,?,?,?,?)");
    let imported = 0;
    let skipped = 0;
    let needsReview = 0;

    const importRecipes = db.transaction(() => {
      for (const recipe of payload.recipes.slice(0, 500)) {
        const sourceId = String(recipe?.sourceId ?? "").trim().slice(0, 180);
        const title = String(recipe?.title ?? "").trim().slice(0, 120);
        if (!sourceId || !title) { skipped += 1; continue; }
        const sourceKey = `local-ocr:${sourceId}`;
        if (findExisting.get(householdId, sourceKey)) { skipped += 1; continue; }
        const ingredients = parseIngredients(recipe.ingredients);
        const steps = parseSteps(recipe.steps, ingredients);
        const requiresReview = recipe.needsReview !== false || !ingredients.length || !steps.length;
        const id = `${householdId}-ocr-${randomUUID()}`;
        const now = new Date().toISOString();
        const legacyIngredients = ingredients.map((ingredient) => ({ code: ingredient.code, name: ingredient.name, grams: ingredient.grams }));
        insertRecipe.run(
          id, householdId, title, String(recipe.description ?? "本地图片 OCR 导入；请在烹饪前复核内容。").slice(0, 500), String(recipe.emoji ?? "🍲").slice(0, 10),
          Math.max(1, Math.min(240, Number(recipe.cookMinutes ?? 30) || 30)), String(recipe.servings ?? "1").slice(0, 20), "CHINESE",
          requiresReview ? "PARTIAL" : "COMPLETE", requiresReview ? "OCR_NEEDS_REVIEW" : "OCR_REVIEWED", JSON.stringify(legacyIngredients),
          JSON.stringify({ energy: 0, protein: 0, fiber: 0, fat: 0, carbs: 0, source: "UNAVAILABLE" }),
          JSON.stringify(["隋卞菜谱", "本地图片 OCR", ...(requiresReview ? ["待核对"] : [])]), now,
        );
        ingredients.forEach((ingredient, index) => insertIngredient.run(
          `${id}-ingredient-${index + 1}`, id, index, ingredient.code, ingredient.name, String(ingredient.quantity), ingredient.unit,
          ingredient.grams == null ? null : String(ingredient.grams), ingredient.optional ? 1 : 0, ingredient.rawText || `${ingredient.name} ${ingredient.quantity}${ingredient.unit}`,
        ));
        steps.forEach((step, index) => insertStep.run(`${id}-step-${index + 1}`, id, index + 1, step.instruction, step.timerSeconds, JSON.stringify(step.ingredientCodes)));
        insertSource.run(id, "LOCAL_IMAGE_OCR", `${String(payload.source ?? "隋卞一做教做菜")} · 可编辑副本`, null, null, sourceKey, now);
        imported += 1;
        if (requiresReview) needsReview += 1;
      }
    });
    importRecipes();
    console.log(JSON.stringify({ householdId, importFile: basename(importPath), imported, skipped, needsReview }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
