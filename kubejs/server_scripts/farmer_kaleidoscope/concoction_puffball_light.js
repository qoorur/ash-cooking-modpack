// ==============================================================
// DEPENDENCIES (required mods):
//   Concoction (concoction)
// ==============================================================
// 目的：抑制马勃菌（concoction:crop_puffball）在光照下疯涨 / 扩散。
//
// 背景（反编译结论）：
//   CropPuffballBlock#entityInside 在作物成熟(age=2)被非潜行实体踩踏时，
//   会把自己打回 age=0 并在周围 9x3x9 范围随机生成最多 20 株新幼苗，
//   形成指数级正反馈 → 世界被铺满（“疯涨”）。
//
// 本脚本策略：马勃菌是 randomTicks() 方块，随机刻事件里检查光照。
//   综合光照 >= 9（火把照亮 / 白天露天）→ 直接变空气（死亡）。
//   效果：有光处根本长不起来、也无法扩散；仅黑暗角落能存活。
//
// 注意：KubeJS(Rhino) 回调内不要用 level/pos/block 之类的名字做局部变量，
//   否则触发 "redeclaration of var ..." 报错。这里全部内联访问。
// ==============================================================

// priority: 0

const PUFFBALL_BLOCK = 'concoction:crop_puffball';
const LIGHT_THRESHOLD = 9; // 综合光照 >= 9 视为“光照足够”

BlockEvents.randomTick(PUFFBALL_BLOCK, event => {
    try {
        // 综合光照：含方块光（火把等）+ 天空光（随昼夜变化），范围 0~15
        if (event.level.getMaxLocalRawBrightness(event.block.pos) >= LIGHT_THRESHOLD) {
            event.block.set('minecraft:air');
        }
    } catch (e) {
        console.warn(`[concoction_puffball_light] 处理随机刻失败: ${e}`);
    }
});