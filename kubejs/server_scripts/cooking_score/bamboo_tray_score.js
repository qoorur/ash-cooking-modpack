// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery) + 桥接 mod ash_kaleidoscope_kitchen_wok
//   （提供 ash_bamboo_tray.cooked 事件）；depends on score_api.js
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/bamboo_tray_score.js
// 森罗物语竹扁（晾晒）评分系统（单槽完成事件驱动版）
// 依赖 score_api.js 提供的 ssXxx 函数
//
// ===== 触发方式 =====
//   监听桥接 mod 提供的 KubeJS 事件 ash_bamboo_tray.cooked。
//   该事件由 BambooTrayBlockEntityMixin 注入 BambooTrayBlockEntity#serverTick 的 RETURN，
//   在某格晾晒刚完成（completionStates[slot] 变为已完成、items[slot] 被替换为成品）时触发，
//   每格只触发一次。
//
// ===== 竹扁结构 =====
//   4 槽位，每格独立计时、独立完成；完成后成品原地保留在 items[slot]，
//   直到被取出（玩家右键 / 漏斗 / 管道 / 机械臂从下方抽取）。
//   写分发生在「刚完成」瞬间，因此之后无论何种取出方式，成品都带分。
//
// ===== 输入食材新鲜度 =====
//   完成时原食材已被替换成成品，无法反推；桥接层在【放料时】(onPutItem) 记录，
//   随方块实体 NBT 持久化，完成时通过 event.inputFreshness 带出（0~1；未知 -1）。
//   未知（-1）时按 100% 处理（与炒锅/汤锅/切菜板统一：无 spoil 视为满分）。
//
// ===== 评分组件 =====
//   组件1 ingredient_score：由 event.inputFreshness 换算（0~100 整数）
//   组件2 fuzzy_ratio     ：竹扁无配比 → 恒为空
//   组件3                 ：成品自身 spoiled:spoil_timer（display 实时算）
// ==============================================================

(function () {
    const DEBUG = true;
    function log(msg) { if (DEBUG) console.info(msg); }

    // 成品是否已写过分（防重复触发）
    function stackHasScore(stack) {
        try {
            let cd = stack.getComponents().get('minecraft:custom_data');
            if (!cd) return false;
            let n = ssReadCustomDataNumber(stack, 'ingredient_score');
            return n !== null;
        } catch (e) {}
        return false;
    }

    ash_bamboo_tray.cooked(function (event) {
        try {
            let lv = event.level;
            let tray = event.tray;
            let result = event.result;
            let freshness = event.inputFreshness;

            if (!lv || !tray || !result) return;
            if (lv.clientSide) return;
            if (result.isEmpty()) return;
            if (stackHasScore(result)) return;

            // 组件1：原料新鲜度换算（0~1 → 0~100）
            //   未知（-1/null）→ 按 100%（与炒锅/汤锅/切菜板统一：无 spoil 视为满分）
            let ingredientScore;
            if (freshness !== null && freshness !== undefined && freshness >= 0) {
                ingredientScore = Math.round(freshness * 100);
            } else {
                ingredientScore = 100;
            }

            // 组件2：竹扁无配比 → null
            try {
                ssApplyComponentsToItem(result, ingredientScore, null);
            } catch (e) {
                console.error('[SpoilScore] 竹扁算分失败: ' + e);
                return;
            }

            try { tray.setChanged(); } catch (e) {}
            try {
                let pos = tray.getBlockPos();
                let bs = lv.getBlockState(pos);
                lv.sendBlockUpdated(pos, bs, bs, 3);
            } catch (e) {}

            log('[SpoilScore] 竹扁 | 槽位 ' + event.slot + ' | 原料分: ' + ingredientScore);
        } catch (e) {
            console.error('[SpoilScore] 竹扁完成事件处理异常: ' + e);
        }
    });

    console.info('[SpoilScore] bamboo_tray_score.js 已加载（单槽完成事件驱动版 ash_bamboo_tray.cooked）');
})();