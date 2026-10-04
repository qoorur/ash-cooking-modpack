// ==============================================================
// DEPENDENCIES (required mods):
//   Spoiled (spoiled), Kaleidoscope Cookery (kaleidoscope_cookery)
// ==============================================================
// kubejs/server_scripts/spoil/merge_food.js
// 1.21.1 (KubeJS 6) 兼容版
// 合并规则：
//   1. 只有带 kubejs:spoiled 标签的物品才处理
//   2. score（custom_data.score，可空）必须一致
//   3. quality（kaleidoscope_cookery:quality，可空）必须一致
//   4. spoil 值取"最接近腐烂"的那个
//   5. 合并成功/失败都有聊天栏提示
// 说明：同类物品中，只要存在 score / quality 与主手不一致的，就拒绝合并

// ===== 读取 custom_data 里的任意数值字段（新体系：ingredient_score / fuzzy_ratio）=====
function mfReadNum(stack, key) {
    if (!stack || stack.isEmpty()) return null;
    try {
        var cd = stack.getComponents().get('minecraft:custom_data');
        if (!cd) return null;
        if (typeof cd.copyTag === 'function') {
            var tag = cd.copyTag();
            if (tag && typeof tag.contains === 'function' && tag.contains(key)) {
                var n = tag.getDouble(key);
                if (!isNaN(n)) return n;
            }
        }
        try { if (typeof cd.getDouble === 'function' && cd.contains && cd.contains(key)) { var v = cd.getDouble(key); if (!isNaN(v)) return v; } } catch (e) {}
        var str = '' + cd;
        var m = str.match(new RegExp(key + ':\\s*(-?[\\d.]+)'));
        if (m) { var n2 = parseFloat(m[1]); if (!isNaN(n2)) return n2; }
    } catch (e) {}
    return null;
}

// ===== 读取 score =====
// 组件对象优先，正则仅作兜底
function mfReadScore(stack) {
    if (!stack || stack.isEmpty()) return null;
    try {
        var cd = stack.getComponents().get('minecraft:custom_data');
        if (!cd) return null;

        // 主路径：copyTag() -> CompoundTag.getDouble
        if (typeof cd.copyTag === 'function') {
            var tag = cd.copyTag();
            if (tag && typeof tag.contains === 'function' && tag.contains('score')) {
                var n = tag.getDouble('score');
                if (!isNaN(n)) return n;
            }
        }
        // 次路径：组件对象直接暴露 score 字段/方法
        try { if (cd.score !== undefined) { var v = Number(cd.score); if (!isNaN(v)) return v; } } catch (e) {}
        try { if (typeof cd.getDouble === 'function' && cd.contains && cd.contains('score')) { var v2 = cd.getDouble('score'); if (!isNaN(v2)) return v2; } } catch (e) {}

        // 最后兜底：字符串正则
        var str = '' + cd;
        var m = str.match(/score:\s*(-?[\d.]+)/);
        if (m) {
            var n2 = parseFloat(m[1]);
            if (!isNaN(n2)) return n2;
        }
    } catch (e) {}
    return null;
}

// ===== 读取 quality =====
function mfReadQuality(stack) {
    if (!stack || stack.isEmpty()) return null;
    try {
        var q = stack.getComponents().get('kaleidoscope_cookery:quality');
        if (!q) return null;
        if (typeof q === 'string') return q;
        try { if (q.value !== undefined) return '' + q.value; } catch (e) {}
        try { if (typeof q.get === 'function') return '' + q.get(); } catch (e) {}
        var str = '' + q;
        var m = str.match(/quality[=:]"?([a-zA-Z_]+)"?/);
        if (m) return m[1];
        return str;
    } catch (e) {}
    return null;
}

// ===== 读取 spoil_timer (SpoilTimer record) =====
function mfReadSpoil(stack) {
    if (!stack || stack.isEmpty()) return null;
    try {
        var spo = stack.getComponents().get('spoiled:spoil_timer');
        if (!spo) return null;

        var timer = null, maxTime = null;

        // 主路径：record 访问器方法
        try { if (typeof spo.timer === 'function') timer = Number(spo.timer()); } catch (e) {}
        try { if (typeof spo.maxTime === 'function') maxTime = Number(spo.maxTime()); } catch (e) {}
        // 次路径：字段访问
        if (timer === null || isNaN(timer)) { try { timer = Number(spo.timer); } catch (e) {} }
        if (maxTime === null || isNaN(maxTime)) { try { maxTime = Number(spo.maxTime); } catch (e) {} }
        // 兜底：字符串正则
        if (timer === null || isNaN(timer) || maxTime === null || isNaN(maxTime)) {
            var str = '' + spo;
            var mt = str.match(/timer:\s*(\d+)/);
            var mm = str.match(/maxTime:\s*(\d+)/);
            if (mt) timer = parseInt(mt[1], 10);
            if (mm) maxTime = parseInt(mm[1], 10);
        }
        if (timer === null || isNaN(timer) || maxTime === null || isNaN(maxTime)) return null;
        return { timer: timer, maxTime: maxTime };
    } catch (e) {}
    return null;
}

// ===== 判断两个值是否"一致"（容忍两边都是 null） =====
function mfIsSameVal(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return a === b;
}

// ===== 主逻辑 =====
ItemEvents.firstLeftClicked(function (event) {

    // 只处理带 kubejs:spoiled 标签的物品
    if (!event.getItem() || !event.getItem().hasTag('kubejs:spoiled')) return;

    var player = event.player;
    if (!player) return;
    if (player.level.clientSide) return;

    var mainStack = event.getItem();
    if (mainStack.isEmpty()) return;

    var mainStackSize = mainStack.maxStackSize;
    // 不可堆叠物品无法合并
    if (mainStackSize <= 1) return;

    var mainId = mainStack.getId();
    var mainScore = mfReadNum(mainStack, 'ingredient_score');
    var mainFuzzy = mfReadNum(mainStack, 'fuzzy_ratio');
    var mainQuality = mfReadQuality(mainStack);

    // 主手槽位的 spoil 作为初始值
    var maxSpoil = -1;
    var spoilMaxTime = null;
    var mainSpoil = mfReadSpoil(mainStack);
    if (mainSpoil) {
        maxSpoil = mainSpoil.timer;
        spoilMaxTime = mainSpoil.maxTime;
    }

    var selectedSlot = player.inventory.selected;

    // ===== 第一步：扫描检查是否有 score / quality 冲突 =====
    for (var i = 0; i <= 35; i++) {
        if (i === selectedSlot) continue;

        var s = player.inventory.getItem(i);
        if (!s || s.isEmpty()) continue;
        if (s.getId() !== mainId) continue;

        var sScore = mfReadNum(s, 'ingredient_score');
        var sFuzzy = mfReadNum(s, 'fuzzy_ratio');
        var sQuality = mfReadQuality(s);

        if (!mfIsSameVal(sScore, mainScore) || !mfIsSameVal(sFuzzy, mainFuzzy) || !mfIsSameVal(sQuality, mainQuality)) {
            player.tell('§c[合并失败] §f' + mainStack.getHoverName() + ' §c存在评分或品质不一致的同类食物');
            return;
        }
    }

    // ===== 第二步：正式合并 =====
    var num = mainStack.count;   // 当前累计数量
    var mergedCount = 0;         // 实际被合并进主手的数量

    for (var j = 0; j <= 35; j++) {
        if (j === selectedSlot) continue;

        var item = player.inventory.getItem(j);
        if (!item || item.isEmpty()) continue;
        if (item.getId() !== mainId) continue;

        // 更新最接近腐烂的 spoil 值
        var spo2 = mfReadSpoil(item);
        if (spo2 && spo2.timer > maxSpoil) {
            maxSpoil = spo2.timer;
            spoilMaxTime = spo2.maxTime;
        }

        // 用主手物品的上限计算剩余空间
        var room = mainStackSize - num;
        if (room <= 0) break;

        var before = item.count;
        var take = Math.min(before, room);
        num += take;
        mergedCount += take;
        item.setCount(before - take);

        if (num >= mainStackSize) break;
    }

    // 应用数量到主手
    mainStack.setCount(num);

    // 写回 spoil（确保 timer 不超过 maxTime，避免下一 tick 直接被判定腐烂）
    if (maxSpoil >= 0 && spoilMaxTime !== null && spoilMaxTime > 0) {
        if (maxSpoil > spoilMaxTime) maxSpoil = spoilMaxTime;
        mainStack.set('spoiled:spoil_timer', {
            timer: maxSpoil,
            maxTime: spoilMaxTime
        });
    }

    // ===== 第三步：提示 =====
    if (mergedCount > 0) {
        player.tell('§a[合并成功] §f合并了 §a' + mergedCount + ' §f个同类食物，当前数量 §a' + num);
    }
});