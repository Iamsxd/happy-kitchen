import type { RecipeIngredientInput, RecipeStepInput } from "./kitchen";

export type NorthChinaGuideRecipe = {
  slug: string;
  title: string;
  emoji: string;
  cookMinutes: number;
  season: "春季" | "夏季" | "秋季" | "冬季";
  dailyEnergy: 1200 | 1400 | 1600;
  meal: "早餐" | "中餐" | "晚餐";
  ingredients: RecipeIngredientInput[];
  steps: RecipeStepInput[];
};

export const NORTH_CHINA_GUIDE_SOURCE = {
  type: "NATIONAL_GUIDE_PDF",
  name: "国家卫生健康委《成人肥胖食养指南（2024年版）》·附录3华北地区食谱",
  parserVersion: "north-china-guide-v1",
};

const g = (name: string, quantity: number, code?: string, optional = false): RecipeIngredientInput => ({ name, quantity, unit: "g", grams: quantity, code, optional });
const ml = (name: string, quantity: number, code?: string): RecipeIngredientInput => ({ name, quantity, unit: "ml", grams: quantity, code });
const s = (instruction: string, timerSeconds?: number): RecipeStepInput => ({ instruction, timerSeconds });

// The guide supplies food amounts as parts of one person's daily meal pattern.
// Steps below are a practical home-cooking compilation, not a verbatim clinical recipe.
export const NORTH_CHINA_OBESITY_GUIDE_RECIPES: NorthChinaGuideRecipe[] = [
  {
    slug: "yam-egg-flatbread", title: "山药粉鸡蛋软饼", emoji: "🥞", cookMinutes: 18, season: "春季", dailyEnergy: 1200, meal: "早餐",
    ingredients: [g("山药粉", 50, "custom:%E5%B1%B1%E8%8D%AF%E7%B2%89"), g("全麦面粉", 10, "custom:%E5%85%A8%E9%BA%A6%E9%9D%A2%E7%B2%89"), ml("脱脂牛奶", 50, "milk"), g("鸡蛋", 50, "egg")],
    steps: [s("将山药粉、全麦面粉和脱脂牛奶搅匀，静置 3 分钟让粉类吸水。", 180), s("鸡蛋打散后倒入面糊，搅拌至没有干粉。"), s("不粘锅小火预热，倒入面糊摊平；全程少油或不额外加油。", 60), s("两面各烙至凝固、边缘微黄后出锅。", 300)],
  },
  {
    slug: "shrimp-broccoli", title: "虾仁炒西兰花", emoji: "🦐", cookMinutes: 12, season: "春季", dailyEnergy: 1200, meal: "晚餐",
    ingredients: [g("鲜虾仁", 50, "shrimp"), g("西兰花", 70, "broccoli"), g("蒜", 3, "custom:%E8%92%9C"), g("食用油", 3, "cooking-oil"), g("盐", 0.5, "salt")],
    steps: [s("西兰花切小朵洗净，沸水焯 1 分钟后捞出沥干。", 60), s("虾仁洗净，用厨房纸吸干表面水分。"), s("锅中放食用油，小火炒香蒜末，放入虾仁炒至变色。", 90), s("加入西兰花快速翻炒，调入少量盐，炒匀即可出锅。", 90)],
  },
  {
    slug: "shepherd-purse-wonton", title: "荠菜鲜肉馄饨", emoji: "🥣", cookMinutes: 30, season: "春季", dailyEnergy: 1400, meal: "早餐",
    ingredients: [g("面粉", 50, "custom:%E9%9D%A2%E7%B2%89"), g("荠菜", 50, "custom:%E8%8D%A0%E8%8F%9C"), g("猪里脊肉", 30, "pork"), g("香菜", 5, "custom:%E9%A6%99%E8%8F%9C"), g("姜", 2, "custom:%E5%A7%9C"), g("盐", 0.5, "salt")],
    steps: [s("面粉加少量清水揉成偏硬面团，盖住醒 15 分钟；也可用等量市售馄饨皮代替。", 900), s("荠菜焯水后挤干切碎；里脊肉剁成末，和姜末、荠菜、少量盐拌匀。", 180), s("将面团擀成薄皮并包入少量馅料，捏紧封口。", 480), s("锅中水沸后下馄饨，轻推防粘；再次沸腾后煮至馄饨浮起、皮透亮。", 240), s("盛碗后撒香菜；汤底以清汤为主，避免额外高盐调味。")],
  },
  {
    slug: "spinach-hutazi", title: "菠菜糊塌子", emoji: "🥬", cookMinutes: 15, season: "春季", dailyEnergy: 1600, meal: "早餐",
    ingredients: [g("小菠菜", 50, "spinach"), g("全麦面粉", 40, "custom:%E5%85%A8%E9%BA%A6%E9%9D%A2%E7%B2%89"), g("食用油", 2, "cooking-oil"), g("盐", 0.5, "salt")],
    steps: [s("菠菜洗净切碎，加入全麦面粉和适量清水，调成能缓慢流动的面糊。"), s("加入少量盐搅匀，静置 3 分钟。", 180), s("不粘锅刷薄油，小火倒入一半面糊摊圆。"), s("待底面定型后翻面，两面烙熟即可。", 300)],
  },
  {
    slug: "toon-egg", title: "香椿炒鸡蛋", emoji: "🍳", cookMinutes: 8, season: "春季", dailyEnergy: 1600, meal: "早餐",
    ingredients: [g("香椿", 30, "custom:%E9%A6%99%E6%A4%BF"), g("鸡蛋", 50, "egg"), g("食用油", 3, "cooking-oil"), g("盐", 0.5, "salt")],
    steps: [s("香椿洗净，沸水焯 30 秒后沥干切碎。", 30), s("鸡蛋打散，加入香椿碎和少量盐拌匀。"), s("锅中放油，中小火倒入蛋液，待边缘凝固后轻推翻炒至熟。", 120)],
  },
  {
    slug: "steamed-perch", title: "豉香蒸鲈鱼", emoji: "🐟", cookMinutes: 18, season: "夏季", dailyEnergy: 1400, meal: "中餐",
    ingredients: [g("淡水鲈鱼", 60, "fish"), g("葱姜丝", 5, "custom:%E8%91%B1%E5%A7%9C%E4%B8%9D"), g("香菜", 10, "custom:%E9%A6%99%E8%8F%9C"), g("豆豉", 3, "custom:%E8%B1%86%E8%B1%89"), g("盐", 0.3, "salt")],
    steps: [s("鲈鱼洗净擦干，在鱼肉较厚处划一刀，铺上葱姜丝和豆豉。"), s("蒸锅水沸后放入鱼盘，大火蒸至鱼肉变白、可轻易拨开。", 600), s("关火后焖 2 分钟，取出撒香菜；豆豉已有咸味，通常无需再加盐。", 120)],
  },
  {
    slug: "pork-bean-noodles", title: "肉片豆角焖面", emoji: "🍜", cookMinutes: 25, season: "夏季", dailyEnergy: 1400, meal: "晚餐",
    ingredients: [g("猪瘦肉", 20, "pork"), g("鲜切面", 60, "noodle"), g("土豆", 50, "potato"), g("香菇", 30, "mushroom"), g("豆角", 80, "custom:%E8%B1%86%E8%A7%92"), g("食用油", 3, "cooking-oil"), g("盐", 0.8, "salt")],
    steps: [s("豆角掐段，土豆切小块，香菇切片，猪瘦肉切薄片。"), s("锅中放油，肉片炒至变色后加入土豆、香菇和豆角翻炒。", 180), s("加入刚好没过食材一半的热水，少量盐调味，煮至豆角基本熟。", 480), s("将鲜切面均匀铺在食材上，盖盖小火焖至面条熟透，中途可沿锅边补少量热水。", 480), s("开盖将面条和菜拌匀，确认豆角完全熟透后出锅。", 60)],
  },
  {
    slug: "sauteed-shrimp", title: "清炒虾仁", emoji: "🦐", cookMinutes: 10, season: "秋季", dailyEnergy: 1200, meal: "中餐",
    ingredients: [g("鲜虾仁", 50, "shrimp"), g("黄瓜", 40, "cucumber"), g("胡萝卜", 10, "carrot"), g("食用油", 3, "cooking-oil"), g("盐", 0.5, "salt")],
    steps: [s("虾仁洗净沥干；黄瓜切片，胡萝卜切薄片。"), s("锅中放油，先下胡萝卜炒软，再下虾仁炒至变色。", 120), s("加入黄瓜片和少量盐，大火快速翻炒至断生后出锅。", 60)],
  },
  {
    slug: "vinegar-pepper-perch", title: "醋椒鲈鱼", emoji: "🐟", cookMinutes: 20, season: "秋季", dailyEnergy: 1400, meal: "中餐",
    ingredients: [g("鲈鱼", 50, "fish"), g("花椒", 2, "custom:%E8%8A%B1%E6%A4%92"), g("细粉丝", 15, "custom:%E7%BB%86%E7%B2%89%E4%B8%9D"), g("南豆腐", 40, "tofu"), g("葱姜", 5, "custom:%E8%91%B1%E5%A7%9C"), g("米醋", 5, "custom:%E7%B1%B3%E9%86%8B"), g("盐", 0.5, "salt")],
    steps: [s("粉丝用温水泡软；豆腐切小块，鲈鱼切片或请摊主处理成鱼片。", 600), s("锅中加清水和葱姜、花椒煮开，先放豆腐和粉丝煮 2 分钟。", 120), s("转小火下鱼片，轻推至鱼肉变白熟透。", 150), s("关火后调入米醋和少量盐，避免长时间沸煮使鱼片变老。")],
  },
  {
    slug: "shrimp-radish-corn-dumpling", title: "虾皮萝卜丝菜团子", emoji: "🌽", cookMinutes: 35, season: "秋季", dailyEnergy: 1400, meal: "早餐",
    ingredients: [g("粗玉米面粉", 50, "custom:%E7%B2%97%E7%8E%89%E7%B1%B3%E9%9D%A2%E7%B2%89"), g("虾皮", 5, "custom:%E8%99%BE%E7%9A%AE"), g("白萝卜", 40, "custom:%E7%99%BD%E8%90%9D%E5%8D%9C"), g("胡萝卜", 10, "carrot"), g("盐", 0.3, "salt")],
    steps: [s("白萝卜和胡萝卜擦丝，轻撒少量盐静置 5 分钟后挤去水分。", 300), s("萝卜丝和虾皮拌匀；玉米面用少量热水拌成能捏合的湿团。"), s("取玉米面团压成小碗状，包入萝卜虾皮馅，收口捏紧。"), s("水沸后上锅蒸至玉米面熟透、外皮定型。", 900)],
  },
  {
    slug: "tomato-egg-buckwheat-noodles", title: "西红柿鸡蛋面", emoji: "🍅", cookMinutes: 16, season: "冬季", dailyEnergy: 1200, meal: "晚餐",
    ingredients: [g("荞麦面粉", 50, "custom:%E8%8D%9E%E9%BA%A6%E9%9D%A2%E7%B2%89"), g("鸡蛋", 40, "egg"), g("西红柿", 50, "tomato"), g("香葱", 10, "custom:%E9%A6%99%E8%91%B1"), g("食用油", 3, "cooking-oil"), g("盐", 0.6, "salt")],
    steps: [s("荞麦面粉加适量水和成面团，醒 10 分钟后擀薄切面；也可用等重荞麦面条。", 600), s("西红柿切块，鸡蛋打散，香葱切末。"), s("锅中放油炒熟鸡蛋盛出，再炒软西红柿，加适量热水煮开。", 180), s("下入面条煮熟，放回鸡蛋，以少量盐调味，撒香葱出锅。", 300)],
  },
  {
    slug: "tofu-braised-grass-carp", title: "豆腐焖草鱼", emoji: "🍲", cookMinutes: 22, season: "冬季", dailyEnergy: 1400, meal: "中餐",
    ingredients: [g("草鱼", 50, "fish"), g("豆豉", 3, "custom:%E8%B1%86%E8%B1%89"), g("鲜辣椒", 3, "pepper"), g("北豆腐", 40, "tofu"), g("葱姜", 5, "custom:%E8%91%B1%E5%A7%9C"), g("食用油", 3, "cooking-oil"), g("盐", 0.3, "salt")],
    steps: [s("草鱼切块洗净沥干，豆腐切块，葱姜和鲜辣椒切好。"), s("锅中放少量油，鱼块两面略煎定型后盛出。", 120), s("锅中加葱姜、豆豉和辣椒炒香，加入豆腐、鱼块和少量热水。", 60), s("盖盖小火焖至鱼肉熟透、豆腐入味，豆豉有咸味，按需少量补盐。", 600)],
  },
  {
    slug: "radish-shrimp-soup", title: "萝卜丝汆海虾", emoji: "🦐", cookMinutes: 16, season: "冬季", dailyEnergy: 1600, meal: "晚餐",
    ingredients: [g("鲜海虾（带壳）", 137, "shrimp"), g("白萝卜", 100, "custom:%E7%99%BD%E8%90%9D%E5%8D%9C"), g("香菜", 5, "custom:%E9%A6%99%E8%8F%9C"), g("姜", 3, "custom:%E5%A7%9C"), g("盐", 0.5, "salt")],
    steps: [s("海虾剪去虾须洗净；白萝卜擦细丝，姜切丝。"), s("锅中加水和姜丝煮开，放入萝卜丝煮至半透明。", 360), s("加入海虾，煮至虾壳变红、虾肉卷曲熟透。", 180), s("调入少量盐，关火后撒香菜。带壳重量用于采购，食用时去壳。")],
  },
  {
    slug: "sour-broth-beef", title: "酸汤汆牛柳", emoji: "🥩", cookMinutes: 18, season: "冬季", dailyEnergy: 1600, meal: "中餐",
    ingredients: [g("牛肉", 40, "beef"), g("莴笋", 50, "custom:%E8%8E%B4%E7%AC%8B"), g("绿豆芽", 60, "custom:%E7%BB%BF%E8%B1%86%E8%8A%BD"), g("野山椒", 3, "custom:%E9%87%8E%E5%B1%B1%E6%A4%92"), g("木耳（水发）", 20, "mushroom"), g("盐", 0.5, "salt")],
    steps: [s("牛肉逆纹切薄片；莴笋切片，木耳洗净，绿豆芽去根。"), s("锅中加清水，放野山椒煮出酸辣味；不额外加油。", 180), s("放入莴笋、木耳和绿豆芽煮至断生。", 180), s("转小火，下牛柳快速汆至变色熟透，调入少量盐后立即出锅，避免久煮。", 90)],
  },
];

export function northChinaGuideDescription(recipe: NorthChinaGuideRecipe) {
  return `来源于华北地区${recipe.season}${recipe.dailyEnergy} kcal 全天食谱示例中的${recipe.meal}菜，食材量按指南所列单人份整理。操作步骤为家庭烹调整理；油、盐请计入当日总量，不能替代个体化营养或医疗建议。`;
}
