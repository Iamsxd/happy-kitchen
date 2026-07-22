import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const source = process.argv[2];
const revision = process.argv[3] || "master";
if (!source) throw new Error("Usage: node scripts/generate-howtocook-catalog.mjs HOWTOCOOK_DIR [REVISION]");

const categoryNames = {
  aquatic: "水产", breakfast: "早餐", condiment: "调味料", dessert: "甜品",
  drink: "饮品", meat_dish: "荤菜", soup: "汤羹", staple: "主食",
  vegetable_dish: "素菜",
};
const emojiByCategory = { 水产: "🐟", 早餐: "🍳", 调味料: "🧂", 甜品: "🍰", 饮品: "🥤", 荤菜: "🍖", 汤羹: "🥣", 主食: "🍚", 素菜: "🥬" };

async function markdownFiles(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) rows.push(absolute);
  }
  return rows;
}

function relative(file) { return path.relative(source, file).replaceAll("\\", "/"); }
function sourceUrl(filePath) { return `https://github.com/Anduin2017/HowToCook/blob/${revision}/${filePath.split("/").map(encodeURIComponent).join("/")}`; }
function titleOf(markdown, fallback) { return (markdown.match(/^#\s+(.+)$/m)?.[1] || fallback).replace(/的做法\s*$/, "").trim(); }
function plain(value) {
  return value.replace(/!\[[^\]]*]\([^)]*\)/g, "").replace(/\[([^\]]+)]\([^)]*\)/g, "$1").replace(/[`*_>#-]/g, "").replace(/\s+/g, " ").trim();
}
function summaryOf(markdown, fallback) {
  const body = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("[") && !line.startsWith("!"));
  return plain(body.find((line) => plain(line).length > 12) || fallback).slice(0, 150);
}

const recipes = [];
for (const file of await markdownFiles(path.join(source, "dishes"))) {
  const filePath = relative(file);
  if (filePath.includes("/template/")) continue;
  const markdown = await readFile(file, "utf8");
  const folder = filePath.split("/")[1];
  const category = categoryNames[folder] || "其他";
  const fallback = path.basename(file, ".md");
  recipes.push({
    id: `howtocook:${filePath}`,
    title: titleOf(markdown, fallback),
    category,
    emoji: emojiByCategory[category] || "🍽️",
    path: filePath,
    summary: summaryOf(markdown, `${fallback}的详细做法`),
    sourceUrl: sourceUrl(filePath),
    markdown,
  });
}

const learning = [];
for (const file of await markdownFiles(path.join(source, "tips"))) {
  const filePath = relative(file);
  const markdown = await readFile(file, "utf8");
  const parts = filePath.split("/");
  const category = parts[1] === "advanced" ? "进阶技巧" : parts[1] === "learn" ? "基础技法" : "厨房基础";
  const fallback = path.basename(file, ".md");
  learning.push({
    id: `howtocook:${filePath}`,
    title: titleOf(markdown, fallback),
    category,
    path: filePath,
    summary: summaryOf(markdown, `${fallback}的实用知识`),
    sourceUrl: sourceUrl(filePath),
    markdown,
  });
}

recipes.sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.title.localeCompare(b.title, "zh-CN"));
learning.sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.title.localeCompare(b.title, "zh-CN"));
await mkdir(path.join(process.cwd(), "data"), { recursive: true });
await writeFile(path.join(process.cwd(), "data", "howtocook-catalog.json"), `${JSON.stringify({ source: "Anduin2017/HowToCook", revision, license: "Unlicense", generatedAt: new Date().toISOString(), recipes, learning })}\n`, "utf8");
console.log(JSON.stringify({ recipes: recipes.length, learning: learning.length, revision }));
