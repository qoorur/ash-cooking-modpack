// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery) + 桥接 mod ash_kaleidoscope_kitchen_wok
//   （提供 ash_stockpot.cooked 事件）；depends on score_api.js
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/stockpot_score.js
// 森罗物语汤锅（煮锅）评分系统（完成事件驱动版）
// 依赖 score_api.js 提供的 ssXxx 函数
//
// ===== 触发方式（与炒锅 wok_score.js 对齐）=====
//   监听桥接 mod 提供的 KubeJS 事件 ash_stockpot.cooked。
//   该事件由 StockpotBlockEntityMixin 注入 StockpotBlockEntity#tick，
//   在「烹饪完成」那一刻（status=3）、且 inputs.clear() 之前触发。
//
//   为何要「在 inputs 清空之前」触发：
//     汤锅完成时方块实体原本会立刻清空食材（inputs）。评分需要读
//     Inputs.Items 里每种食材的新鲜度（spoiled:spoil_timer），
//     因此桥接层把事件放在 clear 之前，保证结算时食材还在。
//
//   此刻 result 已就绪，可直接算分并写入成品；与后续取出方式无关
//   （玩家右键 / 机械臂 / 女仆 / 管道取出，拿到的都是已带分的成品）。
// ==============================================================

(function () {
    const DEBUG = false;   // 调试时改 true
    function log(msg) { if (DEBUG) console.info(msg); }

    // ===== NBT 工具 =====
    function getNbt(blockEntity, level) {
        try { return blockEntity.saveWithFullMetadata(level.registryAccess()); } catch (e) { return null; }
    }
    function hasScore(nbt) {
        if (!nbt.contains('Result')) return false;
        let r = nbt.getCompound('Result');
        if (!r.contains('components')) return false;
        let c = r.getCompound('components');
        if (!c.contains('minecraft:custom_data')) return false;
        return c.getCompound('minecraft:custom_data').contains('ingredient_score');
    }

    // =====================================================================
    // 入口：汤锅「烹饪完成」事件（由桥接 mod 触发，与炒锅 wok_score.js 对称）
    //
    // 注意：事件字段（level / pos / stockpot / result）会被 KubeJS 以隐式
    //       变量注入回调作用域。因此回调内不要声明同名 const/let（否则报
    //       "redeclaration of var level"）；这里用 typeof 兜底访问。
    // =====================================================================
    ash_stockpot.cooked(function (event) {
        try {
            var lv = (typeof level !== 'undefined') ? level : event.level;
            var pot = (typeof stockpot !== 'undefined') ? stockpot : event.stockpot;
            var result = (typeof result !== 'undefined') ? result : event.result;

            if (!lv || !pot) return;
            if (lv.clientSide) return;

            // 状态校验：仅完成（=3）处理
            var status;
            try { status = pot.getStatus(); } catch (e) { return; }
            if (status !== 3) return;

            // 成品
            if (!result || result.isEmpty()) {
                try { result = pot.getResult(); } catch (e) {}
            }
            if (!result || result.isEmpty()) return;

            // 读 NBT（此刻 inputs 尚未被清空，食材齐全）
            var nbt = getNbt(pot, lv);
            if (!nbt) return;

            // 已写过分数则跳过
            if (hasScore(nbt)) return;

            // 算分：组件1(原料 ingredient_score) + 组件2(配比 fuzzy_ratio)
            var ingredient;
            try {
                ingredient = ssApplyComponentsFromNbt(nbt, result);
            } catch (e) {
                console.error('[SpoilScore] 汤锅算分失败: ' + e);
                return;
            }

            // 回写并同步
            try { pot.setChanged(); } catch (e) {}
            try {
                var bp = pot.getBlockPos();
                var bs = lv.getBlockState(bp);
                lv.sendBlockUpdated(bp, bs, bs, 3);
            } catch (e) {}

            var posStr = '?';
            try {
                var bp2 = pot.getBlockPos();
                posStr = bp2.getX() + ',' + bp2.getY() + ',' + bp2.getZ();
            } catch (e) {}
            log('[SpoilScore] 汤锅(完成) ' + posStr + ' | 原料分: ' + ingredient);
        } catch (e) {
            console.error('[SpoilScore] 汤锅完成事件处理异常: ' + e);
        }
    });

    console.info('[SpoilScore] stockpot_score.js 已加载（完成事件驱动版 ash_stockpot.cooked）');
})();