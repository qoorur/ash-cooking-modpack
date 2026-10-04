// ==============================================================
// DEPENDENCIES (required mods):
//   MrCrayfish's Furniture Refurbished (refurbished_furniture), Concoction (concoction)
// ==============================================================
// priority: 1
// kubejs/server_scripts/farmer_kaleidoscope/rice_crafting_to_combine.js
// =====================================================================
// 【配方转换】工作台里「用米饭合成的生食寿司/卷」→ 切菜板拼装(combining)
// ---------------------------------------------------------------------
// 规则（用户确认）：
//   - 判定"米饭"：配方 JSON 含 cooked_rice（farmersdelight/kaleidoscope_cookery/
//     concoction:cooked_rice 等，oei 已统一视为农夫乐事米饭）
//   - 判定"生的"：产物 id 含 roll / sushi / nigiri / maki / gunkan（子串匹配）
//   - 排除：katsudon(炸猪排饭) 等熟食不转
//   - 熟食（riceball/furikake_rice 等）产物名不含上述关键字，自然不转
//   - 目标类型：refurbished_furniture:cutting_board_combining
//   - shaped 配方只取"用了哪些料"（丢弃图案，支持重复字符计数）
//   - 米饭去重 + 置顶：多份米饭只保留 1 份，放在配料第一位
//   - 配料数 > 5 跳过（切菜板上限），且保留原配方（避免死区）
//   - 产出数量统一为 2（一份米饭 -> 2 份产物）
//   - 转换后删除原配方；遍历 originalRecipes 运行时转换，自动适配所有 mod
// =====================================================================

(function () {
    const DEBUG = true;
    function log(m) { if (DEBUG) console.info('[RICE2CB] ' + m); }

    const COMBINING = 'refurbished_furniture:cutting_board_combining';

    // 米饭判定关键字（小写包含即视为"用米"）
    const RICE_KEYS = ['cooked_rice', 'foods/cooked_rice', 'cuisine/cooked_rice'];

    // 生食寿司/卷 产物后缀
    const RAW_SUFFIXES = ['_roll', '_sushi', '_nigiri', '_maki', '_gunkan'];
    // 明确排除（熟食，即使名字像也不转）
    const EXCLUDE_RESULT = ['katsudon'];

    function hasRice(str) {
        let s = String(str).toLowerCase();
        for (let i = 0; i < RICE_KEYS.length; i++) if (s.indexOf(RICE_KEYS[i]) >= 0) return true;
        return false;
    }

    // 产物名"包含"这些关键字即视为生食寿司/卷（含 rice_roll_medley_block 等）
    const RAW_KEYS = ['roll', 'sushi', 'nigiri', 'maki', 'gunkan'];
    function isRawSushi(resultId) {
        if (!resultId) return false;
        let r = String(resultId).toLowerCase();
        for (let i = 0; i < EXCLUDE_RESULT.length; i++) if (r.indexOf(EXCLUDE_RESULT[i]) >= 0) return false;
        for (let i = 0; i < RAW_KEYS.length; i++) if (r.indexOf(RAW_KEYS[i]) >= 0) return true;
        return false;
    }

    // 把 ingredient 的可选数组/对象规整成单个 clean 对象
    function cleanIngredient(je) {
        if (!je || !je.isJsonObject()) return null;
        let o = je.getAsJsonObject();
        if (o.has('item')) {
            let s = o.get('item').getAsString();
            if (s && s.trim()) return { item: s };
        } else if (o.has('tag')) {
            let s = o.get('tag').getAsString();
            if (s && s.trim()) return { tag: s };
        }
        return null;
    }

    // 从 shaped 的 key 提取 ingredient 列表；从 shapeless 的 ingredients 提取
    function extractIngredients(recipeJson) {
        let res = [];
        if (recipeJson.has('ingredients')) {
            // shapeless
            let arr = recipeJson.get('ingredients').getAsJsonArray();
            for (let i = 0; i < arr.size(); i++) {
                let el = arr.get(i);
                if (el.isJsonArray()) {
                    // 多选一，取第一个
                    let sub = el.getAsJsonArray();
                    if (sub.size() > 0) {
                        let c = cleanIngredient(sub.get(0));
                        if (c) res.push(c);
                    }
                } else {
                    let c = cleanIngredient(el);
                    if (c) res.push(c);
                }
            }
        } else if (recipeJson.has('key')) {
            // shaped: 用 pattern 里出现的字符顺序取料
            let keyObj = recipeJson.get('key').getAsJsonObject();
            let used = {};
            if (recipeJson.has('pattern')) {
                let pat = recipeJson.get('pattern').getAsJsonArray();
                for (let i = 0; i < pat.size(); i++) {
                    let row = pat.get(i).getAsString();
                    for (let j = 0; j < row.length; j++) {
                        let ch = row.charAt(j);
                        if (ch === ' ') continue;
                        used[ch] = (used[ch] || 0) + 1;
                    }
                }
            }
            let keys = keyObj.keySet().iterator();
            while (keys.hasNext()) {
                let k = keys.next();
                let cnt = used[k] || 1;
                let c = cleanIngredient(keyObj.get(k));
                if (c) for (let m = 0; m < cnt; m++) res.push(c);
            }
        }
        return res;
    }

    ServerEvents.recipes(event => {
        let map = event.originalRecipes;
        if (!map) { log('无 originalRecipes，跳过'); return; }

        let it = map.entrySet().iterator();
        let converted = 0, scanned = 0;
        let toRemove = [];

        while (it.hasNext()) {
            let e = it.next();
            let id = String(e.getKey());
            let recipe = e.getValue();
            let type = String(recipe.getType());
            if (type !== 'minecraft:crafting_shapeless' && type !== 'minecraft:crafting_shaped') continue;

            let rj = recipe.json;
            if (!rj) continue;

            // 1) 产物是不是生食寿司/卷
            let resultItem = null, resultCount = 1;
            try {
                let rs = recipe.getOriginalRecipeResult();
                if (rs && !rs.isEmpty()) {
                    resultItem = String(rs.getItem());
                    resultCount = rs.getCount();
                }
            } catch (err) {}
            if (!resultItem) continue;
            if (!isRawSushi(resultItem)) continue;

            // 2) 是否含米饭
            if (!hasRice(String(rj))) continue;

            scanned++;

            // 3) 提取配料
            let ing = extractIngredients(rj);
            if (ing.length === 0) { log('无配料跳过: ' + id); continue; }

            // 3.5) 米饭去重 + 挪到第一个：多份米饭只保留一份
            let riceList = [];
            let others = [];
            for (let k = 0; k < ing.length; k++) {
                let s = String(ing[k].item || ing[k].tag || '').toLowerCase();
                if (s.indexOf('cooked_rice') >= 0) riceList.push(ing[k]);
                else others.push(ing[k]);
            }
            if (riceList.length > 0) {
                ing = [riceList[0]].concat(others); // 一份米饭放最前 + 其余配料
            }

            // 3.6) 切菜板 combining 上限 5：超限则跳过转换，且保留原配方（不删除 -> 无死区）
            if (ing.length > 5) {
                log('超5跳过(保留原配方): ' + id + ' = ' + ing.length + ' 项');
                continue;
            }

            // 3.7) 平衡产出数量：1 米饭 -> 含 sushi 出 2，含 roll 出 1（其余保持原值，如方块）
            let oldCount = resultCount;
            resultCount = 2; // 统一：一份米饭 -> 2 份产物
            if (resultCount !== oldCount) log('  数量调整: ' + resultItem + ' ' + oldCount + ' -> ' + resultCount);

            // 切菜板 combining 上限保护（暂打印，不拦截）

            event.custom({
                type: COMBINING,
                ingredients: ing,
                result: { id: resultItem, count: resultCount }
            }).id('refurbished_furniture:combining/rice_' + id.replace(/[:/]/g, '_'));

            toRemove.push(id);
            converted++;
            log('转换: ' + id + ' -> ' + resultItem + ' x' + resultCount + ' | 配料数=' + ing.length);
        }

        // 删除原配方
        for (let i = 0; i < toRemove.length; i++) event.remove({ id: toRemove[i] });

        log('完成：扫描到 ' + scanned + ' 个生食寿司/卷，转换 ' + converted + ' 个，删除原配方 ' + toRemove.length + ' 个');
    });

    console.info('[RICE2CB] ========== 米饭生食寿司 → 切菜板 模块已加载 ==========');
})();






