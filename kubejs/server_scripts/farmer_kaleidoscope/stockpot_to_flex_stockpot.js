// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery), Farmer's Delight (farmersdelight), ExtraDelight (extradelight); optional: kaleidoscope_chinesefood, kaleidoscope_nether
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
    let skippedSpecial = 0;
    let skippedEmptyIngredient = 0;
    let skippedDuplicate = 0;

    // ===== 命中即跳过：只要配方含有这些标签，整条配方不做转换 =====
    const SKIP_IF_CONTAINS_TAGS = new Set([
        'c:foods/pasta',
        'c:pasta',
    ]);

    // 兜底黑名单：日志里出现过的所有报错输出物品
    const SKIP_RESULT_ITEMS = new Set([
        'kaleidoscope_nether:spicy_pot',
        'kaleidoscope_chinesefood:stir_fried_three_fresh_vegetables_rice',
        'kaleidoscope_nether:roujiamo',
        'kaleidoscope_chinesefood:red_rice_roll',
        'kaleidoscope_chinesefood:stir_fried_three_fresh_vegetables',
        'kaleidoscope_nether:spicy_pot_rice',
        // ===== extradelight 报错配方 =====
        'extradelight:honey_chili_chicken',
        'extradelight:sauerkraut_and_sausage',
        'extradelight:devilled_sausages',
        'extradelight:caramel_chicken',
        'extradelight:orange_chicken',
        'extradelight:melon_lime_glazed_chicken',
        'extradelight:liver_onions',
        'extradelight:fried_brains',
        'extradelight:sos',
        'extradelight:beef_bulgogi',
        'extradelight:oxtail_soup'
    ]);

    const tagCache = new Map();

    // ===== 已生成 flex 配方签名，用于去重 =====
    let generatedSignatures = new Set();

    function normalizeTag(t) {
        if (!t) return '';
        let s = String(t);
        return s.startsWith('#') ? s.substring(1) : s;
    }

    function ingredientKey(ing) {
        if (ing.tag) return '#' + normalizeTag(ing.tag);
        if (ing.item) return ing.item;
        return '';
    }

    function deduplicateIngredients(ingredients) {
        let seen = new Set();
        let result = [];
        for (let ing of ingredients) {
            let key = String(ingredientKey(ing));
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

    // ===== 构建配方签名（用于去重） =====
    // 签名由 5 部分组成：输出物品、数量、汤底、容器、排序后的材料列表
    function buildSignature(resultItem, resultCount, soupBase, carrier, ingredients) {
        let ingKeys = ingredients.map(i => String(ingredientKey(i))).sort();
        return [
            String(resultItem),
            String(resultCount),
            String(soupBase || ''),
            carrier ? String(ingredientKey(carrier)) : '',
            ingKeys.join('|')
        ].join('::');
    }

    function tagHasItems(tag) {
        if (!tag) return false;
        let n = normalizeTag(tag);
        if (tagCache.has(n)) return tagCache.get(n);

        let result = false;
        try {
            let ing = Ingredient.of('#' + n);
            if (ing && !ing.isEmpty()) {
                if (typeof ing.getItems === 'function') {
                    let stacks = ing.getItems();
                    if (stacks && stacks.length > 0) {
                        for (let s of stacks) {
                            if (s && !s.isEmpty()) {
                                result = true;
                                break;
                            }
                        }
                    }
                } else {
                    result = true;
                }
            }
        } catch (e) {
            result = false;
        }
        tagCache.set(n, result);
        return result;
    }

    function itemExists(itemId) {
        if (!itemId) return false;
        try {
            return !Item.of(itemId).isEmpty();
        } catch (e) {
            return false;
        }
    }

    function isValidIngredient(clean) {
        if (!clean) return false;
        if (clean.item) return itemExists(clean.item);
        if (clean.tag) return tagHasItems(clean.tag);
        return false;
    }

    function extractCleanItem(jsonObj) {
        if (!jsonObj || !jsonObj.isJsonObject()) return null;
        let clean = {};
        if (jsonObj.has("item")) {
            let s = jsonObj.get("item").getAsString();
            if (s && s.trim()) clean.item = s; else return null;
        } else if (jsonObj.has("tag")) {
            let s = jsonObj.get("tag").getAsString();
            if (s && s.trim()) clean.tag = s; else return null;
        } else if (jsonObj.has("id")) {
            let s = jsonObj.get("id").getAsString();
            if (s && s.trim()) clean.item = s; else return null;
        }
        return clean;
    }

    // ===== 容器字段的通用提取器（兼容 carrier / container 两种格式） =====
    function extractCarrier(recipeJson, fieldName) {
        if (!recipeJson.has(fieldName)) return null;
        let cj = recipeJson.get(fieldName);
        if (cj.isJsonArray()) {
            let arr = cj.getAsJsonArray();
            if (arr.size() > 0) cj = arr.get(0);
        }
        return extractCleanItem(cj);
    }
    // ===== 结束 =====

    function isSkippedTag(clean) {
        return !!(clean && clean.tag && SKIP_IF_CONTAINS_TAGS.has(normalizeTag(clean.tag)));
    }

    let iterator = map.entrySet().iterator();
    while (iterator.hasNext()) {
        let entry = iterator.next();
        let id = String(entry.getKey());
        let recipe = entry.getValue();

        let type = String(recipe.getType());
        if (type !== 'kaleidoscope_cookery:stockpot' &&
            type !== 'kaleidoscope_cookery:flex_stockpot' &&
            type !== 'farmersdelight:cooking') continue;

        if (id.includes('udon_noodle') || id.includes('poor_god_soup')) {
            skippedSpecial++;
            continue;
        }

        try {
            let resultStack = recipe.getOriginalRecipeResult();
            if (!resultStack || resultStack.isEmpty()) {
                skippedNoResult++;
                continue;
            }
            let resultItem = String(resultStack.getItem());
            let resultCount = 1;

            if (SKIP_RESULT_ITEMS.has(resultItem)) {
                skippedInvalidIngredient++;
                continue;
            }

            let ingredients = recipe.getOriginalRecipeIngredients();
            if (!ingredients || ingredients.length === 0) continue;

            let ingredientJson = [];
            let invalidIngredientFound = false;

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

                let clean = {};
                if (jsonObj.has("item")) {
                    let itemStr = jsonObj.get("item").getAsString();
                    if (itemStr && itemStr.trim() !== "") {
                        clean.item = itemStr;
                    } else continue;
                } else if (jsonObj.has("tag")) {
                    let tagStr = jsonObj.get("tag").getAsString();
                    if (tagStr && tagStr.trim() !== "") {
                        clean.tag = tagStr;
                    } else continue;
                } else continue;

                if (isSkippedTag(clean)) {
                    console.log(`[跳过] 配方 ${id} 含有跳过标签 #${normalizeTag(clean.tag)}`);
                    invalidIngredientFound = true;
                    break;
                }

                if (!isValidIngredient(clean)) {
                    invalidIngredientFound = true;
                    break;
                }

                ingredientJson.push(clean);
            }

            if (invalidIngredientFound) {
                skippedEmptyIngredient++;
                continue;
            }

            if (ingredientJson.length === 0) {
                skippedInvalidIngredient++;
                continue;
            }

            let recipeJson = recipe.json;

            let soupBase = null;
            let carrier = null;
            let time = null;
            let cookingTexture = null;
            let finishedTexture = null;
            let cookingBubbleColor = null;
            let finishedBubbleColor = null;

            if (recipeJson) {
                if (recipeJson.has("soup_base")) {
                    soupBase = recipeJson.get("soup_base").getAsString();
                }

                // ===== 优先从 carrier 读，没有则从 container 读 =====
                carrier = extractCarrier(recipeJson, "carrier");
                if (!carrier) {
                    carrier = extractCarrier(recipeJson, "container");
                }
                // ===== 结束 =====

                if (recipeJson.has("time")) {
                    time = recipeJson.get("time").getAsInt();
                }
                if (recipeJson.has("cooking_texture")) {
                    cookingTexture = recipeJson.get("cooking_texture").getAsString();
                }
                if (recipeJson.has("finished_texture")) {
                    finishedTexture = recipeJson.get("finished_texture").getAsString();
                }
                if (recipeJson.has("cooking_bubble_color")) {
                    cookingBubbleColor = recipeJson.get("cooking_bubble_color").getAsInt();
                }
                if (recipeJson.has("finished_bubble_color")) {
                    finishedBubbleColor = recipeJson.get("finished_bubble_color").getAsInt();
                }
            }

            let deduped = deduplicateIngredients(ingredientJson);

            let dedupHasSkipped = false;
            for (let ing of deduped) {
                if (isSkippedTag(ing)) { dedupHasSkipped = true; break; }
            }
            if (dedupHasSkipped) {
                console.log(`[跳过-dedup] 配方 ${id} deduped 后仍含跳过标签`);
                skippedEmptyIngredient++;
                continue;
            }

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
                time: time,
                cookingTexture: cookingTexture,
                finishedTexture: finishedTexture,
                cookingBubbleColor: cookingBubbleColor,
                finishedBubbleColor: finishedBubbleColor,
                type: type
            };

            if (type === 'kaleidoscope_cookery:stockpot' || type === 'farmersdelight:cooking') {
                sourceRecipes.push(recipeData);
            } else if (type === 'kaleidoscope_cookery:flex_stockpot') {
                flexRecipes.push(recipeData);
            }
        } catch (e) {
            console.warn(`处理锅配方 ${id} 时出错: ${e}`);
        }
    }

    sourceRecipes.forEach(source => {
        let finalIngredients = deduplicateIngredients(source.dedupedIngredients);
        if (finalIngredients.length === 0) return;

        // ===== 第三层拦截：finalIngredients 里有跳过标签 -> 整条跳过 =====
        let finalHasSkipped = false;
        for (let ing of finalIngredients) {
            if (isSkippedTag(ing)) { finalHasSkipped = true; break; }
        }
        if (finalHasSkipped) {
            console.log(`[跳过-final] 配方 ${source.id} finalIngredients 仍含跳过标签，整条跳过`);
            skippedEmptyIngredient++;
            return;
        }
        // ===== 结束 =====

        if (!finalIngredients.every(isValidIngredient)) {
            skippedInvalidIngredient++;
            return;
        }

        let hasFlex = flexRecipes.some(flex =>
            flex.resultItem === source.resultItem &&
            flex.resultCount === source.resultCount &&
            (flex.soupBase || null) === (source.soupBase || null) &&
            ((!flex.carrier && !source.carrier) ||
             (flex.carrier && source.carrier && ingredientKey(flex.carrier) === ingredientKey(source.carrier))) &&
            compareIngredients(flex.dedupedIngredients, finalIngredients)
        );

        if (!hasFlex) {
            // ===== 去重：签名已存在则跳过 =====
            let signature = buildSignature(
                source.resultItem,
                source.resultCount,
                source.soupBase,
                source.carrier,
                finalIngredients
            );
            if (generatedSignatures.has(signature)) {
                console.log(`[跳过-重复] 配方 ${source.id} 与已生成配方重复，签名: ${signature}`);
                skippedDuplicate++;
                return;
            }
            generatedSignatures.add(signature);
            // ===== 结束 =====

            if (source.type === 'kaleidoscope_cookery:stockpot') {
                event.remove({ id: source.id });
            }
            try {
                let newRecipe = {
                    type: 'kaleidoscope_cookery:flex_stockpot',
                    ingredients: finalIngredients,
                    result: {
                        id: source.resultItem,
                        count: source.resultCount
                    }
                };
                if (source.soupBase) newRecipe.soup_base = source.soupBase;
                if (source.carrier) newRecipe.carrier = source.carrier;
                if (source.time !== null && source.time !== undefined) newRecipe.time = source.time;
                if (source.cookingTexture) newRecipe.cooking_texture = source.cookingTexture;
                if (source.finishedTexture) newRecipe.finished_texture = source.finishedTexture;
                if (source.cookingBubbleColor !== null && source.cookingBubbleColor !== undefined) newRecipe.cooking_bubble_color = source.cookingBubbleColor;
                if (source.finishedBubbleColor !== null && source.finishedBubbleColor !== undefined) newRecipe.finished_bubble_color = source.finishedBubbleColor;

                event.custom(newRecipe).id(source.id);
                convertedCount++;
            } catch (e) {
                skippedCreateError++;
                console.warn(`无法生成无序配方 ${source.id}，跳过: ${e}`);
            }
        }
    });

    console.log(`森罗物语锅转换：跳过无结果 ${skippedNoResult}，跳过无效原料 ${skippedInvalidIngredient}，跳过空标签配方 ${skippedEmptyIngredient}，跳过重复 ${skippedDuplicate}，跳过特殊配方 ${skippedSpecial}，成功转换 ${convertedCount}，生成失败跳过 ${skippedCreateError}`);
});

// 清理原配方
ServerEvents.recipes(event => {
    event.remove({ type: 'farmersdelight:cooking' });
    event.remove({ type: 'kaleidoscope_cookery:stockpot' });
    event.remove({ id: 'farmersdelight:cooking_pot' });
});