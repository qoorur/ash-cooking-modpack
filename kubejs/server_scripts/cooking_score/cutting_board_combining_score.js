// ==============================================================
// DEPENDENCIES (required mods):
//   MrCrayfish's Furniture Refurbished (refurbished_furniture); depends on score_api.js
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/cutting_board_combining_score.js
// =====================================================================
// 【MrCrayfish 家具重制版 · 切菜板 拼装（Combining）】评分系统
// ---------------------------------------------------------------------
// 需求：
//   在切菜板上拼装（不放刀，直接堆料）出成品时，
//   读取【放入台面的各食材的腐烂值】算分，
//   把分数 + 品质前缀写入成品（复用 score_api.js 的 ssXxx）。
//
// 机制（javap 反汇编实证，refurbished_furniture-1.21.1-1.0.22）：
//   方块：<wood>_cutting_board（10 种木）
//   方块实体：CuttingBoardBlockEntity extends BasicLootBlockEntity
//   拼装完成入口：setItem(...) -> craftCombiningRecipe(this.placedByPlayer)
//     - placedByPlayer == true（玩家手动放的料）：
//         craftCombiningRecipe(true) -> spawnItemIntoLevel(...)
//         ★ 成品【掉在地上】★ （这才是手动拼装的实际路径）
//     - placedByPlayer == false（料斗/自动化）：
//         成品留在容器 slot0
//   故对“玩家手动拼装”，成品是【掉落物实体】。
//
// 方案（纯事件驱动，零轮询；仿 cutting_board_spoil.js）：
//   A. rightClicked（切菜板，手上有非刀物品）-> 记账：
//      记该食材新鲜度 + 该台坐标；不取消事件，让原版正常放料。
//   B. EntityEvents.spawned（minecraft:item 掉落物）-> 命中切菜板附近 &
//      在记账中 -> 用记账算组件1分数 -> ssApplyComponentsToItem ->
//      entity.setItem 写回掉落物。命中后清该台记账。
//   C. 空手 / 拿刀右键 -> 清该台记账（取货 / 切片 / 新一轮）。
//
// 依赖：score_api.js（priority:100）提供的 ssReadSpoilTimer / ssCalcIngredientRatio / ssApplyComponentsToItem。
// =====================================================================

(function () {
    const DEBUG = false;   // 调试时 true，可看 [CuttingBoardScore] 日志

    const CB_BLOCKS = [
        'refurbished_furniture:oak_cutting_board',
        'refurbished_furniture:spruce_cutting_board',
        'refurbished_furniture:birch_cutting_board',
        'refurbished_furniture:jungle_cutting_board',
        'refurbished_furniture:acacia_cutting_board',
        'refurbished_furniture:dark_oak_cutting_board',
        'refurbished_furniture:mangrove_cutting_board',
        'refurbished_furniture:cherry_cutting_board',
        'refurbished_furniture:crimson_cutting_board',
        'refurbished_furniture:warped_cutting_board'
    ];

    function isKnife(stack) {
        if (!stack || stack.isEmpty()) return false;
        try { if (typeof stack.hasTag === 'function' && stack.hasTag('c:tools/knife')) return true; } catch (e) {}
        try { if (stack.tags && typeof stack.tags.contains === 'function' && stack.tags.contains('c:tools/knife')) return true; } catch (e) {}
        try {
            if (typeof stack.getItem === 'function') {
                let it = stack.getItem();
                if (it && it.tags && typeof it.tags.contains === 'function' && it.tags.contains('c:tools/knife')) return true;
            }
        } catch (e) {}
        return false;
    }

    function log(msg) { if (DEBUG) console.info('[CuttingBoardScore] ' + msg); }

    // 记账表：坐标键 -> { fresh: number[], time: number }
    //   key = dim_x_y_z；TTL 兜底，防累积。
    const pending = {};
    const PENDING_TTL = 1000 * 60 * 10; // 10 分钟兜底
    const SPAWN_TTL = 2000;              // 掉落物命中窗口（拼装是瞬时的）

    function posKey(level, x, y, z) {
        try { return level.dimension.toString() + '_' + x + '_' + y + '_' + z; }
        catch (e) { return 'unknown_' + x + '_' + y + '_' + z; }
    }

    function freshnessOf(stack) {
        if (!stack || stack.isEmpty()) return 1.0;
        let spoil = null;
        try { spoil = ssReadSpoilTimer(stack); } catch (e) {}
        if (!spoil || !spoil.maxTime || spoil.maxTime <= 0) return 1.0;
        let f = 1.0 - (spoil.timer / spoil.maxTime);
        if (f < 0) f = 0; if (f > 1) f = 1;
        return f;
    }

    // 组件1：0~100 整数（任意 <20% 取最低，否则取平均）
    function calcIngredientScoreFromRecorded(rec) {
        if (!rec || !rec.fresh || rec.fresh.length === 0) return 100;
        return Math.round(ssCalcIngredientRatio(rec.fresh) * 100);
    }

    // ===== A. 记账：右键切菜板放料 =====
    BlockEvents.rightClicked(event => {
        let level = event.level;
        if (level.clientSide) return;
        let player = event.player;
        if (!player) return;

        let blockId = String(event.block.id);
        if (CB_BLOCKS.indexOf(blockId) < 0) return;

        let pos = event.block.pos;
        let key = posKey(level, pos.x, pos.y, pos.z);
        let hand = player.mainHandItem;
        let handEmpty = !hand || hand.isEmpty();

        if (handEmpty || isKnife(hand)) {
            if (pending[key]) { delete pending[key]; log('清记账 ' + key); }
            return;
        }

        let f = freshnessOf(hand);
        let rec = pending[key];
        if (!rec) { rec = { fresh: [], time: Date.now() }; pending[key] = rec; }
        rec.fresh.push(f);
        rec.time = Date.now();
        log('放料 ' + String(hand.getItem()) + ' 新鲜度=' + f.toFixed(3) + ' -> 已记 ' + rec.fresh.length + ' 件 @ ' + key);
    });

    // ===== B. 捕获掉落物成品：写分 =====
    EntityEvents.spawned(event => {
        let entity = event.entity;
        if (!entity) return;
        let level = event.level;
        if (level.clientSide) return;
        if (String(entity.type) !== 'minecraft:item') return;

        let stack = null;
        try { stack = entity.item; } catch (e) {}
        if (!stack || stack.isEmpty()) return;

        // 位置：掉落物自身 / 正下方（成品从切菜板中心弹出，落点常在板上或板下）
        let pos = entity.blockPosition();
        let cands = [
            [pos.x, pos.y,     pos.z],
            [pos.x, pos.y - 1, pos.z],
            [pos.x, pos.y + 1, pos.z]
        ];

        // 找命中的记账台
        let now = Date.now();
        let hitKey = null, hitRec = null;
        for (let i = 0; i < cands.length; i++) {
            let c = cands[i];
            let k = posKey(level, c[0], c[1], c[2]);
            let p = pending[k];
            if (!p) continue;
            if (now - p.time > SPAWN_TTL) continue;   // 太旧，不算本次拼装
            hitKey = k; hitRec = p; break;
        }
        if (!hitRec) return;

        // 算分 + 写组件1(原料)到掉落物（无配比 → 组件2 为空）
        let score = calcIngredientScoreFromRecorded(hitRec);
        if (!ssApplyComponentsToItem(stack, score, null)) { log('写分失败，保留原样'); return; }
        try { if (typeof entity.setItem === 'function') entity.setItem(stack); } catch (e) {}

        delete pending[hitKey];
        log('拼装完成 成品=' + String(stack.getItem()) + ' @ (' + pos.x + ',' + pos.y + ',' + pos.z + ') 评分=' + score.toFixed(2));
    });

    // 兜底清理累积的记账（每次 tick 惰性清理，开销极小：仅在表非空时循环）
    let cleanupCounter = 0;
    ServerEvents.tick(event => {
        cleanupCounter++;
        if (cleanupCounter % 200 !== 0) return; // 每 10 秒
        let now = Date.now();
        for (let k in pending) { if (now - pending[k].time > PENDING_TTL) delete pending[k]; }
    });

    console.info('[CuttingBoardScore] ========== 切菜板拼装评分模块已加载 ==========');
})();

