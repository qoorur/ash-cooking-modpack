// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery) + 桥接 mod ash_kaleidoscope_kitchen_wok
//   （提供 ash_steamer.cooked 事件）；depends on score_api.js
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/steamer_score.js
// 森罗物语蒸笼评分系统（单格完成事件驱动版）
// 依赖 score_api.js 提供的 ssXxx 函数
//
// ===== 触发方式（与炒锅/汤锅对齐）=====
//   监听桥接 mod 提供的 KubeJS 事件 ash_steamer.cooked。
//   该事件由 SteamerBlockEntityMixin 注入 SteamerBlockEntity#cookingTick 的 RETURN，
//   在某格食材刚蒸熟（cookingTime[i] 变为 -1、items[i] 被替换为成品）那一刻触发，
//   每格只触发一次。
//
// ===== 蒸笼与炒锅/汤锅的差异 =====
//   蒸笼是多槽位结构（8 格，半高 4 格），每格独立计时、独立完成；
//   没有单一 result / status，成品直接在 items 数组里。
//
//   输入食材新鲜度：蒸笼完成时原食材已被替换成成品，无法从成品反推。
//   因此桥接层在【放料时】记录每个槽位食材的 spoil 新鲜度（随方块实体 NBT 持久化），
//   完成时通过事件字段 event.inputFreshness 带出（0~1；未知为 -1）。
//   未知（-1）时按 100% 处理（与炒锅/汤锅/切菜板统一：无 spoil 视为满分）。
//
// ===== 评分组件（蒸笼）=====
//   组件1 ingredient_score：由 event.inputFreshness 换算（0~100 整数）
//   组件2 fuzzy_ratio     ：蒸笼无配比/品质 → 恒为空（不写）
//   组件3                 ：成品自身 spoiled:spoil_timer（spoiled 模组维护，display 实时算）
// ==============================================================

(function () {
    const DEBUG = false;   // 调试时改 true
    function log(msg) { if (DEBUG) console.info(msg); }

    // ===== 工具：成品是否已写过分（防重复触发）=====
    function stackHasScore(stack) {
        try {
            let cd = stack.getComponents().get('minecraft:custom_data');
            if (!cd) return false;
            let n = ssReadCustomDataNumber(stack, 'ingredient_score');
            return n !== null;
        } catch (e) {}
        return false;
    }

    // =====================================================================
    // 入口：蒸笼「单格完成」事件（由桥接 mod 触发）
    //
    // 事件字段（level / pos / steamer / slot / result / inputFreshness）会被
    // KubeJS 以隐式变量注入回调作用域。回调内不要声明同名 const/let，
    // 这里统一从 event 对象读取，避免 "redeclaration" 报错。
    // =====================================================================
    ash_steamer.cooked(function (event) {
        try {
            let lv = event.level;
            let steamer = event.steamer;
            let result = event.result;
            let freshness = event.inputFreshness;

            if (!lv || !steamer || !result) return;
            if (lv.clientSide) return;
            if (result.isEmpty()) return;

            // 已写过分则跳过（重载 / 重复触发兜底）
            if (stackHasScore(result)) return;

            // 组件1：原料新鲜度换算（0~1 → 0~100）
            //   未知（-1/null）→ 按 100%（与炒锅/汤锅/切菜板统一：无 spoil 视为满分）
            let ingredientScore;
            if (freshness !== null && freshness !== undefined && freshness >= 0) {
                ingredientScore = Math.round(freshness * 100);
            } else {
                ingredientScore = 100;
            }

            // 组件2：蒸笼无配比 → null
            // 写分（只写组件1；组件2 不写）
            try {
                ssApplyComponentsToItem(result, ingredientScore, null);
            } catch (e) {
                console.error('[SpoilScore] 蒸笼算分失败: ' + e);
                return;
            }

            // 回写并同步
            try { steamer.setChanged(); } catch (e) {}
            try {
                let pos = steamer.getBlockPos();
                let bs = lv.getBlockState(pos);
                lv.sendBlockUpdated(pos, bs, bs, 3);
            } catch (e) {}

            log('[SpoilScore] 蒸笼 | 槽位 ' + event.slot + ' | 原料分: ' + ingredientScore);
        } catch (e) {
            console.error('[SpoilScore] 蒸笼完成事件处理异常: ' + e);
        }
    });

    console.info('[SpoilScore] steamer_score.js 已加载（单格完成事件驱动版 ash_steamer.cooked）');
})();