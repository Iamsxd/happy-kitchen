#!/usr/bin/env node
/**
 * Add only explicitly OCR-recognised quantities to previously imported local
 * image recipes. It never guesses a weight and never overwrites an existing
 * household ingredient row, so it is safe to run again after manual editing.
 *
 * Usage:
 *   node scripts/reconcile-local-ocr-recipes.mjs --db ./data/happy-kitchen.db \
 *     --import /path/to/sui-one-recipes.json --apply
 */

import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const UNIT_PATTERNS = [
  ["公斤", "kg", 1000], ["千克", "kg", 1000], ["kg", "kg", 1000],
  ["克", "g", 1], ["g", "g", 1],
  ["毫升", "ml", null], ["ml", "ml", null],
  ["斤", "斤", 500], ["两", "两", 50],
  ["个", "个", null], ["只", "只", null], ["片", "片", null], ["根", "根", null],
  ["把", "把", null], ["勺", "勺", null], ["匙", "匙", null], ["瓣", "瓣", null],
  ["块", "块", null], ["碗", "碗", null],
];
const UNIT_PATTERN = UNIT_PATTERNS.map(([source]) => source).sort((a, b) => b.length - a.length).join("|");
const WEIGHT_UNIT_PATTERN = ["公斤", "千克", "kg", "克", "g", "毫升", "ml", "斤", "两"].join("|");
const CHINESE_NUMBERS = new Map([["半", 0.5], ["一", 1], ["二", 2], ["两", 2], ["三", 3], ["四", 4], ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9], ["十", 10]]);
const NOISE_NAMES = new Set(["食材", "备菜", "制作", "过程", "食材处理", "原料", "步骤", "提示", "小贴士", "适量", "以", "同时", "然后", "可以", "这样", "这个", "那个", "一下"]);
const ACTION_WORD = /加入|倒入|放入|放|加|用|把|将|下|取|备|切|炖|煮|炒|蒸|烧|勾|淋|浸|泡|需要|大约|约|可以|锅里|锅中|砂锅中|水中|汤里|肉馅里|视频中的|每次|微辣|中辣|特辣|补|来|处理|搅匀|切成|摆出|沿着|搅拌|抓匀|煸香|炝锅|润锅|焯水|和面|点缀|上色|调味/;
const INGREDIENT_ALIASES = new Map([["耗油", "蚝油"], ["味精粉", "味精"], ["葱姜蒜米", "葱姜蒜末"], ["热油", "食用油"], ["底油", "食用油"], ["和面面粉", "面粉"], ["馅儿韭菜", "韭菜"], ["常温水", "水"]]);

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeIngredientCode(name) {
  const normalized = name.trim().replace(/[（(].*?[)）]/g, "").replace(/\s+/g, "").toLowerCase();
  return `custom:${encodeURIComponent(normalized).slice(0, 80)}`;
}

function normalizeName(value) {
  let name = String(value ?? "").replace(/[（(][^)）]*[)）]/g, "").replace(/[\s、，,。；;：:！!？?]/g, "");
  name = name.replace(/^(?:和面|馅儿|去皮)/, "").replace(/(?:再次搅拌|搅拌均匀|抓匀去?|煸香|炝锅|润锅|焯水|和面|点缀|上色|调味)$/, "");
  name = name.replace(/(?:半|一|二|两|三|四|五|六|七|八|九|十|\d+)(?:个|只|片|根|把|勺|匙|瓣|块|碗|斤|两)?$/, "");
  if (!/^[\u3400-\u9fff]{1,8}$/.test(name) || NOISE_NAMES.has(name) || name.includes("的") || name.includes("和") || /为|例|左右|以上|兑|瓶/.test(name) || ACTION_WORD.test(name)) return "";
  return INGREDIENT_ALIASES.get(name) ?? name;
}

function unitInfo(rawUnit) {
  const normalized = String(rawUnit).toLowerCase();
  return UNIT_PATTERNS.find(([source]) => source.toLowerCase() === normalized) ?? null;
}

function makeIngredient(name, quantity, rawUnit, rawText) {
  const normalizedName = normalizeName(name);
  const unit = unitInfo(rawUnit);
  const numericQuantity = Number(quantity);
  if (!normalizedName || !unit || !Number.isFinite(numericQuantity) || numericQuantity <= 0) return null;
  const [, unitCode, gramFactor] = unit;
  return {
    name: normalizedName,
    code: normalizeIngredientCode(normalizedName),
    quantity: numericQuantity,
    unit: unitCode,
    grams: gramFactor == null ? null : numericQuantity * gramFactor,
    optional: false,
    rawText: String(rawText).trim(),
  };
}

function parseStructuredIngredients(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? item : {};
    return makeIngredient(row.name, row.quantity, row.unit ?? "g", row.rawText ?? "");
  }).filter(Boolean);
}

/**
 * Finds only directly adjacent name/quantity pairs such as “马蹄4个”,
 * “10克的葱” and “盐5克”. Quantities inside cooking times are deliberately
 * ignored because minutes are not in the accepted unit list.
 */
export function extractExplicitIngredients(text, { allowNamedFirst = true, unitPattern = UNIT_PATTERN } = {}) {
  const source = String(text ?? "").replace(/\r?\n/g, "，");
  const output = [];
  const namedFirst = new RegExp(`([\\u3400-\\u9fff]{1,16}?)(?:（[^）]{0,16}）|\\([^)]{0,16}\\))?\\s*(\\d+(?:\\.\\d+)?|[半一二两三四五六七八九十])\\s*(${unitPattern})`, "gi");
  const quantityFirst = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitPattern})\\s*(?:的)?([\\u3400-\\u9fff]{1,8})(?=[、，,。；;：:！!？?）)\\s]|$)`, "gi");
  if (allowNamedFirst) {
    for (const match of source.matchAll(namedFirst)) {
      const value = CHINESE_NUMBERS.get(match[2]) ?? Number(match[2]);
      const ingredient = makeIngredient(match[1], value, match[3], match[0]);
      if (ingredient) output.push(ingredient);
    }
  }
  for (const match of source.matchAll(quantityFirst)) {
    const ingredient = makeIngredient(match[3], Number(match[1]), match[2], match[0]);
    if (ingredient) output.push(ingredient);
  }
  return output;
}

function ingredientSourceText(recipe) {
  const unresolved = Array.isArray(recipe.unresolvedIngredients) ? recipe.unresolvedIngredients.filter((line) => !/过程|制作|备菜|食材处理|\d{1,2}[:：]\d{2}/.test(String(line))) : [];
  const pages = Array.isArray(recipe.ocrPages) ? recipe.ocrPages : [];
  const pageText = pages.filter((page) => /^\s*食材/.test(String(page?.text ?? ""))).map((page) => String(page?.text ?? "")).join("\n");
  const stepText = Array.isArray(recipe.steps) ? recipe.steps.map((step) => typeof step === "string" ? step : step?.instruction).join("\n") : "";
  return { ingredientText: [unresolved.join("\n"), pageText].join("\n"), stepText };
}

export function reconcileIngredients(recipe) {
  const merged = [...parseStructuredIngredients(recipe?.ingredients)];
  const existing = new Set(merged.map((item) => item.code));
  const { ingredientText, stepText } = ingredientSourceText(recipe ?? {});
  const additions = [
    ...extractExplicitIngredients(ingredientText),
    ...extractExplicitIngredients(stepText, { allowNamedFirst: false, unitPattern: WEIGHT_UNIT_PATTERN }),
  ];
  for (const ingredient of additions) {
    if (existing.has(ingredient.code)) continue;
    existing.add(ingredient.code);
    merged.push(ingredient);
  }
  return merged;
}

async function main() {
  const dbPath = resolve(readOption("--db") ?? "./data/happy-kitchen.db");
  const importPath = resolve(readOption("--import") ?? "./data/imports/sui-one-recipes.json");
  const apply = process.argv.includes("--apply");
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

    const findRecipe = db.prepare("SELECT r.id FROM recipes r JOIN recipe_sources s ON s.recipe_id=r.id WHERE r.household_id=? AND s.source_type='LOCAL_IMAGE_OCR' AND s.parser_version=? LIMIT 1");
    const rowsForRecipe = db.prepare("SELECT ingredient_code, ingredient_name, quantity_g FROM recipe_ingredients WHERE recipe_id=? ORDER BY sort_order");
    const insertIngredient = db.prepare("INSERT INTO recipe_ingredients (id,recipe_id,sort_order,ingredient_code,ingredient_name,quantity_value,unit_code,quantity_g,optional,raw_text) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const updateRecipe = db.prepare("UPDATE recipes SET ingredients_json=?, verification_status='OCR_RECONCILED', version_no=version_no+1 WHERE id=? AND household_id=?");
    let recipesMatched = 0;
    let recipesEnriched = 0;
    let ingredientsAdded = 0;
    let recipesWithQuantities = 0;
    const preview = [];

    const reconcile = db.transaction(() => {
      for (const recipe of payload.recipes.slice(0, 500)) {
        const sourceId = String(recipe?.sourceId ?? "").trim().slice(0, 180);
        if (!sourceId) continue;
        const target = findRecipe.get(householdId, `local-ocr:${sourceId}`);
        if (!target) continue;
        recipesMatched += 1;
        const existingRows = rowsForRecipe.all(target.id);
        const existingCodes = new Set(existingRows.map((row) => String(row.ingredient_code)));
        const additions = reconcileIngredients(recipe).filter((ingredient) => !existingCodes.has(ingredient.code));
        if (additions.length) {
          recipesEnriched += 1;
          ingredientsAdded += additions.length;
          preview.push({ title: String(recipe.title), added: additions.map((item) => `${item.name} ${item.quantity}${item.unit}`) });
          if (apply) {
            additions.forEach((ingredient, index) => insertIngredient.run(
              `${target.id}-reconciled-${randomUUID()}`, target.id, existingRows.length + index, ingredient.code, ingredient.name,
              String(ingredient.quantity), ingredient.unit, ingredient.grams == null ? null : String(ingredient.grams), ingredient.optional ? 1 : 0, ingredient.rawText,
            ));
          }
        }
        const finalRows = apply ? [...existingRows, ...additions] : existingRows;
        if (finalRows.some((row) => row.quantity_g != null) || additions.some((item) => item.grams != null || item.quantity > 0)) recipesWithQuantities += 1;
        if (apply && additions.length) {
          const legacyIngredients = [...existingRows, ...additions].map((item) => ({
            code: item.ingredient_code ?? item.code, name: item.ingredient_name ?? item.name, grams: item.quantity_g ?? item.grams,
          }));
          updateRecipe.run(JSON.stringify(legacyIngredients), target.id, householdId);
        }
      }
    });
    reconcile();
    console.log(JSON.stringify({
      mode: apply ? "applied" : "dry-run", householdId, importFile: basename(importPath), recipesMatched,
      recipesEnriched, ingredientsAdded, recipesWithQuantities, preview: preview.slice(0, 12),
    }, null, 2));
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
