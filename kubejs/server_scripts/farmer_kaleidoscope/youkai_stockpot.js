// ==============================================================
// DEPENDENCIES (required mods):
//   Youkaishomecoming (youkaishomecoming), Kaleidoscope Cookery (kaleidoscope_cookery)
// ==============================================================
// priority: 0
// 妖怪们的归家 unordered_cooking → 森罗物语 flex_stockpot（无序煮锅）
// 不同输出物品使用不同的 carrier

ServerEvents.recipes(event => {
    let map = event.originalRecipes;
    if (!map) return;

    let sourceRecipes = [];
    let flexRecipes = [];
    let stats = { noResult: 0, invalidIng: 0, converted: 0, createError: 0, skippedDuplicate: 0 };

    // 载体映射表：根据输出物品决定 carrier，未列出的使用 short_iron_pot
    const CARRIER_MAP = {
        'youkaishomecoming:pot_of_cod_stew':               { item: 'youkaishomecoming:short_iron_pot' },
        'youkaishomecoming:pot_of_shirayuki':              { item: 'youkaishomecoming:short_iron_pot' },
        'youkaishomecoming:pot_of_han_palace':             { item: 'youkaishomecoming:short_iron_pot' },
        'youkaishomecoming:pot_of_tofu_crab_stew':         { item: 'youkaishomecoming:short_iron_pot' },

        'youkaishomecoming:pot_of_power_soup':             { item: 'youkaishomecoming:stockpot' },
        'youkaishomecoming:pot_of_borscht':                { item: 'youkaishomecoming:stockpot' },
        'youkaishomecoming:pot_of_miso_soup':              { item: 'youkaishomecoming:stockpot' },
        'youkaishomecoming:pot_of_seafood_miso_soup':      { item: 'youkaishomecoming:stockpot' },
        'youkaishomecoming:pot_of_mushroom_soup':          { item: 'youkaishomecoming:stockpot' },
        'youkaishomecoming:pot_of_potato_soup':            { item: 'youkaishomecoming:stockpot' }
    };
    const DEFAULT_CARRIER = { item: 'youkaishomecoming:short_iron_pot' };

    function ingredientKey(ing) {
        if (ing.tag) return '#' + ing.tag;
        if (ing.item) return ing.item;
        return '';
    }

    function deduplicateIngredients(ingredients) {
        let seen = new Set();
        let result = [];
        for (let ing of ingredients) {
            let key = ingredientKey(ing);
            key = String(key);
            if (key === '' || key === 'undefined') continue;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(ing);
            }
        }
        return result;
    }

    function compareIngredients(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        let counter = new Map();
        for (let ing of arr1) {
            let key = String(ingredientKey(ing));
            counter.set(key, (counter.get(key) || 0) + 1);
        }
        for (let ing of arr2) {
            let key = String(ingredientKey(ing));
            let count = counter.get(key) || 0;
            if (count === 0) return false;
            counter.set(key, count - 1);
        }
        for (let val of counter.values()) if (val !== 0) return false;
        return true;
    }

    function isValidIngredient(clean) {
        try {
            if (clean.item) return !Item.of(clean.item).isEmpty();
            if (clean.tag) return !Ingredient.of('#' + clean.tag).isEmpty();
        } catch (e) {}
        return false;
    }

    function extractCleanFromJsonElement(je) {
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
        if (String(recipe.getType()) !== 'youkaishomecoming:unordered_cooking') continue;

        try {
            let rj = recipe.json;
            if (!rj) {
                console.log(`[跳过] ${id} - 无法获取配方 JSON`);
                continue;
            }

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

            let ingredientsJson = null;
            if (rj.has("input")) {
                ingredientsJson = rj.get("input").getAsJsonArray();
            }
            if (!ingredientsJson || ingredientsJson.size() === 0) {
                console.log(`[跳过] ${id} - 无原料`);
                continue;
            }

            let ingredientJson = [];
            for (let i = 0; i < ingredientsJson.size(); i++) {
                let je = ingredientsJson.get(i);
                if (je.isJsonArray()) {
                    let arr = je.getAsJsonArray();
                    if (arr.size() === 0) continue;
                    je = arr.get(0);
                }
                let clean = extractCleanFromJsonElement(je);
                if (clean) ingredientJson.push(clean);
            }

            if (ingredientJson.length === 0) {
                console.log(`[跳过] ${id} - 有效原料为空`);
                stats.invalidIng++;
                continue;
            }

            let deduped = deduplicateIngredients(ingredientJson);
            if (!deduped.every(isValidIngredient)) {
                console.log(`[跳过] ${id} - 原料无效（标签/物品不存在）`);
                stats.invalidIng++;
                continue;
            }

            let data = {
                id: id,
                resultItem: resultItem,
                resultCount: 1,
                dedupedIngredients: deduped,
                soupBase: null,
                type: 'youkaishomecoming:unordered_cooking'
            };
            sourceRecipes.push(data);

            let ingDesc = ingredientJson.map(function(i) { return i.tag ? '#'+i.tag : i.item; }).join(', ');
            console.log(`[读取] ${id} → 输出: ${resultItem} | 原料(${ingredientJson.length}): ${ingDesc}`);
        } catch (e) {
            console.warn(`[错误] ${id} - ${e}`);
        }
    }

    sourceRecipes.forEach(function(src) {
        let finalIng = deduplicateIngredients(src.dedupedIngredients);
        if (finalIng.length === 0) return;

        // 根据输出物品选择载体，若无映射则使用默认 short_iron_pot
        let effectiveCarrier = CARRIER_MAP[src.resultItem] || DEFAULT_CARRIER;

        let hasFlex = flexRecipes.some(function(f) {
            return f.resultItem === src.resultItem &&
                f.resultCount === src.resultCount &&
                (f.soupBase || null) === null &&
                f.carrier && ingredientKey(f.carrier) === ingredientKey(effectiveCarrier) &&
                compareIngredients(f.dedupedIngredients, finalIng);
        });

        if (!hasFlex) {
            event.remove({ id: src.id });
            try {
                let newR = {
                    type: 'kaleidoscope_cookery:flex_stockpot',
                    ingredients: finalIng,
                    carrier: effectiveCarrier,
                    result: { id: src.resultItem, count: src.resultCount }
                };
                event.custom(newR).id(src.id);
                stats.converted++;

                let ingDesc = finalIng.map(function(i) { return i.tag ? '#'+i.tag : i.item; }).join(', ');
                console.log(`[转换] ${src.id} → 无序煮锅: ${src.resultItem} | 载体: ${ingredientKey(effectiveCarrier)} | 原料(${finalIng.length}): ${ingDesc}`);

                flexRecipes.push({
                    id: src.id,
                    resultItem: src.resultItem,
                    resultCount: src.resultCount,
                    dedupedIngredients: finalIng,
                    soupBase: null,
                    carrier: effectiveCarrier,
                    type: 'kaleidoscope_cookery:flex_stockpot'
                });
            } catch (e) {
                stats.createError++;
                console.warn(`[失败] ${src.id} - ${e}`);
            }
        } else {
            console.log(`[跳过转换] ${src.id} - 已有相同无序配方`);
            stats.skippedDuplicate++;
        }
    });

    console.log(`妖怪归家无序烹饪转换完成：成功 ${stats.converted} | 跳过(重复) ${stats.skippedDuplicate} | 跳过(无结果) ${stats.noResult} | 跳过(无效原料) ${stats.invalidIng} | 失败 ${stats.createError}`);
});

// 清除所有原 unordered_cooking 配方
ServerEvents.recipes(event => {
    event.remove({ type: 'youkaishomecoming:unordered_cooking' });
    event.remove({ id: 'youkaishomecoming:small_iron_pot' });

});


