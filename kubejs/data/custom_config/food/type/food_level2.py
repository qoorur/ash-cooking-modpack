# -*- coding: utf-8 -*-
"""
food_level: compute food levels based on level1 ingredients (recursive).

Recipe types considered:
  kaleidoscope_cookery:flex_stockpot / flex_pot
  minecraft:crafting_shaped / crafting_shapeless
  farmersdelight:cutting

level = sum(food ingredient levels) / result count   (2 decimals)
nutrition = 2*level ; saturation = 4*level

Tag handling (method 1):
  A tag ingredient contributes the MIN level among known foods it contains.
  If tag contains no known food -> recipe skipped.
  If a tag contains foods of multiple different levels -> logged to a MD.

Skipped & logged separately:
  - items with multiple recipes
  - recipes containing unknown food ingredient (food but no level yet)
  - recipes whose tag ingredient has no resolvable food
Non-food ingredients -> ignored (0 contribution).
Output item must be a food (has nutrition).
"""
import json
import os
import csv
import collections

EXPORT = r"D:\Ash Cooking\.minecraft\versions\1.21.1-NeoForge_21.1.253\local\kubejs\export"
RECIPES = os.path.join(EXPORT, "recipes")
TAGS_DIR = os.path.join(EXPORT, "tags", "minecraft", "item")
TYPE_DIR = r"D:\Ash Cooking\.minecraft\versions\1.21.1-NeoForge_21.1.253\kubejs\data\custom_config\food\type"
LEVEL1_CSV = os.path.join(TYPE_DIR, "food_level_1.csv")
OUT_CSV = os.path.join(TYPE_DIR, "food_level.csv")
OUT_JSON = os.path.join(TYPE_DIR, "food_level_data.json")   # 供 KubeJS startup(JsonIO) 读取: item_id -> level
OUT_MULTI_MD = os.path.join(TYPE_DIR, "food_level_multi_recipes.md")
OUT_TAGMD = os.path.join(TYPE_DIR, "food_level_tag_multi_level.md")
FS_LIB = r"D:\Ash Cooking\.minecraft\versions\1.21.1-NeoForge_21.1.248\kubejs\foods.json"
OEI_DIR = r"D:\Ash Cooking\.minecraft\versions\1.21.1-NeoForge_21.1.253\kubejs\data\oei\replacements"

COOK_TYPES = {
    "kaleidoscope_cookery:flex_stockpot",
    "kaleidoscope_cookery:flex_pot",
    "minecraft:crafting_shaped",
    "minecraft:crafting_shapeless",
    "farmersdelight:cutting",
    "minecraft:smelting",
    "minecraft:smoking",
    "minecraft:campfire_cooking",
    "kaleidoscope_cookery:rice_bowl",
}
RESULT_FIELDS = ("result", "results", "output", "result_item")
INGREDIENT_FIELDS = ("ingredient", "ingredients", "key",
                     "crafting_ingredients", "stage_ingredients", "input")

# 容器 / 载体 字段：通常不算原料(用于"成品/食材"判定时被排除)，
# 但若其内容是"食物且已有 level"，则参与 level 累加（例: flex_pot 的 carrier=米饭）。
CONTAINER_FIELDS = ("carrier", "container", "bowl_ingredient", "bottle_ingredient")


def to_int(v, d=1):
    try:
        return int(v)
    except Exception:
        return d


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
            return to_int(node["count"])
        inner = node.get("item")
        if isinstance(inner, dict) and "count" in inner:
            return to_int(inner["count"])
    return 1


def extract_results(node, out):
    if node is None:
        return
    if isinstance(node, str):
        if ":" in node and " " not in node:
            out.append((node, 1))
        return
    if isinstance(node, list):
        for e in node:
            extract_results(e, out)
        return
    if isinstance(node, dict):
        iid = item_id_of(node)
        if iid is not None:
            out.append((iid, count_of(node)))
            return
        for v in node.values():
            extract_results(v, out)


def get_results(recipe):
    out = []
    for f in RESULT_FIELDS:
        if f in recipe:
            extract_results(recipe[f], out)
    return out


def collect_ingredients(recipe):
    """Return (item_counts:Counter, tag_counts:Counter)。

    计数规则（按"实际使用个数"累加，同种原料出现 N 次即 N 个）：
      - shaped : 以 pattern 中每个字符出现的次数为准；key 仅提供字符->原料映射。
                 没有 pattern 的退化为对 key 值各计 1 次。
      - shapeless / 其它 : 直接把 ingredients/ingredient 等字段里的每个元素计 1 次。
    """
    counts = collections.Counter()   # item_id -> count
    tcounts = collections.Counter()  # tag_id  -> count

    def walk(node):
        """递归遍历，遇到"一个原料"计 1 次。"""
        if node is None:
            return
        if isinstance(node, str):
            if node.startswith("#"):
                tcounts[node[1:]] += 1
            elif ":" in node and " " not in node:
                counts[node] += 1
            return
        if isinstance(node, list):
            # 列表 = 多个并列原料（每个元素一个）
            for e in node:
                walk(e)
            return
        if isinstance(node, dict):
            if "tag" in node and isinstance(node["tag"], str):
                tcounts[node["tag"]] += 1
                return
            if "item" in node and isinstance(node["item"], (str, dict)):
                iid = item_id_of(node)
                if iid:
                    counts[iid] += 1
                    return
            if isinstance(node.get("id"), str):
                counts[node["id"]] += 1
                return
            # 其它嵌套：继续向下（避免把 key/pattern 容器的字典整体当原料）
            for v in node.values():
                walk(v)

    rtype = recipe.get("type")
    if rtype == "minecraft:crafting_shaped" and "pattern" in recipe and "key" in recipe:
        # 统计 pattern 中每个字符出现次数
        char_count = collections.Counter()
        pattern = recipe.get("pattern")
        if isinstance(pattern, list):
            for row in pattern:
                if isinstance(row, str):
                    for ch in row:
                        if ch != " ":
                            char_count[ch] += 1
        key = recipe.get("key")
        if isinstance(key, dict):
            for ch, node in key.items():
                n = char_count.get(ch, 0)
                for _ in range(n):
                    walk(node)
        return counts, tcounts

    # 其余类型：遍历指定原料字段（每个元素计 1 次）
    for field in INGREDIENT_FIELDS:
        if field in recipe:
            walk(recipe[field])
    return counts, tcounts


def collect_containers(recipe):
    """Return (item_counts:Counter, tag_counts:Counter) for container/carrier fields only."""
    counts = collections.Counter()
    tcounts = collections.Counter()

    def walk(node):
        if node is None:
            return
        if isinstance(node, str):
            if node.startswith("#"):
                tcounts[node[1:]] += 1
            elif ":" in node and " " not in node:
                counts[node] += 1
            return
        if isinstance(node, list):
            for e in node:
                walk(e)
            return
        if isinstance(node, dict):
            if "tag" in node and isinstance(node["tag"], str):
                tcounts[node["tag"]] += 1
                return
            iid = item_id_of(node)
            if iid:
                counts[iid] += 1
                return
            for v in node.values():
                walk(v)

    for field in CONTAINER_FIELDS:
        if field in recipe:
            walk(recipe[field])
    return counts, tcounts


def load_oei():
    """Build item_id -> canonical item_id mapping from OEI replacement rules.
    matchItems entries are all treated as resultItems."""
    mapping = {}
    if not os.path.isdir(OEI_DIR):
        return mapping
    for fn in os.listdir(OEI_DIR):
        if not fn.endswith(".json"):
            continue
        try:
            data = json.load(open(os.path.join(OEI_DIR, fn), encoding="utf-8"))
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for rule in items:
            if not isinstance(rule, dict):
                continue
            result = rule.get("resultItems")
            match = rule.get("matchItems") or []
            if isinstance(result, list):
                result = result[0] if result else None
            if not result:
                continue
            for m in match:
                if isinstance(m, str):
                    mapping[m] = result
    return mapping


def load_tags():
    """Build tag_id -> set(item_ids) mapping, resolving nested #tags."""
    raw = {}   # tag_id -> list of entries (str, may start with #)
    for dirpath, _, files in os.walk(TAGS_DIR):
        for fn in files:
            if not fn.endswith(".json"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, TAGS_DIR).replace("\\", "/")
            stem = rel[:-5]  # remove .json  -> e.g. c/crops/potato
            tag_id = stem.replace("/", ":", 1)  # -> c:crops/potato
            try:
                data = json.load(open(full, encoding="utf-8"))
            except Exception:
                continue
            if isinstance(data, list):
                raw[tag_id] = [x for x in data if isinstance(x, str)]

    # recursive resolve with cache & cycle guard
    resolved = {}

    def resolve(tag_id, stack):
        if tag_id in resolved:
            return resolved[tag_id]
        if tag_id in stack:
            return set()
        stack.add(tag_id)
        out = set()
        for e in raw.get(tag_id, []):
            if e.startswith("#"):
                sub = e[1:].rstrip("?")
                out |= resolve(sub, stack)
            else:
                out.add(e.rstrip("?"))
        stack.discard(tag_id)
        resolved[tag_id] = out
        return out

    for t in list(raw.keys()):
        resolve(t, set())
    return resolved


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


def main():
    level1 = {}
    with open(LEVEL1_CSV, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            level1[row["item_id"]] = {
                "mod": row["mod_name"], "name": row["note"],
                "nutrition": float(row["nutrition"]),
                "saturation": float(row["saturation"]),
                "level": float(row.get("type level") or 1),
            }
    print("level1 count:", len(level1))

    foods = {x["id"]: x for x in json.load(open(FS_LIB, encoding="utf-8"))["items"]}
    tag_map = load_tags()
    print("tags loaded:", len(tag_map))
    oei = load_oei()
    print("oei replacements:", len(oei))

    def canon(iid):
        return oei.get(iid, iid)

    def canon_counter(counter):
        """把 Counter 里的 item 键做 OEI 归一化，计数合并。"""
        out = collections.Counter()
        for k, v in counter.items():
            out[canon(k)] += v
        return out

    # normalize tag members through OEI too
    if oei:
        tag_map = {t: set(canon(m) for m in members) for t, members in tag_map.items()}

    recipes = [r for r in collect(RECIPES) if r.get("type") in COOK_TYPES]
    print("cook recipes:", len(recipes))

    prod_recipes = collections.defaultdict(list)   # pid -> [(ids, tags, cnt, rtype, cids, ctags)]
    for r in recipes:
        res = get_results(r)
        if not res:
            continue
        ids, tags = collect_ingredients(r)
        ids = canon_counter(ids)                   # OEI: normalize ingredients (keep counts)
        cids, ctags = collect_containers(r)        # container/carrier fields
        cids = canon_counter(cids)                 # OEI: normalize containers (keep counts)
        rtype = r.get("type")
        products = {}
        for iid, c in res:
            key = canon(iid)                       # OEI: normalize results
            products[key] = products.get(key, 0) + c
        for pid, cnt in products.items():
            prod_recipes[pid].append((ids, tags, cnt, rtype, cids, ctags))

    def sig_of(ids, tags, cnt, cids, ctags):
        """用带计数的签名（把 Counter 变成 sorted tuple），以区分"数量不同"的配方。"""
        return (tuple(sorted(ids.items())), tuple(sorted(tags.items())), cnt,
                tuple(sorted(cids.items())), tuple(sorted(ctags.items())))

    # 方案①: 若多个配方原料/数量/产出数量完全相同(仅 type 不同), 合并为一个
    merged = {}
    for pid, recs in prod_recipes.items():
        seen = {}
        for ids, tags, cnt, rtype, cids, ctags in recs:
            sig = sig_of(ids, tags, cnt, cids, ctags)
            if sig not in seen:
                seen[sig] = (ids, tags, cnt, rtype, cids, ctags)
        merged[pid] = list(seen.values())
    prod_recipes = merged

    multi = {pid: recs for pid, recs in prod_recipes.items() if len(recs) > 1}

    # 方案A: 多配方物品 -> 选"原料总数/产出数量"比值最小的配方参与计算
    def ing_total(ids, tags):
        # 原料总数 = 各原料出现次数之和（含 tag）
        return sum(ids.values()) + sum(tags.values())

    rec_choice = {}
    for pid, recs in prod_recipes.items():
        best = None
        best_ratio = None
        for rec in recs:
            ids, tags, cnt, rtype, cids, ctags = rec
            ratio = ing_total(ids, tags) / max(cnt, 1)
            if best_ratio is None or ratio < best_ratio:
                best_ratio = ratio
                best = rec
        rec_choice[pid] = best

    level_map = {}
    for iid, info in level1.items():
        level_map[iid] = {"level": info.get("level", 1.0), "nutrition": info["nutrition"],
                          "saturation": info["saturation"], "name": info["name"]}

    # tag multi-level logging: tag_id -> set(levels)
    tag_levels_seen = {}

    changed = True
    rounds = 0
    while changed:
        changed = False
        rounds += 1
        for pid, recs in prod_recipes.items():
            if pid in level1 or pid in level_map:
                continue
            if pid not in foods:
                continue
            ids, tags, cnt, rtype, cids, ctags = rec_choice[pid]
            total = 0.0
            has_food = False
            unknown_food = False
            unresolvable = False
            # ids/tags 为 Counter: 同种原料出现 N 次 -> 累加 N 次
            for iid, num in ids.items():
                if iid in level_map:
                    total += level_map[iid]["level"] * num
                    has_food = True
                elif iid in foods:
                    unknown_food = True
            for tid, num in tags.items():
                members = tag_map.get(tid, set())
                known_levels = [level_map[m]["level"] for m in members if m in level_map]
                # also consider tag members that are foods but have no level yet
                tag_unknown = any((m in foods and m not in level_map) for m in members)
                if known_levels:
                    if len(set(known_levels)) > 1:
                        tag_levels_seen.setdefault(tid, set()).update(known_levels)
                    total += min(known_levels) * num
                    has_food = True
                    if tag_unknown:
                        unknown_food = True
                else:
                    unresolvable = True
            # 容器/载体：若使用的是"食物且有 level"，也计入 level（例: carrier=米饭）。
            # 注意：容器缺失/非食物 不影响计算（仍视为被排除的载体）。
            for iid, num in cids.items():
                if iid in level_map:
                    total += level_map[iid]["level"] * num
                    has_food = True
            for tid, num in ctags.items():
                members = tag_map.get(tid, set())
                known_levels = [level_map[m]["level"] for m in members if m in level_map]
                if known_levels:
                    if len(set(known_levels)) > 1:
                        tag_levels_seen.setdefault(tid, set()).update(known_levels)
                    total += min(known_levels) * num
                    has_food = True
            if unresolvable or unknown_food or not has_food:
                continue
            lv = round(total / max(cnt, 1), 2)
            if lv <= 0:
                continue
            level_map[pid] = {"level": lv, "nutrition": round(2 * lv, 2),
                              "saturation": round(4 * lv, 2),
                              "name": foods.get(pid, {}).get("name", "")}
            changed = True

    print("rounds:", rounds)
    print("items with level:", len(level_map))

    rows = []
    for iid, info in level_map.items():
        nm = foods.get(iid, {}).get("name", "") or info.get("name", "")
        tag = "generated" if (info["level"] == 1.0 and iid not in level1) else ""
        rows.append([iid.split(":")[0], iid, info["nutrition"],
                     info["saturation"], tag, info["level"], nm])
    rows.sort(key=lambda r: (r[5], r[1]))

    with open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["mod_name", "item_id", "nutrition", "saturation", "tag", "type level", "note"])
        w.writerows(rows)
    print("written:", OUT_CSV, "rows:", len(rows))

    # 额外输出 item_id -> level 的 JSON 映射，供 KubeJS startup 阶段用 JsonIO 读取
    level_json = {}
    for r in rows:
        item_id = r[1]
        level_json[item_id] = r[5]
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(level_json, f, ensure_ascii=False, indent=0, sort_keys=True)
    print("written:", OUT_JSON, "entries:", len(level_json))

    md2 = ["# items with multiple recipes (not used)\n",
           "total: %d\n" % len(multi),
           "| item | recipe count |", "|---|---|"]
    for pid, recs in sorted(multi.items()):
        md2.append("| %s | %d |" % (pid, len(recs)))
    open(OUT_MULTI_MD, "w", encoding="utf-8").write("\n".join(md2))
    print("multi items:", len(multi), "->", OUT_MULTI_MD)

    # tag with multiple different levels
    md3 = ["# tags containing foods of multiple different levels\n",
           "total: %d\n" % len(tag_levels_seen),
           "| tag | levels found | members (resolved) |", "|---|---|---|"]
    for tid, lvs in sorted(tag_levels_seen.items()):
        members = sorted(tag_map.get(tid, set()))
        md3.append("| %s | %s | %s |" % (tid, ", ".join(str(x) for x in sorted(lvs)), ", ".join(members)))
    open(OUT_TAGMD, "w", encoding="utf-8").write("\n".join(md3))
    print("tag multi-level:", len(tag_levels_seen), "->", OUT_TAGMD)


if __name__ == "__main__":
    main()
