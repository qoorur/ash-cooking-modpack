// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery); optional addons: kaleidoscope_chinesefood, kaleidoscope_nether, kaleidoscope_end
// ==============================================================
ServerEvents.recipes(event => {
    let map = event.originalRecipes;
    if (!map) return;

    let sourceRecipes = [];
    let flexRecipes = [];
    let skippedNoResult = 0;
    let skippedInvalidIngredient = 0;
    let convertedCount = 0;
    let skippedCreateError = 0;
    let skippedKnownBad = 0; // 跳过已知无法转换的配方

    // 这些配方因标签无效导致生成无序配方时出错，直接跳过
    const SKIP_RESULT_ITEMS = [
        'kaleidoscope_nether:spicy_pot',
        'kaleidoscope_chinesefood:stir_fried_three_fresh_vegetables_rice',
        'kaleidoscope_nether:roujiamo',
        'kaleidoscope_chinesefood:red_rice_roll',
        'kaleidoscope_chinesefood:stir_fried_three_fresh_vegetables',
        'kaleidoscope_nether:spicy_pot_rice',
        'kaleidoscope_nether:ghast_pasta',
        'kaleidoscope_nether:star_ghast_pasta',
        'kaleidoscope_end:chorus_pasta'
    ];

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

    function extractCleanIngredient(jsonObj) {
        if (!jsonObj || !jsonObj.isJsonObject()) return null;
        let clean = {};
        if (jsonObj.has("item")) {
            let itemStr = jsonObj.get("item").getAsString();
            if (itemStr && itemStr.trim() !== "") clean.item = itemStr;
            else return null;
        } else if (jsonObj.has("tag")) {
            let tagStr = jsonObj.get("tag").getAsString();
            if (tagStr && tagStr.trim() !== "") clean.tag = tagStr;
            else return null;
        } else return null;
        return clean;
    }

    const DEFAULT_CARRIER = { item: "minecraft:bowl" };

    let iterator = map.entrySet().iterator();
    while (iterator.hasNext()) {
        let entry = iterator.next();
        let id = String(entry.getKey());
        let recipe = entry.getValue();

        let type = String(recipe.getType());
        if (type !== 'kaleidoscope_cookery:pot' && type !== 'kaleidoscope_cookery:flex_pot') continue;

        try {
            let resultStack = recipe.getOriginalRecipeResult();
            if (!resultStack || resultStack.isEmpty()) {
                skippedNoResult++;
                continue;
            }
            let resultItem = String(resultStack.getItem());
            let resultCount = 1;

            // 检查是否为已知无法转换的配方
            if (SKIP_RESULT_ITEMS.includes(resultItem)) {
                skippedKnownBad++;
                console.log(`[跳过] 配方 ${id}（输出 ${resultItem}）因原料标签无效而跳过转换`);
                continue;
            }

            let ingredients = recipe.getOriginalRecipeIngredients();
            if (!ingredients || ingredients.length === 0) continue;

            let ingredientJson = [];
            for (let ing of ingredients) {
                if (ing.isEmpty()) continue;
                let jsonElement = ing.toJson();
                if (jsonElement.isJsonArray()) {
                    let arr = jsonElement.getAsJsonArray();
                    if (arr.size() === 0) continue;
                    jsonElement = arr.get(0);
                }
                if (!jsonElement.isJsonObject()) continue;
                let jsonObj = jsonElement.getAsJsonObject();
                let clean = extractCleanIngredient(jsonObj);
                if (clean) ingredientJson.push(clean);
            }

            if (ingredientJson.length === 0) {
                skippedInvalidIngredient++;
                continue;
            }

            let recipeJson = recipe.json;
            let soupBase = null;
            if (recipeJson && recipeJson.has("soup_base")) {
                soupBase = recipeJson.get("soup_base").getAsString();
            }
            let carrier = null;
            if (recipeJson && recipeJson.has("carrier")) {
                let carrierJson = recipeJson.get("carrier");
                if (carrierJson.isJsonArray()) {
                    let arr = carrierJson.getAsJsonArray();
                    if (arr.size() > 0) carrierJson = arr.get(0);
                }
                carrier = extractCleanIngredient(carrierJson);
            }

            let deduped = deduplicateIngredients(ingredientJson);
            if (!deduped.every(isValidIngredient)) {
                skippedInvalidIngredient++;
                continue;
            }

            let recipeData = {
                id: id,
                resultItem: resultItem,
                resultCount: resultCount,
                dedupedIngredients: deduped,
                soupBase: soupBase,
                carrier: carrier,
                type: type
            };

            if (type === 'kaleidoscope_cookery:pot') {
                sourceRecipes.push(recipeData);
            } else {
                flexRecipes.push(recipeData);
            }
        } catch (e) {
            console.warn(`处理炒菜锅配方 ${id} 时出错: ${e}`);
        }
    }

    sourceRecipes.forEach(source => {
        let finalIngredients = deduplicateIngredients(source.dedupedIngredients);
        if (finalIngredients.length === 0) return;

        let effectiveCarrier = source.carrier || DEFAULT_CARRIER;

        let hasFlex = flexRecipes.some(flex =>
            flex.resultItem === source.resultItem &&
            flex.resultCount === source.resultCount &&
            (flex.soupBase || null) === (source.soupBase || null) &&
            (flex.carrier ? ingredientKey(flex.carrier) : '') === ingredientKey(effectiveCarrier) &&
            compareIngredients(flex.dedupedIngredients, finalIngredients)
        );

        if (!hasFlex) {
            event.remove({ id: source.id });
            try {
                let newRecipe = {
                    type: 'kaleidoscope_cookery:flex_pot',
                    ingredients: finalIngredients,
                    carrier: effectiveCarrier,
                    result: {
                        id: source.resultItem,
                        count: source.resultCount
                    }
                };
                if (source.soupBase) newRecipe.soup_base = source.soupBase;
                event.custom(newRecipe).id(source.id);
                convertedCount++;

                flexRecipes.push({
                    id: source.id,
                    resultItem: source.resultItem,
                    resultCount: source.resultCount,
                    dedupedIngredients: finalIngredients,
                    soupBase: source.soupBase,
                    carrier: effectiveCarrier,
                    type: 'kaleidoscope_cookery:flex_pot'
                });
            } catch (e) {
                skippedCreateError++;
                console.warn(`无法生成无序炒菜配方 ${source.id}，跳过: ${e}`);
            }
        }
    });

    console.log(`炒菜锅转换：跳过无结果 ${skippedNoResult}，跳过无效原料 ${skippedInvalidIngredient}，跳过已知问题配方 ${skippedKnownBad}，成功转换 ${convertedCount}，生成失败跳过 ${skippedCreateError}`);
});


ServerEvents.recipes(event => {
    event.remove({ type: 'kaleidoscope_cookery:pot' })
})


