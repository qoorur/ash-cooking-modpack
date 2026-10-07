# -*- coding: utf-8 -*-
"""
最终版 v5：找出"食材" + 分类输出 + 生成 Markdown

改动：忽略 farmersdelight:cutting 类型配方（既不作为成品来源，也不作为有效用途）

规则：
  食物 = 有营养值 且 当前版本存在的物品
  成品 = 有效配方产出，条件：
          类型 ∉ {spoiled:spoil_recipe, farmersdelight:cutting, create:emptying}
          且 原料总数量 >= 成品总数量
  食材 = 食物 - 成品（有营养值 + 非成品 + 有被当原料/有效用途）
  剔除(失效) = 食物 - 成品 - 食材
        A 真正失效：没有任何产出配方，且不作任何有效配方原料
        B 一对多产出：有产出配方(原料<成品)，但不计为成品
"""
import json
import os
import collections

EXPORT = r"D:\Ash Cooking\.minecraft\versions\1.21.1-NeoForge_21.1.253\local\kubejs\export"
RECIPES = os.path.join(EXPORT, "recipes")
ITEM_REG = os.path.join(EXPORT, "registries", "item.json")
FS_LIB = r"D:\Ash Cooking\.minecraft\versions\1.21.1-NeoForge_21.1.248\kubejs\foods.json"
OUT_JSON = r"D:\Ash Cooking\food_ingredients.json"
OUT_MD = r"D:\Ash Cooking\food_ingredients.md"

# 完全忽略的配方类型（不产出成品、也不构成有效"原料用途"）
IGNORED_RECIPE_TYPES = {
    "spoiled:spoil_recipe",
    "farmersdelight:cutting",
}
# 产出不算成品（但仍可视为有效原料用途）
EMPTY_OUTPUT_TYPES = {"create:emptying"}
INGREDIENT_FIELDS = ("ingredient", "ingredients", "key",
                     "crafting_ingredients", "stage_ingredients", "input")
RESULT_FIELDS = ("result", "results", "output", "result_item")


def _to_int(v, default=1):
    try:
        return int(v)
    except Exception:
        return default


def item_id_of(node):
    if isinstance(node, str):
        return node if ":" in node and " " not in node else None
    if isinstance(node, dict):
        if isinstance(node.get("id"), str):
            return node["id"]
        if isinstance(node.get("item"), str) and ":" in node["item"]:
            return node["item"]
    return None


def count_of(node):
    if isinstance(node, dict):
        if "count" in node:
            return _to_int(node["count"])
        inner = node.get("item")
        if isinstance(inner, dict) and "count" in inner:
            return _to_int(inner["count"])
    return 1


def extract_result_items(node, out):
    if node is None:
        return
    if isinstance(node, str):
        if ":" in node and " " not in node:
            out.append((node, 1))
        return
    if isinstance(node, list):
        for e in node:
            extract_result_items(e, out)
        return
    if isinstance(node, dict):
        iid = item_id_of(node)
        if iid is not None:
            out.append((iid, count_of(node)))
            return
        for v in node.values():
            extract_result_items(v, out)


def get_results(recipe):
    out = []
    for f in RESULT_FIELDS:
        if f in recipe:
            extract_result_items(recipe[f], out)
    return out


def count_ingredient_field(node):
    if node is None:
        return 0
    if isinstance(node, list):
        return sum(count_ingredient_field(e) for e in node)
    if isinstance(node, str):
        return 1
    if isinstance(node, dict):
        if "item" in node or "tag" in node or "id" in node:
            return _to_int(node.get("count", 1))
        return sum(count_ingredient_field(v) for v in node.values())
    return 0


def shaped_ingredient_count(recipe):
    pattern = recipe.get("pattern")
    key = recipe.get("key")
    if not isinstance(pattern, list) or not isinstance(key, dict):
        return 0
    sym = collections.Counter()
    for row in pattern:
        if isinstance(row, str):
            for ch in row:
                if ch != " ":
                    sym[ch] += 1
    total = 0
    for s, mult in sym.items():
        if s in key:
            total += mult * count_ingredient_field(key[s])
    return total


def recipe_ingredient_count(recipe):
    total = 0
    if "pattern" in recipe and "key" in recipe:
        total += shaped_ingredient_count(recipe)
    for field in INGREDIENT_FIELDS:
        if field in recipe:
            if field == "key" and "pattern" in recipe:
                continue
            total += count_ingredient_field(recipe[field])
    return total


def extract_ingredient_ids(recipe):
    ids = set()

    def walk(node):
        if node is None:
            return
        if isinstance(node, str):
            if ":" in node and " " not in node:
                ids.add(node)
            return
        if isinstance(node, list):
            for e in node:
                walk(e)
            return
        if isinstance(node, dict):
            iid = item_id_of(node)
            if iid:
                ids.add(iid)
                return
            for v in node.values():
                walk(v)

    for field in INGREDIENT_FIELDS:
        if field in recipe:
            walk(recipe[field])
    return ids


def collect(root):
    result = []
    for dirpath, _, files in os.walk(root):
        for fn in files:
            if not fn.endswith(".json"):
                continue
            try:
                with open(os.path.join(dirpath, fn), encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            if isinstance(data, list):
                for r in data:
                    if isinstance(r, dict):
                        result.append(r)
            elif isinstance(data, dict):
                result.append(data)
    return result


def brief(x):
    return {"id": x["id"], "name": x.get("name", ""),
            "nutrition": x.get("nutrition", 0), "saturation": x.get("saturation", 0)}


def main():
    valid = set(json.load(open(ITEM_REG, encoding="utf-8")).keys())
    foods_all = json.load(open(FS_LIB, encoding="utf-8"))["items"]
    foods = [x for x in foods_all if x["id"] in valid]
    food_ids = set(x["id"] for x in foods)

    recipes = collect(RECIPES)

    produced = set()
    has_any_recipe = set()
    for r in recipes:
        rtype = r.get("type")
        if rtype in IGNORED_RECIPE_TYPES:
            continue
        results = get_results(r)
        if not results:
            continue
        for iid, _ in results:
            has_any_recipe.add(iid)
        if rtype in EMPTY_OUTPUT_TYPES:
            continue
        ing = recipe_ingredient_count(r)
        out = sum(c for _, c in results)
        if ing < out:
            continue
        for iid, _ in results:
            produced.add(iid)

    used_as_ingredient = set()
    for r in recipes:
        if r.get("type") in IGNORED_RECIPE_TYPES:
            continue
        used_as_ingredient |= extract_ingredient_ids(r)

    ingredients = []
    drop_a = []   # 真正失效
    drop_b = []   # 一对多产出
    for x in foods:
        iid = x["id"]
        if iid in produced:
            continue
        if iid in used_as_ingredient:
            ingredients.append(x)
        elif iid in has_any_recipe:
            drop_b.append(x)
        else:
            drop_a.append(x)

    out = {
        "total_foods": len(food_ids),
        "total_results": len(food_ids & produced),
        "total_ingredients": len(ingredients),
        "total_dropped_invalid": len(drop_a) + len(drop_b),
        "total_drop_a_truly_dead": len(drop_a),
        "total_drop_b_one_to_many": len(drop_b),
        "ingredients": [brief(x) for x in ingredients],
        "drop_a_truly_dead": [brief(x) for x in drop_a],
        "drop_b_one_to_many": [brief(x) for x in drop_b],
    }
    json.dump(out, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    def group_by_ns(arr):
        g = collections.OrderedDict()
        for x in sorted(arr, key=lambda a: a["id"]):
            g.setdefault(x["id"].split(":")[0], []).append(x)
        return g

    md = []
    md.append("# 食物 / 食材 分类清单\n")
    md.append("## 总览\n")
    md.append("| 项目 | 数量 |")
    md.append("|---|---|")
    md.append("| foods.json 食物总数 | %d |" % len(foods_all))
    md.append("| 已移除mod(当前版本不存在) | %d |" % (len(foods_all) - len(food_ids)))
    md.append("| 有效食物 | %d |" % len(food_ids))
    md.append("| 作为成品 | %d |" % len(food_ids & produced))
    md.append("| **食材** | **%d** |" % len(ingredients))
    md.append("| 剔除-A真正失效 | %d |" % len(drop_a))
    md.append("| 剔除-B一对多产出 | %d |" % len(drop_b))
    md.append("")

    for title, arr in (("食材（%d）" % len(ingredients), ingredients),
                       ("B. 一对多产出（有配方但原料<成品，不计为成品）（%d）" % len(drop_b), drop_b),
                       ("A. 真正失效（无产出配方也无用途）（%d）" % len(drop_a), drop_a)):
        md.append("---\n")
        md.append("## %s\n" % title)
        for ns, items in group_by_ns(arr).items():
            md.append("### %s (%d)\n" % (ns, len(items)))
            md.append("| 物品ID | 名称 | 饥饿值 | 饱和度 |")
            md.append("|---|---|---|---|")
            for x in items:
                md.append("| %s | %s | %s | %s |" % (x["id"], x["name"], x["nutrition"], x["saturation"]))
            md.append("")

    open(OUT_MD, "w", encoding="utf-8").write("\n".join(md))

    print("有效食物:", len(food_ids))
    print("成品:", len(food_ids & produced))
    print("食材:", len(ingredients))
    print("A 真正失效:", len(drop_a))
    print("B 一对多产出:", len(drop_b))
    print("JSON:", OUT_JSON)
    print("MD  :", OUT_MD)
    # 校验马铃薯
    print("minecraft:potato 在食材中:", "minecraft:potato" in set(x["id"] for x in ingredients))


if __name__ == "__main__":
    main()
