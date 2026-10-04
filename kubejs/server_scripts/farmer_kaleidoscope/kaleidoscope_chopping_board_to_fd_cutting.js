// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery), Farmer's Delight (farmersdelight)
// ==============================================================
// priority: 1

ServerEvents.recipes(event => {
    let map = event.originalRecipes;
    if (!map) return;

    let iterator = map.entrySet().iterator();
    let convertedCount = 0;
    let skippedCount = 0;

    while (iterator.hasNext()) {
        let entry = iterator.next();
        let recipe = entry.getValue();
        let type = recipe.getType ? String(recipe.getType()) : '';
        if (type !== 'kaleidoscope_cookery:chopping_board') continue;

        try {
            let resultStack = recipe.getOriginalRecipeResult();
            if (!resultStack || resultStack.isEmpty()) {
                skippedCount++;
                continue;
            }

            let resultItem = String(resultStack.getItem());
            let resultCount = resultStack.getCount();

            let ingredients = recipe.getOriginalRecipeIngredients();
            if (!ingredients || ingredients.length === 0) {
                skippedCount++;
                continue;
            }

            // 构建纯 JS 输入数组
            let ingredientJson = [];
            for (let i = 0; i < ingredients.length; i++) {
                let ing = ingredients[i];
                let firstStack = ing.getFirst();
                if (firstStack && !firstStack.isEmpty()) {
                    ingredientJson.push({ item: String(firstStack.getItem()) });
                } else {
                    let tagKey = ing.getTag();
                    if (tagKey) {
                        ingredientJson.push({ tag: tagKey.toString() });
                    }
                }
            }
            if (ingredientJson.length === 0) {
                skippedCount++;
                continue;
            }

            // 按照农夫乐事 1.21.1 的真实格式构造配方
            let newRecipe = {
                type: 'farmersdelight:cutting',
                ingredients: ingredientJson,
                tool: [
                    { tag: 'farmersdelight:tools/knives' }
                ],
                result: [
                    {
                        item: {
                            id: resultItem,
                            count: resultCount
                        }
                    }
                ]
            };

            event.custom(newRecipe).id('kubejs:fk_cutting/' + String(entry.getKey()).replace(/[\/:]/g, '_'));
            convertedCount++;
        } catch (e) {
            console.warn(`转换失败 ${entry.getKey()}: ${e}`);
        }
    }

    // console.log(`森罗物语菜板 → 农夫乐事砧板：成功 ${convertedCount} 个，跳过 ${skippedCount} 个`);

    //禁用原来菜板的配方
    event.remove({ type: 'kaleidoscope_cookery:chopping_board' });
    event.remove({ output: 'kaleidoscope_cookery:chopping_board' })
});
