// ==============================================================
// DEPENDENCIES (required mods):
//   ExtraDelight (extradelight), Kaleidoscope Cookery (kaleidoscope_cookery)
// ==============================================================
// kubejs/server_scripts/extradelight_jam_to_flex.js
// 把 extradelight 的动态果酱配方手工转成森罗物语的 flex_stockpot

// ===== 判断模组是否安装 =====
if (!Platform.isLoaded('extradelight')) {
    console.info('[JamConversion] 未检测到 ExtraDelight，跳过果酱配方转换');
} else {
    console.info('[JamConversion] 检测到 ExtraDelight，开始转换果酱配方');

    ServerEvents.recipes(event => {

        // ===== 果酱配方定义 =====
        const JAM_RECIPES = [
            { ingredients: [{ item: 'minecraft:sweet_berries' }],          graphic: 'sweet_berries' },
            { ingredients: [{ tag: 'extradelight:processed/carrot' }],     graphic: 'carrot' },
            { ingredients: [{ item: 'minecraft:chorus_fruit' }],           graphic: 'chorus_fruit' },
            { ingredients: [{ item: 'minecraft:glow_berries' }],           graphic: 'glow_berries' },
            { ingredients: [{ item: 'minecraft:golden_apple' }],           graphic: 'golden_apple' },
            { ingredients: [{ tag: 'extradelight:processed/grapefruit' }], graphic: 'grapefruit' },
            { ingredients: [{ tag: 'extradelight:processed/lemon' }],      graphic: 'lemon' },
            { ingredients: [{ tag: 'extradelight:processed/lime' }],       graphic: 'lime' },
            { ingredients: [{ tag: 'extradelight:processed/melon' }],      graphic: 'melon' },
            { ingredients: [{ tag: 'c:mint' }, { tag: 'c:gelatin' }],      graphic: 'mint' },
            { ingredients: [{ tag: 'extradelight:processed/orange' }],     graphic: 'orange' },
            { ingredients: [{ tag: 'extradelight:processed/apple' }],      graphic: 'apple' }
        ];

        const SUGAR = { item: 'minecraft:sugar' };
        const CONTAINER = { item: 'minecraft:glass_bottle' };

        let successCount = 0;
        let skippedTagCount = 0;

        // ===== 辅助函数：解析原料为 itemId =====
        // item 直接取，tag 取 tag 内第一个物品
        function resolveItemId(ing) {
            if (ing.item) return ing.item;
            if (ing.tag) {
                try {
                    let stacks = Ingredient.of('#' + ing.tag).getItems();
                    if (stacks && stacks.length > 0) {
                        let s = stacks[0];
                        if (s && !s.isEmpty()) return String(s.getItem());
                    }
                } catch (e) {
                    // 兜底：尝试 itemIds
                    try {
                        let ids = Ingredient.of('#' + ing.tag).itemIds;
                        if (ids && ids.length > 0) return String(ids[0]);
                    } catch (e2) {
                        console.warn(`[JamConversion] 无法解析标签 #${ing.tag}: ${e2}`);
                    }
                }
            }
            return null;
        }

        // ===== 辅助函数：构建 itemstack_handler =====
        // slot 0-2：3 个原料（每个 count = 1）
        // slot 3-5：3 个糖（每个 count = 1）
        function buildItemStackHandler(ingredients) {
            let handler = [];

            // 取第一个原料作为代表（动态果酱通常只有一种原料）
            let mainIng = ingredients[0];
            let mainItemId = resolveItemId(mainIng);

            // slot 0-2：3 个原料，数量均为 1
            if (mainItemId) {
                for (let i = 0; i < 3; i++) {
                    handler.push({
                        item: { count: 1, id: mainItemId },
                        slot: i
                    });
                }
            }

            // slot 3-5：3 个糖，数量均为 1
            for (let i = 3; i < 6; i++) {
                handler.push({
                    item: { count: 1, id: 'minecraft:sugar' },
                    slot: i
                });
            }

            return handler;
        }

        // ===== 遍历所有果酱配方 =====
        JAM_RECIPES.forEach(jam => {

            // 检查所有 tag 是否非空
            let tagsOk = true;
            for (let ing of jam.ingredients) {
                if (ing.tag) {
                    try {
                        let test = Ingredient.of('#' + ing.tag);
                        if (!test || test.isEmpty()) {
                            console.info(`[JamConversion] 跳过 ${jam.graphic}：标签 #${ing.tag} 为空`);
                            tagsOk = false;
                            break;
                        }
                    } catch (e) {
                        console.info(`[JamConversion] 跳过 ${jam.graphic}：标签 #${ing.tag} 不存在`);
                        tagsOk = false;
                        break;
                    }
                }
            }
            if (!tagsOk) {
                skippedTagCount++;
                return;
            }

            // 构建 ingredients：原料 + 糖，去重
            let finalIngredients = [];
            let seenKeys = new Set();

            function addIngredient(ing) {
                let key = ing.item ? ing.item : ('#' + ing.tag);
                if (seenKeys.has(key)) return;
                seenKeys.add(key);
                finalIngredients.push(ing);
            }

            jam.ingredients.forEach(addIngredient);
            addIngredient(SUGAR);

            // 构建配方
            let recipe = {
                type: 'kaleidoscope_cookery:flex_stockpot',
                ingredients: finalIngredients,
                carrier: CONTAINER,
                result: {
                    id: 'extradelight:dynamic_jam',
                    count: 1,
                    components: {
                        'extradelight:dynamic_food': {
                            graphics: [jam.graphic]
                        },
                        'extradelight:itemstack_handler': buildItemStackHandler(jam.ingredients)
                    }
                }
            };

            // 注册配方
            let recipeId = 'kubejs:jam_to_flex/' + jam.graphic;
            try {
                event.custom(recipe).id(recipeId);
                successCount++;
                console.info(`[JamConversion] ✅ 转换成功: ${jam.graphic} -> ${recipeId}`);
            } catch (e) {
                console.warn(`[JamConversion] ❌ 转换失败 ${jam.graphic}: ${e}`);
            }
        });

        console.info(`[JamConversion] 完成：成功 ${successCount}，跳过(空标签) ${skippedTagCount}`);
    });

    // ===== 禁用原 extradelight 的动态果酱配方 =====
    // 让这些果酱只能通过森罗物语汤锅制作
    ServerEvents.recipes(event => {
        event.remove({ type: 'extradelight:dynamic_jam' });
        console.info('[JamConversion] 已禁用原 extradelight:dynamic_jam 配方');
    });
}