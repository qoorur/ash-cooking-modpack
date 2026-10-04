// ==============================================================
// DEPENDENCIES (required mods):
//   Youkaishomecoming (youkaishomecoming), Kaleidoscope Cookery (kaleidoscope_cookery)
// ==============================================================
// priority: 0
// youkaishomecoming:steaming → kaleidoscope_cookery:steamer

ServerEvents.recipes(event => {
    let map = event.originalRecipes;
    if (!map) return;

    let sourceRecipes = [];
    let existingFlex = []; // 已有 steamer 配方，用于去重
    let stats = { noResult: 0, invalidIng: 0, converted: 0, createError: 0, skippedDuplicate: 0 };

    function ingredientKey(ing) {
        if (ing.tag) return '#' + ing.tag;
        if (ing.item) return ing.item;
        return '';
    }

    function compareIngredients(ing1, ing2) {
        return ingredientKey(ing1) === ingredientKey(ing2);
    }

    function isValidIngredient(clean) {
        try {
            if (clean.item) return !Item.of(clean.item).isEmpty();
            if (clean.tag) return !Ingredient.of('#' + clean.tag).isEmpty();
        } catch (e) { }
        return false;
    }

    function extractCleanIngredient(je) {
        if (!je || !je.isJsonObject()) return null;
        let jo = je.getAsJsonObject();
        let clean = {};
        if (jo.has("item")) {
            let s = jo.get("item").getAsString();
            if (s && s.trim()) clean.item = s; else return null;
        } else if (jo.has("tag")) {
            let s = jo.get("tag").getAsString();
            if (s && s.trim()) clean.tag = s; else return null;
        } else return null;
        return clean;
    }

    let iterator = map.entrySet().iterator();
    while (iterator.hasNext()) {
        let entry = iterator.next();
        let id = String(entry.getKey());
        let recipe = entry.getValue();
        if (String(recipe.getType()) !== 'youkaishomecoming:steaming') continue;

        try {
            let rj = recipe.json;
            if (!rj) {
                console.log(`[跳过] ${id} - 无法获取配方 JSON`);
                continue;
            }

            // 提取结果
            let resultItem = null;
            if (rj.has("result")) {
                let resObj = rj.get("result").getAsJsonObject();
                if (resObj.has("id")) resultItem = resObj.get("id").getAsString();
            }
            if (!resultItem) {
                console.log(`[跳过] ${id} - 结果为空`);
                stats.noResult++;
                continue;
            }

            // 提取原料（单一 ingredient）
            let ingredientClean = null;
            if (rj.has("ingredient")) {
                let ingJson = rj.get("ingredient");
                // 支持数组（极少情况）
                if (ingJson.isJsonArray()) {
                    let arr = ingJson.getAsJsonArray();
                    if (arr.size() > 0) ingJson = arr.get(0);
                }
                ingredientClean = extractCleanIngredient(ingJson);
            }

            if (!ingredientClean) {
                console.log(`[跳过] ${id} - 原料无效`);
                stats.invalidIng++;
                continue;
            }

            if (!isValidIngredient(ingredientClean)) {
                console.log(`[跳过] ${id} - 原料不存在`);
                stats.invalidIng++;
                continue;
            }

            let data = {
                id: id,
                resultItem: resultItem,
                resultCount: 1, // 强制结果为1
                ingredient: ingredientClean,
                type: 'youkaishomecoming:steaming'
            };
            sourceRecipes.push(data);

            console.log(`[读取] ${id} → 输出: ${resultItem} | 原料: ${ingredientKey(ingredientClean)}`);
        } catch (e) {
            console.warn(`[错误] ${id} - ${e}`);
        }
    }

    // 收集已存在的 steamer 配方
    let existingIterator = map.entrySet().iterator();
    while (existingIterator.hasNext()) {
        let e = existingIterator.next();
        let rid = String(e.getKey());
        let r = e.getValue();
        if (String(r.getType()) === 'kaleidoscope_cookery:steamer') {
            let rj = r.json;
            if (rj && rj.has("ingredient") && rj.has("result")) {
                let ingClean = extractCleanIngredient(rj.get("ingredient"));
                let resObj = rj.get("result").getAsJsonObject();
                let resId = resObj.get("id").getAsString();
                if (ingClean && resId) {
                    existingFlex.push({
                        id: rid,
                        resultItem: resId,
                        resultCount: 1,
                        ingredient: ingClean
                    });
                }
            }
        }
    }

    // 生成 steamer 配方
    sourceRecipes.forEach(function (src) {
        let hasFlex = existingFlex.some(function (f) {
            return f.resultItem === src.resultItem &&
                f.resultCount === src.resultCount &&
                compareIngredients(f.ingredient, src.ingredient);
        });

        if (!hasFlex) {
            event.remove({ id: src.id });
            try {
                let newR = {
                    type: 'kaleidoscope_cookery:steamer',
                    ingredient: src.ingredient,
                    result: { id: src.resultItem, count: src.resultCount }
                };
                event.custom(newR).id(src.id);
                stats.converted++;
                console.log(`[转换] ${src.id} → steamer: ${src.resultItem} | 原料: ${ingredientKey(src.ingredient)}`);

                existingFlex.push({
                    id: src.id,
                    resultItem: src.resultItem,
                    resultCount: src.resultCount,
                    ingredient: src.ingredient
                });
            } catch (e) {
                stats.createError++;
                console.warn(`[失败] ${src.id} - ${e}`);
            }
        } else {
            console.log(`[跳过转换] ${src.id} - 已有相同 steamer 配方`);
            stats.skippedDuplicate++;
        }
    });

    console.log(`蒸配方转换完成：成功 ${stats.converted} | 跳过(重复) ${stats.skippedDuplicate} | 跳过(无结果) ${stats.noResult} | 跳过(无效原料) ${stats.invalidIng} | 失败 ${stats.createError}`);
});

// 清除原 steaming 配方
ServerEvents.recipes(event => {
    event.remove({ type: 'youkaishomecoming:steaming' });
    event.remove({ id: 'youkaishomecoming:steamer_pot' });
    event.remove({ output: 'youkaishomecoming:steamer_rack' });
    event.remove({ output: 'youkaishomecoming:steamer_lid' });

});

