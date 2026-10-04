// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery); depends on score_api.js
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/stockpot_score.js
// 森罗物语汤锅评分系统（事件驱动版）
// 依赖 score_api.js 提供的 ssXxx 函数
//
// 事件驱动：监听 StockpotMatchRecipeEvent$Post（配方匹配、开始烹饪瞬间触发）
//   该事件提供 getStockpot() / getLevel() / getInput() / getOutput()，
//   此刻 stockpot.getStatus() === 1（烹饪中），stockpot.getResult() 已就绪，
//   可直接算分并写入成品，无需 ServerEvents.tick 轮询。

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
    // 核心：监听配方匹配事件（事件驱动，替代 tick 轮询）
    // =====================================================================
    (function registerStockpotListener() {
        let PostClass, NeoForge, bus, EventPriority, Consumer;
        try {
            PostClass = Java.loadClass('com.github.ysbbbbbb.kaleidoscopecookery.api.event.StockpotMatchRecipeEvent$Post');
            NeoForge = Java.loadClass('net.neoforged.neoforge.common.NeoForge');
            EventPriority = Java.loadClass('net.neoforged.bus.api.EventPriority');
            Consumer = Java.loadClass('java.util.function.Consumer');
        } catch (e) {
            console.error('[SpoilScore] 加载事件类失败，汤锅评分将不可用: ' + e);
            return;
        }
        bus = NeoForge.EVENT_BUS;

        let listener = new Consumer({
            accept: function (ev) {
                try {
                    handleMatch(ev);
                } catch (e) {
                    console.error('[SpoilScore] 汤锅事件处理异常: ' + e);
                }
            }
        });

        try {
            bus.addListener(EventPriority.NORMAL, PostClass, listener);
            console.info('[SpoilScore] stockpot_score.js 事件监听已注册 (StockpotMatchRecipeEvent$Post)');
        } catch (e) {
            console.error('[SpoilScore] 注册汤锅事件监听失败: ' + e);
        }
    })();

    function handleMatch(ev) {
        let stockpot = ev.getStockpot();
        let level = ev.getLevel();
        if (!stockpot || !level || level.clientSide) return;

        // 状态校验：仅烹饪中（=1）处理
        let status;
        try { status = stockpot.getStatus(); } catch (e) { return; }
        if (status !== 1) return;

        // 读取 NBT（复用原有算分逻辑）
        let nbt = getNbt(stockpot, level);
        if (!nbt) return;

        // 已写过分数则跳过
        if (hasScore(nbt)) return;

        // 拿成品
        let result = null;
        try {
            result = stockpot.getResult();
        } catch (e) {}
        if (!result || result.isEmpty()) return;

        // 写分：组件1(原料 ingredient_score) + 组件2(配比 fuzzy_ratio)
        let ingredient = ssApplyComponentsFromNbt(nbt, result);

        // 回写并同步
        try {
            stockpot.setChanged();
        } catch (e) {}
        try {
            let pos = stockpot.getBlockPos();
            let bs = level.getBlockState(pos);
            level.sendBlockUpdated(pos, bs, bs, 3);
        } catch (e) {}

        let posStr = '?';
        try {
            let pos = stockpot.getBlockPos();
            posStr = pos.getX() + ',' + pos.getY() + ',' + pos.getZ();
        } catch (e) {}
        log('[SpoilScore] 汤锅 ' + posStr + ' | 原料分: ' + ingredient);
    }

    console.info('[SpoilScore] stockpot_score.js 已加载（事件驱动版）');
})();