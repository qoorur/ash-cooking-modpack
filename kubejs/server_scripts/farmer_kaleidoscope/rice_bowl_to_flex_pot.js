// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery); optional addons:
//   kaleidoscope_chinesefood, kaleidoscope_nether, kaleidoscope_end
// ==============================================================
// kubejs/server_scripts/farmer_kaleidoscope/rice_bowl_to_flex_pot.js
// =====================================================================
// 【配方转换】隐藏工作台「盖饭(装饭)」rice_bowl → 无序煎锅 flex_pot
// ---------------------------------------------------------------------
// 背景：
//   kaleidoscope_cookery:rice_bowl 是「自定义工作台配方(CustomRecipe)」，
//   配方 JSON 只写了一道"菜"(ingredient)，米饭(c:foods/cooked_rice)由 Java 硬编码补。
//   例：twice_cooked_pork (回锅肉) + 米饭  ->  twice_cooked_pork_rice (回锅肉盖饭)
//   缺点：占工作台，且脚本/JEI/level 难以识别"米饭"这一原料。
//
// 目标（用户确认）：
//   参照森罗 nether/end 附属的盖饭形式，改为**无序煎锅 flex_pot**：
//   直接复用「那道菜自己的 flex_pot 配方」的 ingredients，
//   把 carrier 换成 **米饭**，产出对应盖饭成品，再删掉旧 rice_bowl 配方。
//
//   例：twice_cooked_pork 的 flex_pot ingredients = [c:foods/cooked_pork, c:crops/chilipepper]
//       -> 新 flex_pot: ingredients=[...], carrier={tag:c:foods/cooked_rice},
//          result = kaleidoscope_chinesefood:twice_cooked_pork_rice
//
// 规则：
//   - 遍历 originalRecipes，只处理 type == kaleidoscope_cookery:rice_bowl
//   - 取该盖饭配方的 ingredient（必须为单个 item，即"那道菜"）
//   - 到 originalRecipes 里找该菜的 flex_pot 配方，复制其 ingredients
//   - 生成新 flex_pot：ingredients=菜的料, carrier=米饭, result=盖饭
//   - 删除原 rice_bowl 配方
//   - 找不到菜的 flex_pot 配方则跳过（保留原 rice_bowl，避免死区）
// =====================================================================

(function () {
    const DEBUG = true;
    function log(m) { if (DEBUG) console.info('[BOWL2FLEX] ' + m); }

    // 米饭 carrier 标签（森罗 c:foods/cooked_rice，oei 已统一各种 cooked_rice）
    const RICE_CARRIER = { tag: 'c:foods/cooked_rice' };

    // ingredient -> 唯一 key（用于日志/比对）
    function ingKey(ing) {
        if (!ing) return '';
        if (ing.tag) return '#' + ing.tag;
        if (ing.item) return ing.item;
        return '';
    }

    // 把 KubeJS Ingredient 数组规整为干净 json 数组（[{item:...}|{tag:...}]）
    function cleanIngredients(ingredients) {
        let out = [];
        if (!ingredients) return out;
        for (let i = 0; i < ingredients.length; i++) {
            let ing = ingredients[i];
            if (!ing || ing.isEmpty()) continue;
            let je = ing.toJson();
            if (je.isJsonArray()) {
                let arr = je.getAsJsonArray();
                if (arr.size() === 0) continue;
                je = arr.get(0);
            }
            if (!je.isJsonObject()) continue;
            let o = je.getAsJsonObject();
            if (o.has('item')) {
                let s = o.get('item').getAsString();
                if (s && s.trim()) out.push({ item: s });
            } else if (o.has('tag')) {
                let s = o.get('tag').getAsString();
                if (s && s.trim()) out.push({ tag: s });
            }
        }
        return out;
    }

    ServerEvents.recipes(event => {
        let map = event.originalRecipes;
        if (!map) { log('无 originalRecipes，跳过'); return; }

        // ---- 第一遍：收集所有 flex_pot 配方，按"产物物品"建索引 ----
        let flexByResult = {};
        let it0 = map.entrySet().iterator();
        while (it0.hasNext()) {
            let e = it0.next();
            let r = e.getValue();
            let type = String(r.getType());
            if (type !== 'kaleidoscope_cookery:flex_pot') continue;
            try {
                let rs = r.getOriginalRecipeResult();
                if (!rs || rs.isEmpty()) continue;
                let item = String(rs.getItem());
                let ings = cleanIngredients(r.getOriginalRecipeIngredients());
                if (ings.length === 0) continue;
                if (!flexByResult[item]) flexByResult[item] = [];
                flexByResult[item].push({ id: String(e.getKey()), ingredients: ings });
            } catch (err) {
                log('收集 flex_pot 出错: ' + e.getKey() + ' : ' + err);
            }
        }

        // ---- 第二遍：处理所有 rice_bowl 配方 ----
        let it = map.entrySet().iterator();
        let converted = 0, skippedNoDishFlex = 0, skippedBadIng = 0;
        let toRemove = [];

        while (it.hasNext()) {
            let e = it.next();
            let id = String(e.getKey());
            let recipe = e.getValue();
            let type = String(recipe.getType());
            if (type !== 'kaleidoscope_cookery:rice_bowl') continue;

            try {
                // 盖饭产出
                let rs = recipe.getOriginalRecipeResult();
                if (!rs || rs.isEmpty()) { log('无产出跳过: ' + id); continue; }
                let bowlItem = String(rs.getItem());

                // 盖饭配方的 ingredient = "那道菜"（应为单个 item）
                let rawIngs = recipe.getOriginalRecipeIngredients();
                let dish = null;
                if (rawIngs && rawIngs.length > 0) {
                    let c = cleanIngredients(rawIngs);
                    if (c.length > 0) dish = c[0];
                }
                if (!dish || !dish.item) {
                    skippedBadIng++;
                    log('ingredient 非单一物品，跳过: ' + id);
                    continue;
                }

                // 找到"那道菜"自己的 flex_pot 配方，复用其 ingredients
                let dishFlex = flexByResult[dish.item];
                if (!dishFlex || dishFlex.length === 0) {
                    skippedNoDishFlex++;
                    log('找不到菜的 flex_pot，跳过(保留原配方): ' + id + ' 菜=' + dish.item);
                    continue;
                }
                let ingredients = dishFlex[0].ingredients;

                // 生成新 flex_pot：菜料 + carrier=米饭 -> 盖饭
                // 用新 id，避免与原 rice_bowl 同名冲突（先 remove 旧、再加新）
                let newId = 'bowl2flex/' + id.replace(/[:/]/g, '_');
                event.custom({
                    type: 'kaleidoscope_cookery:flex_pot',
                    ingredients: ingredients,
                    carrier: RICE_CARRIER,
                    result: { id: bowlItem, count: 1 }
                }).id(newId);

                toRemove.push(id);
                converted++;
                log('转换: ' + id + ' (' + dish.item + ' + 米饭) -> ' + bowlItem +
                    ' | 料=' + ingredients.map(ingKey).join(','));
            } catch (err) {
                log('处理 rice_bowl 出错: ' + id + ' : ' + err);
            }
        }

        // 删除原 rice_bowl 配方（新配方用相同 id，remove 删旧）
        for (let i = 0; i < toRemove.length; i++) event.remove({ id: toRemove[i] });

        log('完成：转换 ' + converted + ' 个盖饭；跳过(菜无flex) ' + skippedNoDishFlex +
            '；跳过(原料异常) ' + skippedBadIng);
    });

    console.info('[BOWL2FLEX] ========== 盖饭(rice_bowl) → 无序煎锅(flex_pot) 模块已加载 ==========');
})();