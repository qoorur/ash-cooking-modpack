// ==============================================================
// DEPENDENCIES (required mods):
//   Farmer's Delight (farmersdelight), Spoiled (spoiled); depends on score_api.js (ssReadSpoilTimer)
// ==============================================================
// priority: 50
// kubejs/server_scripts/cooking_score/cutting_board_spoil.js
// =====================================================================
// 【农夫乐事砧板】切割产物保留输入食材的腐烂值
// ---------------------------------------------------------------------
// 需求（用户确认）：
//   1. 产物原样复制原料的 {timer, maxTime}（不做新鲜度换算）
//   2. 配方切出多份产物时，每份都写同样的腐烂值
//   3. 产物本身已有腐烂值时，直接覆盖
//   4. 对所有 farmersdelight:cutting 配方生效（含木头/花等，无腐烂值则不动）
//   5. 不限制工具：任何右键砧板的操作都可触发（整合包工具配方多样）
//
// 原理（农夫乐事 1.21.1-1.3.4 源码实测）：
//   砧板【没有产物槽】。切割时 CuttingBoardBlockEntity.processStoredItemUsingTool
//   会直接 ItemUtils.spawnItemEntity 生成【掉落物实体】，然后消耗输入槽 item0。
//   因此不能用“扫描产物槽”的办法，而应：
//     A. rightClicked(砧板) → 切割前暂存原料腐烂值 + 本次产物 ID 白名单
//     B. EntityEvents.spawned(item实体) → 命中砧板附近 & ID 在白名单 → 写回
//   与 food_score_display.js 的“掉落物 NBT 写回”是同一套路。
//
// 防误赋值（方案 C：三重保险）：
//   ① TTL 收紧到 400ms（切割是瞬时的，只有同/相邻 tick 的产物能命中）
//   ② 位置收紧：只认“砧板自身 + 正上方 + 正下方”3 格
//   ③ 产物 ID 白名单：暂存时用配方算出会产出的物品 ID 集合，只对集合内物品赋值
//   ④ 命中计数消费：按剩余可赋值份数消费，避免一份原料无限共享
//
// 依赖：score_api.js（priority:100）提供的 ssReadSpoilTimer
// =====================================================================

var CB_DEBUG = false;
function cbLog(msg) { if (CB_DEBUG) console.info('[CuttingBoardSpoil] ' + msg); }
function cbWarn(msg) { console.warn('[CuttingBoardSpoil] ' + msg); }

// 砧板方块 ID / 配方类型
const CB_BLOCK_ID = 'farmersdelight:cutting_board';
const CB_RECIPE_TYPE = 'farmersdelight:cutting';

// =====================================================================
// 暂存：砧板坐标 → { timer, maxTime, ids:Set, left:份数, time }
// =====================================================================
const cbPending = {};
const CB_TTL = 400;        // 毫秒：切割瞬时，400ms 足够
const CB_MAX_SHARE = 9;    // 单次暂存最多可赋值份数（1 输入一般 ≤4 份，留余量）

function cbPosKey(level, x, y, z) {
    try { return level.dimension.toString() + '_' + x + '_' + y + '_' + z; } catch (e) {}
    return 'unknown_' + x + '_' + y + '_' + z;
}

function cbClean() {
    let now = Date.now();
    for (let k in cbPending) {
        if (now - cbPending[k].time > CB_TTL) delete cbPending[k];
    }
}

// =====================================================================
// 从方块实体的输入槽(item0)读取物品 ItemStack（用于读腐烂值 + 匹配配方）
//   农夫乐事砧板方块实体为 CuttingBoardBlockEntity，
//   其 getStoredItem() 返回 item0（被切原料）。
// =====================================================================
function cbReadBoardInputStack(blockEntity) {
    if (!blockEntity) return null;

    let stack = null;
    try {
        if (typeof blockEntity.getStoredItem === 'function') {
            stack = blockEntity.getStoredItem();
        }
    } catch (e) {}
    if ((!stack || stack.isEmpty()) && typeof blockEntity.getInventory === 'function') {
        try {
            let inv = blockEntity.getInventory();
            if (inv && typeof inv.getStackInSlot === 'function') {
                stack = inv.getStackInSlot(0);
            }
        } catch (e) {}
    }
    if (!stack || stack.isEmpty()) return null;
    return stack;
}

// =====================================================================
// 计算本次切割的“产物 ID 白名单”
//   遍历所有 farmersdelight:cutting 配方，找到输入能匹配该原料的配方，
//   收集其产物 ID（含 getResults 固定产物；ChanceResult 随机产物一并尝试）。
//   匹配失败（拿不到配方）返回 null → 调用方退化为“不加 ID 校验”
// =====================================================================
function cbCollectRecipeResultIds(level, inputStack) {
    if (!inputStack || inputStack.isEmpty()) return null;

    let ids = {};
    let count = 0;
    try {
        let server = level.server;
        let recipeManager = server.getRecipeManager();
        let allRecipes = recipeManager.getRecipes(); // Collection<RecipeHolder>

        allRecipes.forEach(holder => {
            try {
                let recipe = holder.value();
                let type = recipe.getType ? String(recipe.getType()) : '';
                if (type !== CB_RECIPE_TYPE) return;

                // 输入匹配：试着用 getIngredients() 判断
                let matched = true;
                try {
                    let ings = recipe.getIngredients(); // NonNullList<Ingredient>
                    if (ings && ings.size && ings.size() > 0) {
                        matched = false;
                        for (let i = 0; i < ings.size(); i++) {
                            let ing = ings.get(i);
                            if (ing && ing.test && ing.test(inputStack)) { matched = true; break; }
                        }
                    }
                } catch (e) {
                    matched = true; // 拿不到 ingredients 就不排除该配方
                }
                if (!matched) return;

                // 收集产物 ID
                try {
                    let results = recipe.getResults(); // List<ItemStack>
                    if (results) {
                        results.forEach(st => {
                            if (st && !st.isEmpty()) { ids[String(st.getItem())] = true; count++; }
                        });
                    }
                } catch (e) {}

                // 随机产物（ChanceResult）尝试
                try {
                    let rolls = recipe.getRollableResults(); // NonNullList<ChanceResult>
                    if (rolls) {
                        for (let i = 0; i < rolls.size(); i++) {
                            let cr = rolls.get(i);
                            let st = null;
                            try { st = cr.getStack ? cr.getStack() : cr.stack; } catch (e) {}
                            if (st && !st.isEmpty()) { ids[String(st.getItem())] = true; count++; }
                        }
                    }
                } catch (e) {}

                // 兜底：getResultItem
                if (count === 0) {
                    try {
                        let ri = recipe.getResultItem(level.registryAccess());
                        if (ri && !ri.isEmpty()) { ids[String(ri.getItem())] = true; count++; }
                    } catch (e) {}
                }
            } catch (e) {}
        });
    } catch (e) {
        cbWarn('遍历配方失败: ' + e);
        return null;
    }

    return count > 0 ? ids : null;
}

// =====================================================================
// 事件1：右键砧板 → 切割前暂存原料腐烂值 + 产物 ID 白名单
//   （不限制工具；此时方块实体输入槽还是原料，尚未被切）
// =====================================================================
BlockEvents.rightClicked(CB_BLOCK_ID, event => {
    let level = event.level;
    if (level.clientSide) return;
    let player = event.player;
    if (!player) return;

    let pos = event.block.pos;
    let blockEntity = null;
    try { blockEntity = level.getBlockEntity(pos); } catch (e) {}
    if (!blockEntity) return;

    let inputStack = cbReadBoardInputStack(blockEntity);
    if (!inputStack) return; // 砧板上没东西，跳过

    let spoil = ssReadSpoilTimer(inputStack);
    if (!spoil) return; // 原料无腐烂值 → 不暂存

    let ids = cbCollectRecipeResultIds(level, inputStack);

    cbPending[cbPosKey(level, pos.x, pos.y, pos.z)] = {
        timer: spoil.timer,
        maxTime: spoil.maxTime,
        inputId: String(inputStack.getItem()),
        ids: ids,                 // 可能为 null（拿不到配方时不校验 ID）
        left: CB_MAX_SHARE,       // 剩余可赋值份数
        time: Date.now()
    };
    cbLog('暂存 @ (' + pos.x + ',' + pos.y + ',' + pos.z + ') 原料=' + String(inputStack.getItem())
        + ' timer=' + spoil.timer + '/' + spoil.maxTime
        + ' 产物白名单=' + (ids ? Object.keys(ids).join(',') : '(无,跳过ID校验)'));
});

// =====================================================================
// 事件2：物品实体生成 → 命中砧板暂存 → 写回腐烂值
//   位置收紧：只认“砧板自身 + 正上方 + 正下方”3 格
//   （产物落点为砧板中心 y+0.2，blockPosition 落在砧板自身或正上方）
// =====================================================================
EntityEvents.spawned(event => {
    let entity = event.entity;
    if (!entity) return;
    let level = event.level;
    if (level.clientSide) return;
    if (String(entity.type) !== 'minecraft:item') return;

    let stack = null;
    try { stack = entity.item; } catch (e) {}
    if (!stack || stack.isEmpty()) return;

    let pos = entity.blockPosition();
    let itemId = String(stack.getItem());

    // 位置：自身 / 正上方 / 正下方
    let cands = [
        [pos.x, pos.y,     pos.z],
        [pos.x, pos.y - 1, pos.z],
        [pos.x, pos.y + 1, pos.z]
    ];

    cbClean();
    let staged = null, stagedKey = null;
    for (let i = 0; i < cands.length; i++) {
        let c = cands[i];
        let k = cbPosKey(level, c[0], c[1], c[2]);
        let p = cbPending[k];
        if (!p) continue;
        if (p.left <= 0) continue;
        // ID 白名单校验
        if (p.ids && !p.ids[itemId]) continue;
        staged = p; stagedKey = k; break;
    }
    if (!staged) return;

    // 覆盖写入腐烂值
    try {
        stack.set('spoiled:spoil_timer', { timer: staged.timer, maxTime: staged.maxTime });
    } catch (e) {
        cbWarn('写入 spoil_timer 失败: ' + e);
        return;
    }
    try { if (typeof entity.setItem === 'function') entity.setItem(stack); } catch (e) {}

    staged.left--;
    if (staged.left <= 0) delete cbPending[stagedKey];

    cbLog('产物 ' + itemId + ' @ (' + pos.x + ',' + pos.y + ',' + pos.z + ') 写回腐烂值 timer='
        + staged.timer + '/' + staged.maxTime + ' 剩余份数=' + staged.left);
});

console.info('[CuttingBoardSpoil] ========== 砧板腐烂值保留模块已加载 ==========');
