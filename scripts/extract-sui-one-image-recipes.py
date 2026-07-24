#!/usr/bin/env python3
"""Extract image-card recipes into private Markdown and Happy Kitchen import JSON.

The input is intentionally outside the repository. Generated recipe text belongs
to the source owner and must not be committed to this public repository.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError as error:  # pragma: no cover - operational guidance only
    raise SystemExit("缺少 rapidocr_onnxruntime。请使用 python -m pip install rapidocr_onnxruntime") from error


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
SECTION_HEADINGS = {
    "食材": "ingredients", "配料": "ingredients", "调料": "ingredients",
    "备菜": "prep", "制作": "cook", "做法": "cook", "步骤": "cook", "制作步骤": "cook", "烹饪": "cook",
}
TIMESTAMP = re.compile(r"[（(]?\s*(\d{1,2})\s*[:：]\s*(\d{2})\s*[)）]?")
GRAMS = re.compile(r"(?:约|共|净)?\s*(\d+(?:\.\d+)?)\s*(?:g|克)\b", re.IGNORECASE)


def natural_key(path: Path) -> list[Any]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)]


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def source_title(folder: Path) -> str:
    title = re.sub(r"^\d{4}-\d{2}-\d{2}(?:~\d{1,2})?[-_ ]*", "", folder.name).strip()
    title = re.sub(r"(?<=-)\d{4}-\d{2}-\d{2}-", "", title)
    return title or folder.name


def detect_section(text: str) -> str | None:
    normalized = re.sub(r"[：:（）()\s]", "", text)
    return SECTION_HEADINGS.get(normalized)


def ocr_image(engine: RapidOCR, path: Path, max_width: int) -> dict[str, Any]:
    with Image.open(path) as image:
        image = image.convert("RGB")
        if max_width > 0 and image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)
        result, _ = engine(np.asarray(image))
    rows: list[dict[str, Any]] = []
    for row in result or []:
        text = clean_text(str(row[1]))
        confidence = float(row[2])
        if text:
            rows.append({"text": text, "confidence": round(confidence, 4)})
    return {"file": path.name, "text": "\n".join(item["text"] for item in rows), "lines": rows}


def split_ingredient_candidates(raw: str) -> list[str]:
    text = raw.replace("\r\n", "，").replace("\n", "，").replace("\r", "，")
    text = text.replace("；", "，").replace("、", "，").replace("。", "，")
    text = re.sub(r"\s+", "", text)
    return [item.strip(" ，,。") for item in text.split("，") if item.strip(" ，,。")]


def normalize_name(value: str) -> str:
    name = value
    name = re.sub(r"（.*?）|\(.*?\)", "", name)
    name = re.sub(r"^(?:约|共|净|适量|少许|一共)", "", name)
    name = re.sub(r"\d+(?:\.\d+)?\s*(?:g|克|毫升|ml|个|只|根|瓣|块|片|把|颗|勺|小勺|大勺)", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[一二三四五六七八九十两半]+\s*(?:个|只|根|瓣|块|片|把|颗|勺)", "", name)
    name = name.replace("的", "").strip("：:、，,。；; ")
    return name[:40]


def parse_ingredients(raw: str) -> tuple[list[dict[str, Any]], list[str]]:
    raw = re.sub(r"[（(][^（）()]{0,60}(?:单人份|多人|举例|类推)[^（）()]{0,60}[）)]", "", raw)
    raw = raw.replace("耗油", "蚝油")
    ingredients: list[dict[str, Any]] = []
    unresolved: list[str] = []
    seen: set[tuple[str, float]] = set()
    for candidate in split_ingredient_candidates(raw):
        matches = list(GRAMS.finditer(candidate))
        if len(matches) != 1 or any(marker in candidate for marker in ("微辣", "中辣", "特辣", "任选", "适量", "非必须", "可选")):
            unresolved.append(candidate)
            continue
        grams = float(matches[0].group(1))
        name = normalize_name(candidate[:matches[0].start()])
        if not name or len(name) > 24:
            unresolved.append(candidate)
            continue
        key = (name, grams)
        if key in seen:
            continue
        seen.add(key)
        ingredients.append({
            "name": name,
            "quantity": grams,
            "unit": "g",
            "grams": grams,
            "optional": "可选" in candidate or "非必须" in candidate,
            "rawText": candidate,
        })
    return ingredients, unresolved


def timed_steps(parts: list[str]) -> list[dict[str, Any]]:
    joined = "\n".join(parts)
    matches = list(TIMESTAMP.finditer(joined))
    steps: list[dict[str, Any]] = []
    if matches:
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(joined)
            instruction = clean_text(joined[match.end():end].replace("\n", " "))
            instruction = re.sub(r"^(?:录|。|，)\s*", "", instruction)
            if len(instruction) < 3:
                continue
            steps.append({"instruction": instruction, "timerSeconds": None})
    else:
        for part in parts:
            instruction = clean_text(part.replace("\n", " "))
            if len(instruction) >= 3:
                steps.append({"instruction": instruction, "timerSeconds": None})
    return steps


def cook_minutes(pages: list[dict[str, Any]], steps: list[dict[str, Any]]) -> int:
    seconds = [int(match.group(1)) * 60 + int(match.group(2)) for page in pages for match in TIMESTAMP.finditer(page["text"])]
    minute_mentions = [int(value) for step in steps for value in re.findall(r"(\d+)\s*分钟", step["instruction"])]
    return max(12, min(180, max(seconds, default=0) // 60 + sum(minute_mentions) + 5))


def emoji_for(title: str) -> str:
    lookup = [("鸡", "🍗"), ("鱼", "🐟"), ("虾", "🦐"), ("牛", "🥩"), ("猪", "🥘"), ("肉", "🥩"), ("面", "🍜"), ("豆腐", "🥢"), ("蛋", "🍳"), ("菜", "🥬")]
    return next((emoji for keyword, emoji in lookup if keyword in title), "🍲")


def markdown(recipe: dict[str, Any]) -> str:
    lines = [
        "---",
        f"title: {recipe['title']}",
        "source: 隋卞一做教做菜（图片 OCR）",
        f"source_folder: {recipe['sourceFolder']}",
        f"ocr_confidence: {recipe['ocrConfidence']}",
        f"needs_review: {'true' if recipe['needsReview'] else 'false'}",
        "---",
        "",
        f"# {recipe['title']}",
        "",
        "## 识别说明",
        "",
        "本文件由图片 OCR 自动生成。食材和步骤需要在烹饪前复核，特别是单位、油盐、火候与食品安全信息。",
        "",
        "## 结构化食材",
        "",
    ]
    if recipe["ingredients"]:
        lines.extend(f"- {item['name']}：{item['quantity']:g}{item['unit']}" + ("（可选）" if item.get("optional") else "") for item in recipe["ingredients"])
    else:
        lines.append("- 未成功结构化，请查看 OCR 原文。")
    if recipe["unresolvedIngredients"]:
        lines.extend(["", "## 待核对食材文字", ""])
        lines.extend(f"- {item}" for item in recipe["unresolvedIngredients"])
    lines.extend(["", "## 操作步骤", ""])
    if recipe["steps"]:
        lines.extend(f"{index}. {step['instruction']}" for index, step in enumerate(recipe["steps"], 1))
    else:
        lines.append("1. 未成功结构化，请查看 OCR 原文。")
    lines.extend(["", "## 原始图片", ""])
    lines.extend(f"- `{image}`" for image in recipe["images"])
    lines.extend(["", "## OCR 原文", ""])
    for page in recipe["ocrPages"]:
        lines.extend([f"### {page['file']}", "", page["text"] or "（未识别到文字）", ""])
    return "\n".join(lines)


def extract_recipe(engine: RapidOCR, root: Path, tail_folder: Path, max_width: int) -> dict[str, Any]:
    image_paths = sorted((path for path in tail_folder.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS), key=natural_key)
    pages = [ocr_image(engine, path, max_width) for path in image_paths]
    sections: dict[str, list[str]] = {"ingredients": [], "prep": [], "cook": []}
    current = "cook"
    confidences: list[float] = []
    for page in pages:
        for line in page["lines"]:
            confidences.append(line["confidence"])
            heading = detect_section(line["text"])
            if heading:
                current = heading
                continue
            sections[current].append(line["text"])
    ingredients, unresolved = parse_ingredients("\n".join(sections["ingredients"]))
    steps = timed_steps(sections["prep"] + sections["cook"])
    confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.0
    title = source_title(tail_folder.parent)
    relative_folder = tail_folder.parent.relative_to(root).as_posix()
    return {
        "sourceId": relative_folder,
        "title": title,
        "description": "从“隋卞一做教做菜”片尾图片识别导入；请在烹饪前复核食材单位、油盐和火候。",
        "emoji": emoji_for(title),
        "cookMinutes": cook_minutes(pages, steps),
        "servings": "1",
        "ingredients": ingredients,
        "steps": steps,
        "unresolvedIngredients": unresolved,
        "images": [path.relative_to(root).as_posix() for path in image_paths],
        "sourceFolder": relative_folder,
        "ocrConfidence": confidence,
        "needsReview": confidence < 0.95 or not ingredients or not steps or bool(unresolved),
        "ocrPages": pages,
    }


def refresh_recipe_from_pages(recipe: dict[str, Any]) -> None:
    pages = [page for page in recipe.get("ocrPages", []) if isinstance(page, dict)]
    sections: dict[str, list[str]] = {"ingredients": [], "prep": [], "cook": []}
    current = "cook"
    confidences: list[float] = []
    for page in pages:
        for line in page.get("lines", []):
            if not isinstance(line, dict):
                continue
            text = clean_text(str(line.get("text", "")))
            if not text:
                continue
            try:
                confidences.append(float(line.get("confidence", 0)))
            except (TypeError, ValueError):
                pass
            heading = detect_section(text)
            if heading:
                current = heading
                continue
            sections[current].append(text)
    ingredients, unresolved = parse_ingredients("\n".join(sections["ingredients"]))
    steps = timed_steps(sections["prep"] + sections["cook"])
    confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.0
    recipe["ingredients"] = ingredients
    recipe["unresolvedIngredients"] = unresolved
    recipe["steps"] = steps
    recipe["cookMinutes"] = cook_minutes(pages, steps)
    recipe["ocrConfidence"] = confidence
    recipe["needsReview"] = confidence < 0.95 or not ingredients or not steps or bool(unresolved)


def main() -> None:
    parser = argparse.ArgumentParser(description="将隋卞一做教做菜的片尾图片导出为 Markdown 和私有导入 JSON")
    parser.add_argument("--input", type=Path, required=True, help="包含菜谱子文件夹的根目录")
    parser.add_argument("--output", type=Path, required=True, help="私有导出目录，不应提交至 Git")
    parser.add_argument("--limit", type=int, default=0, help="仅处理前 N 道菜谱，用于试跑")
    parser.add_argument("--offset", type=int, default=0, help="跳过前 N 道菜谱，与 --limit 配合用于断点分批处理")
    parser.add_argument("--max-width", type=int, default=960, help="OCR 前的最大图片宽度；0 表示保持原图")
    parser.add_argument("--fragment", action="store_true", help="写入 fragments 片段，不生成最终汇总文件")
    parser.add_argument("--merge-fragments", action="store_true", help="合并 fragments 目录中的片段为最终 JSON 和报告")
    args = parser.parse_args()
    root = args.input.resolve()
    output = args.output.resolve()
    tail_folders = sorted((path for path in root.rglob("片尾") if path.is_dir()), key=lambda path: natural_key(path.parent))
    if not tail_folders:
        raise SystemExit(f"未在 {root} 找到名为“片尾”的目录")
    output.mkdir(parents=True, exist_ok=True)
    if args.merge_fragments:
        fragments = sorted((output / "fragments").glob("*.json"))
        merged: dict[str, dict[str, Any]] = {}
        for fragment in fragments:
            for recipe in json.loads(fragment.read_text(encoding="utf-8")).get("recipes", []):
                if isinstance(recipe, dict) and recipe.get("sourceId"):
                    merged[str(recipe["sourceId"])] = recipe
        recipes = [merged[key] for key in sorted(merged)]
        markdown_dir = output / "markdown"
        markdown_dir.mkdir(parents=True, exist_ok=True)
        for recipe in recipes:
            refresh_recipe_from_pages(recipe)
            recipe["title"] = source_title(Path(str(recipe.get("sourceFolder") or recipe["sourceId"])))
            safe_name = re.sub(r'[<>:"/\\\\|?*]', "_", str(recipe["sourceId"]).replace("/", "-"))
            (markdown_dir / f"{safe_name}.md").write_text(markdown(recipe), encoding="utf-8")
        payload = {"format": "happy-kitchen-local-ocr-recipe-import/v1", "source": "隋卞一做教做菜（本地图片 OCR）", "generatedAt": datetime.now(timezone.utc).isoformat(), "recipeCount": len(recipes), "recipes": recipes}
        (output / "sui-one-recipes.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        report = {"recipeCount": len(recipes), "readyForCompleteImport": sum(not recipe["needsReview"] for recipe in recipes), "needsReview": sum(recipe["needsReview"] for recipe in recipes), "averageConfidence": round(sum(recipe["ocrConfidence"] for recipe in recipes) / len(recipes), 4) if recipes else 0, "lowConfidence": [recipe["title"] for recipe in recipes if recipe["ocrConfidence"] < 0.95], "unresolvedIngredientCount": sum(len(recipe["unresolvedIngredients"]) for recipe in recipes)}
        (output / "import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return
    tail_folders = tail_folders[max(0, args.offset):]
    if args.limit > 0:
        tail_folders = tail_folders[:args.limit]
    markdown_dir = output / "markdown"
    # Preserve prior exports: each current recipe document is overwritten in place,
    # while unrelated files and older documents remain recoverable for comparison.
    markdown_dir.mkdir(parents=True, exist_ok=True)

    engine = RapidOCR()
    recipes = []
    for index, folder in enumerate(tail_folders, 1):
        recipe = extract_recipe(engine, root, folder, max(0, args.max_width))
        recipes.append(recipe)
        safe_name = re.sub(r'[<>:"/\\\\|?*]', "_", recipe["sourceId"].replace("/", "-"))
        (markdown_dir / f"{safe_name}.md").write_text(markdown(recipe), encoding="utf-8")
        print(f"[{index}/{len(tail_folders)}] {recipe['title']} · 食材 {len(recipe['ingredients'])} · 步骤 {len(recipe['steps'])} · 置信度 {recipe['ocrConfidence']}")

    payload = {
        "format": "happy-kitchen-local-ocr-recipe-import/v1",
        "source": "隋卞一做教做菜（本地图片 OCR）",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "recipeCount": len(recipes),
        "recipes": recipes,
    }
    if args.fragment:
        fragment_dir = output / "fragments"
        fragment_dir.mkdir(exist_ok=True)
        fragment_name = f"recipes-{args.offset:03d}-{args.offset + len(recipes) - 1:03d}.json"
        (fragment_dir / fragment_name).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"fragment: {fragment_dir / fragment_name}")
        return
    (output / "sui-one-recipes.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "recipeCount": len(recipes),
        "readyForCompleteImport": sum(not recipe["needsReview"] for recipe in recipes),
        "needsReview": sum(recipe["needsReview"] for recipe in recipes),
        "averageConfidence": round(sum(recipe["ocrConfidence"] for recipe in recipes) / len(recipes), 4),
        "lowConfidence": [recipe["title"] for recipe in recipes if recipe["ocrConfidence"] < 0.95],
        "unresolvedIngredientCount": sum(len(recipe["unresolvedIngredients"]) for recipe in recipes),
    }
    (output / "import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
