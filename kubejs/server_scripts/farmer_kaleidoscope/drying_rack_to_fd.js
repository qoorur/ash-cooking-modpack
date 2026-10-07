// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery)
//   ExtraDelight (extradelight)
//   Youkaishomecoming (youkaishomecoming)
// ==============================================================
// priority: 0
// kubejs/server_scripts/farmer_kaleidoscope/drying_rack_to_fd.js
//
// 晾晒（晾干）统一到【森罗物语竹扁 bamboo_tray】：
//   1) 移除现有的 kaleidoscope_cookery:bamboo_tray 类型配方（旧晾晒配方）
//   2) 把 ExtraDelight 晾干架（extradelight:drying_rack）配方转成 bamboo_tray
//      时间：原始 1000 → 5000
//   3) 把 Youkaishomecoming 晾干架（youkaishomecoming:drying_rack）配方转成 bamboo_tray
//      时间：原时间 >= 5000 保持原值，否则 ×5（200→1000，18000→18000）
//   4) 移除 youkai 与 extra 的【晾干架方块合成配方】
//      - youkaishomecoming:drying_rack（含石切）
//      - extradelight:drying_rack_item（extra 的晾干架【物品】id）
//      （森罗竹扁方块本身合成配方【保留】，以便玩家能造出竹扁）
//
// 结构对照：
//   kaleidoscope_cookery:bamboo_tray : { duration, ingredient{item|tag}, result{count,id}, subtype:"drying"|"wetting" }
//   extradelight:drying_rack        : { cookingtime, experience, ingredient{item|tag}, result{count,id} }
//   youkaishomecoming:drying_rack   : { category, cookingtime, experience, ingredient{item|tag}, result{count,id} }
// ==============================================================

const DRY_DEBUG = false;
function dryLog(msg) { if (DRY_DEBUG) console.info(msg); }

// ======================= 测试用：时间加速系数 =======================
// 仅测试期间使用：把最终 duration 再 ÷ 此值（加快晾晒，便于验证评分）。
//   10 = 时间缩小 10 倍（测试）；  1 = 正常（还原，务必改回 1）
const TEST_TIME_DIVISOR = 10;
function applyTestSpeedup(dur) {
    if (!TEST_TIME_DIVISOR || TEST_TIME_DIVISOR <= 1) return dur;
    let d = Math.max(1, Math.floor(dur / TEST_TIME_DIVISOR));
    return d;
}
// ====================================================================

ServerEvents.recipes(event => {
    let map = event.originalRecipes;
    if (!map) return;

    let stats = {
        removedTray: 0,     // 移除的旧竹扁配方
        fromFd: 0,          // extradelight → bamboo_tray
        fromYh: 0,          // youkai → bamboo_tray
        skipNoResult: 0,
        skipNoIng: 0,
        fail: 0
    };

    // 需要移除「输出这些物品」的合成配方（晾干架方块本身）
    const CRAFT_OUTPUTS_TO_REMOVE = [
        'youkaishomecoming:drying_rack',      // 妖怪晾干架（物品/方块同名，含石切）
        'extradelight:drying_rack_item'       // ExtraDelight 晾干架物品
    ];
    let removedCraft = 0;

    // ===== 工具 =====
    function readIngredient(jo) {
        // {item:...} 或 {tag:...}
        if (!jo || !jo.isJsonObject()) return null;
        let o = jo.getAsJsonObject();
        if (o.has("item")) {
            let s = o.get("item").getAsString();
            if (s && s.trim()) return { item: s };
        } else if (o.has("tag")) {
            let s = o.get("tag").getAsString();
            if (s && s.trim()) return { tag: s };
        }
        return null;
    }

    function readResult(jo) {
        if (!jo || !jo.isJsonObject()) return null;
        let o = jo.getAsJsonObject();
        if (!o.has("id")) return null;
        let id = o.get("id").getAsString();
        let count = 1;
        if (o.has("count")) { let c = o.get("count").getAsInt(); if (c > 0) count = c; }
        return { id: id, count: count };
    }

    // ===== 扫描 =====
    let trayToRemove = [];  // 旧竹扁配方 id
    let fdToConvert = [];   // extradelight 待转换
    let yhToConvert = [];   // youkai 待转换

    let it = map.entrySet().iterator();
    while (it.hasNext()) {
        let entry = it.next();
        let id = String(entry.getKey());
        let recipe = entry.getValue();
        let type = String(recipe.getType());

        // 1) 旧竹扁配方：收集 id 逐个移除
        if (type === 'kaleidoscope_cookery:bamboo_tray') {
            trayToRemove.push(id);
            continue;
        }

        // 2) extradelight → bamboo_tray
        if (type === 'extradelight:drying_rack') {
            try {
                let rj = recipe.json;
                if (!rj) { stats.skipNoResult++; continue; }
                let ing = readIngredient(rj.has("ingredient") ? rj.get("ingredient") : null);
                let res = readResult(rj.has("result") ? rj.get("result") : null);
                if (!ing) { stats.skipNoIng++; console.log(`[跳过] ${id} - 原料无效`); continue; }
                if (!res) { stats.skipNoResult++; console.log(`[跳过] ${id} - 结果为空`); continue; }
                let ct = rj.has("cookingtime") ? rj.get("cookingtime").getAsInt() : 1000;
                fdToConvert.push({ id: id, ingredient: ing, result: res, cookingtime: ct });
            } catch (e) {
                stats.fail++;
                console.warn(`[错误] ${id} - ${e}`);
            }
            continue;
        }

        // 3) youkai → bamboo_tray
        if (type === 'youkaishomecoming:drying_rack') {
            try {
                let rj = recipe.json;
                if (!rj) { stats.skipNoResult++; continue; }
                let ing = readIngredient(rj.has("ingredient") ? rj.get("ingredient") : null);
                let res = readResult(rj.has("result") ? rj.get("result") : null);
                if (!ing) { stats.skipNoIng++; console.log(`[跳过] ${id} - 原料无效`); continue; }
                if (!res) { stats.skipNoResult++; console.log(`[跳过] ${id} - 结果为空`); continue; }
                let ct = rj.has("cookingtime") ? rj.get("cookingtime").getAsInt() : 200;
                yhToConvert.push({ id: id, ingredient: ing, result: res, cookingtime: ct });
            } catch (e) {
                stats.fail++;
                console.warn(`[错误] ${id} - ${e}`);
            }
            continue;
        }
    }

    // ===== 1) 移除旧竹扁配方（逐 id）=====
    trayToRemove.forEach(function (tid) {
        try {
            event.remove({ id: tid });
            stats.removedTray++;
            dryLog(`[Drying] 移除旧竹扁配方: ${tid}`);
        } catch (e) {
            stats.fail++;
            console.warn(`[失败] 移除竹扁 ${tid} - ${e}`);
        }
    });

    // ===== 2) extradelight → bamboo_tray（时间 1000 → 5000）=====
    fdToConvert.forEach(function (c) {
        try {
            let newId = c.id + '_to_tray';
            let newDur = applyTestSpeedup(c.cookingtime * 5);
            event.remove({ id: c.id });
            let newR = {
                type: 'kaleidoscope_cookery:bamboo_tray',
                duration: newDur,
                subtype: 'drying',
                ingredient: c.ingredient,
                result: { count: c.result.count, id: c.result.id }
            };
            event.custom(newR).id(newId);
            stats.fromFd++;
            console.log(`[转换] ${c.id} → bamboo_tray (id: ${newId}): ${c.result.id} | 时间 ${c.cookingtime} → ${newDur}`);
        } catch (e) {
            stats.fail++;
            console.warn(`[失败] ${c.id} - ${e}`);
        }
    });

    // ===== 3) youkai → bamboo_tray（时间 >=5000 保持，否则 ×5）=====
    yhToConvert.forEach(function (c) {
        try {
            let newId = c.id + '_to_tray';
            let newDur = applyTestSpeedup((c.cookingtime >= 5000) ? c.cookingtime : c.cookingtime * 5);
            event.remove({ id: c.id });
            let newR = {
                type: 'kaleidoscope_cookery:bamboo_tray',
                duration: newDur,
                subtype: 'drying',
                ingredient: c.ingredient,
                result: { count: c.result.count, id: c.result.id }
            };
            event.custom(newR).id(newId);
            stats.fromYh++;
            console.log(`[转换] ${c.id} → bamboo_tray (id: ${newId}): ${c.result.id} | 时间 ${c.cookingtime} → ${newDur}`);
        } catch (e) {
            stats.fail++;
            console.warn(`[失败] ${c.id} - ${e}`);
        }
    });

    // ===== 4) 移除 youkai / extra 的晾干架方块合成配方（按 output）=====
    //   （森罗竹扁方块合成配方保留）
    CRAFT_OUTPUTS_TO_REMOVE.forEach(function (outId) {
        try {
            event.remove({ output: outId });
            removedCraft++;
            dryLog(`[Drying] 移除晾干架合成配方(输出): ${outId}`);
        } catch (e) {
            stats.fail++;
            console.warn(`[失败] 移除合成配方 ${outId} - ${e}`);
        }
    });

    console.log(`晾晒处理完成：移除旧竹扁 ${stats.removedTray} | extradelight→竹扁 ${stats.fromFd} | youkai→竹扁 ${stats.fromYh} | 跳过(无结果) ${stats.skipNoResult} | 跳过(无原料) ${stats.skipNoIng} | 失败 ${stats.fail} | 移除晾干架合成 ${removedCraft}`);
});