import { readFile } from "node:fs/promises";

export type LocalOcrIngredient = { name?: unknown; quantity?: unknown; unit?: unknown; grams?: unknown; optional?: unknown; rawText?: unknown };
export type LocalOcrStep = { instruction?: unknown; timerSeconds?: unknown };
export type LocalOcrRecipe = {
  sourceId?: unknown; title?: unknown; description?: unknown; emoji?: unknown; cookMinutes?: unknown; servings?: unknown;
  ingredients?: unknown; steps?: unknown; needsReview?: unknown; ocrConfidence?: unknown;
};

export const LOCAL_OCR_RECIPE_IMPORT_PATH = process.env.LOCAL_OCR_RECIPE_IMPORT_PATH || "/data/imports/sui-one-recipes.json";

export async function loadLocalOcrRecipeImport() {
  let raw: string;
  try {
    // This file deliberately lives on the persistent NAS volume, outside the
    // application bundle. It must not cause Next to trace the whole project.
    raw = await readFile(/* turbopackIgnore: true */ LOCAL_OCR_RECIPE_IMPORT_PATH, "utf8");
  } catch {
    throw new Error(`未找到本地图片菜谱导入文件。请将 sui-one-recipes.json 放入 NAS 数据目录的 imports 文件夹（容器路径：${LOCAL_OCR_RECIPE_IMPORT_PATH}）。`);
  }
  let parsed: { format?: unknown; source?: unknown; recipes?: unknown };
  try { parsed = JSON.parse(raw) as { format?: unknown; source?: unknown; recipes?: unknown }; } catch { throw new Error("本地图片菜谱导入文件不是有效 JSON"); }
  if (parsed.format !== "happy-kitchen-local-ocr-recipe-import/v1" || !Array.isArray(parsed.recipes)) throw new Error("本地图片菜谱导入文件格式不受支持");
  const recipes = parsed.recipes.filter((item): item is LocalOcrRecipe => Boolean(item && typeof item === "object")).slice(0, 500);
  if (!recipes.length) throw new Error("本地图片菜谱导入文件中没有可导入的菜谱");
  return { source: typeof parsed.source === "string" ? parsed.source : "本地图片 OCR", recipes };
}
