import { findHowToCookLearning, findHowToCookRecipe, HOW_TO_COOK_META, listHowToCookLearning, listHowToCookRecipes, parseHowToCookMarkdown, parseLearningArticle } from "../../howtocook-import";
import { getSessionUserFromRequest } from "../../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "recipes";

  if (type === "recipes") return Response.json({ meta: HOW_TO_COOK_META, items: listHowToCookRecipes() });
  if (type === "learning") return Response.json({ meta: HOW_TO_COOK_META, items: listHowToCookLearning() });

  const path = url.searchParams.get("path") ?? "";
  if (type === "recipe") {
    const recipe = findHowToCookRecipe(path);
    if (!recipe) return Response.json({ error: "未找到开源菜谱" }, { status: 404 });
    const parsed = parseHowToCookMarkdown(recipe.markdown);
    return Response.json({
      recipe: {
        id: recipe.id,
        catalogPath: recipe.path,
        title: parsed.title,
        description: parsed.description || recipe.summary,
        emoji: recipe.emoji,
        cook_minutes: parsed.cookMinutes,
        servings: parsed.servings,
        completeness_status: parsed.ingredients.length && parsed.steps.length ? "COMPLETE" : "PARTIAL",
        ingredientsDetailed: parsed.ingredients.map((ingredient, index) => ({
          id: `${recipe.id}-ingredient-${index + 1}`,
          ingredient_name: ingredient.name,
          ingredient_code: ingredient.code,
          quantity_value: ingredient.quantity,
          unit_code: ingredient.unit,
          quantity_g: ingredient.grams,
          optional: ingredient.optional,
        })),
        steps: parsed.steps.map((step, index) => ({ id: `${recipe.id}-step-${index + 1}`, step_no: index + 1, instruction: step.instruction, timer_seconds: step.timerSeconds })),
        source: { source_type: "GITHUB_MARKDOWN", source_name: "程序员做饭指南 / Anduin2017/HowToCook", source_url: recipe.sourceUrl, source_license: HOW_TO_COOK_META.license },
      },
    });
  }

  if (type === "article") {
    const article = findHowToCookLearning(path);
    if (!article) return Response.json({ error: "未找到厨艺文章" }, { status: 404 });
    return Response.json({ article: { ...article, markdown: undefined, ...parseLearningArticle(article.markdown), sourceLicense: HOW_TO_COOK_META.license } });
  }

  return Response.json({ error: "UNKNOWN_CATALOG_TYPE" }, { status: 400 });
}
