// ==============================================================
// DEPENDENCIES (required mods):
//   (none - pure KubeJS)
// ==============================================================
// priority: 100
// kubejs/startup_scripts/cooking_score/food_level.js
// =====================================================================
// 【食物 Level 数据】startup 阶段读入 food_level_data.json，暴露全局查询。
//   - 数据源：kubejs/data/custom_config/food/type/food_level_data.json
//     （由 food_level2.py 生成：{ "mod:item": level, ... }）
//   - 用 JsonIO.read 读取（路径从游戏根目录起算）
//   - 放在 startup 的好处：server / client 脚本都能用同一份数据
//   - 暴露：
//       global.FOOD_LEVEL_MAP        : { "mod:item": level }  原始映射
//       global.getFoodLevel(itemId)  : 返回 level(number) 或 null
//       global.getFoodLevelOf(stack) : 传 ItemStack，返回 level 或 null
//       global.hasFoodLevel(itemId)  : 是否有 level 记录
// =====================================================================

global.FOOD_LEVEL_MAP = {};

(function () {
    var path = 'kubejs/data/custom_config/food/type/food_level_data.json';
    var data = null;
    try {
        data = JsonIO.read(path);
    } catch (e) {
        console.warn('[FoodLevel] 读取失败: ' + path + ' : ' + e);
    }
    if (!data) {
        console.warn('[FoodLevel] 数据文件不存在或为空: ' + path);
        return;
    }

    // JsonIO 读出来可能是 JS 对象，逐个拷贝到 global 映射
    var count = 0;
    try {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = data[k];
            // JsonIO 数值可能是 JsonPrimitive，取数字
            var num = Number(v);
            if (isNaN(num) && v && typeof v.asDouble === 'function') {
                num = v.asDouble();
            }
            if (!isNaN(num)) {
                global.FOOD_LEVEL_MAP[k] = num;
                count++;
            }
        }
    } catch (e) {
        console.warn('[FoodLevel] 解析数据出错: ' + e);
    }

    console.info('[FoodLevel] 已载入 ' + count + ' 条食物 level 数据');
})();

// 按 itemId 取 level；无记录返回 null
global.getFoodLevel = function (itemId) {
    if (!itemId) return null;
    var id = (typeof itemId === 'string') ? itemId : ('' + itemId);
    // 去掉可能的 "x count" 后缀
    if (id.indexOf(' ') >= 0) id = id.split(' ')[0];
    var v = global.FOOD_LEVEL_MAP[id];
    return (v === undefined) ? null : v;
};

// 传 ItemStack，返回 level 或 null
global.getFoodLevelOf = function (stack) {
    if (!stack || stack.isEmpty()) return null;
    var id = null;
    try { id = '' + stack.id; } catch (e) {}
    if (!id) {
        try { id = '' + stack.getItem(); } catch (e) {}
    }
    return global.getFoodLevel(id);
};

// 是否有 level 记录
global.hasFoodLevel = function (itemId) {
    return global.getFoodLevel(itemId) !== null;
};

console.info('[FoodLevel] 食物 level 查询 API 已注册');