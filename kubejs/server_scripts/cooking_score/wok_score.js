// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery), ash_kaleidoscope_kitchen_wok (ash_wok.cooked event); depends on score_api.js
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/wok_score.js
// 森罗物语炒锅评分系统
// 依赖 score_api.js 提供的 ssXxx 函数
//
// 说明：炒锅【没有配方匹配事件】（对比汤锅的 StockpotMatchRecipeEvent），
//   因此无法在“开始烹饪”瞬间触发。改为在【成品完成/取出】时写分，覆盖以下时机：
//
//   1) 烹饪完成（首选，ash_wok.cooked 事件，由 ash_kaleidoscope_kitchen_wok mod 触发）：
//      成品刚做好（status 变为 FINISHED）即写分。与“取出方式”无关，
//      天然兼容：玩家右键 / Create 机械臂 / 女仆餐厅 / 漏斗管道 等一切后续取出。
//
//   2) 玩家右键取出（兜底，BlockEvents.rightClicked）：
//      若因某些原因 cooked 未覆盖到（例如中途被其它模组改过），在取出瞬间补写。
//
//   两个入口共用 applyScoreIfNeeded()，已写分则跳过，不会重复。
//
//   实测数据（探针）：
//     - 放料/放油时 status = PUT(0)
//     - 翻炒触发烹饪后 status = COOKING(1)，此时 result 已就绪
//     - 完成（可取出）时 status = FINISHED(2)

(function () {
    const DEBUG = false;    // 调试时改 true

    // IPot 状态常量（实测）
    const ST_PUT = 0;       // 空闲 / 放料
    const ST_COOKING = 1;   // 烹饪中
    const ST_FINISHED = 2;  // 完成（可取出）
    const ST_BURNT = 3;     // 烧焦

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

    // ===== 通用：对一个成品 stack 算分并写入（已写分则跳过）=====
    function applyScoreIfNeeded(blockEntity, level, resultStack, source) {
        if (!resultStack || resultStack.isEmpty()) return;

        let nbt = getNbt(blockEntity, level);
        if (!nbt) return;

        // 已写过分数则跳过
        if (hasScore(nbt)) return;

        // 算分并写入组件1(原料)/组件2(配比)
        let finalScore;
        try {
            finalScore = ssApplyComponentsFromNbt(nbt, resultStack);
        } catch (e) {
            console.error(`[SpoilScore] 算分失败(${source}): ${e}`);
            return;
        }

        // 回写并同步
        let pos = blockEntity.getBlockPos();
        try { blockEntity.setChanged(); } catch (e) {}
        try {
            let bs = level.getBlockState(pos);
            level.sendBlockUpdated(pos, bs, bs, 3);
        } catch (e) {}

        log('[SpoilScore] 炒锅 ' + source + ' | 原料分: ' + finalScore);
    }

    // =====================================================================
    // 入口 1（首选）：烹饪完成——成品刚做好即写分
    // =====================================================================
    ash_wok.cooked(event => {
        let level = event.level;
        let pot = event.pot;
        let result = event.result;
        if (!level || !pot || !result) return;

        applyScoreIfNeeded(pot, level, result, '烹饪完成');
    });

    // =====================================================================
    // 入口 2（兜底）：玩家右键取出
    //    - 仅当 status === FINISHED(2) 且有成品时处理
    // =====================================================================
    BlockEvents.rightClicked('kaleidoscope_cookery:pot', event => {
        let level = event.level;
        let player = event.player;
        if (!player || level.clientSide) return;
        let pos = event.block.pos;

        let blockEntity = null;
        try { blockEntity = level.getBlockEntity(pos); } catch (e) {}
        if (!blockEntity) return;

        let status;
        try { status = blockEntity.getStatus(); } catch (e) { return; }
        if (status !== ST_FINISHED) return;

        let result = null;
        try { result = blockEntity.getResult(); } catch (e) {}
        if (!result || result.isEmpty()) return;

        applyScoreIfNeeded(blockEntity, level, result, '玩家右键');
    });

    console.info('[SpoilScore] wok_score.js 已加载（烹饪完成 + 玩家右键）');
})();