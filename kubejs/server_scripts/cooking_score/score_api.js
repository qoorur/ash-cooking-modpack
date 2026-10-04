// ==============================================================
// DEPENDENCIES (required mods):
//   Spoiled (spoiled), Kaleidoscope Cookery (kaleidoscope_cookery)
// ==============================================================
// priority: 100
// kubejs/server_scripts/cooking_score/score_api.js
// 统一的评分系统 API（顶层函数版，不用 global）
//
// ===== 评分体系（三大组件）=====
//   组件1 ingredient_score ：原料 spoil（0~100 整数）
//       规则：任意食材新鲜度 < 20% → 直接取【最低】那个值；
//             全部 ≥ 20%        → 取【平均值】(a+b)/2（count==2 时同样）
//   组件2 fuzzy_ratio      ：配比（0~100 整数，仅炒锅/煎锅有）
//       来源：成品带 kaleidoscope_cookery:quality 组件时映射
//             superb=100 / excellent=75 / standard=50 / poor=25，无则为空
//   组件3 （无独立 NBT）    ：成品自身 spoiled:spoil_timer 的新鲜度（0~100）
//   最终评分 = 各【非空】组件按权重归一化加权（空组件权重按比例分摊给其余组件）
//       权重：组件1 = 25%，组件2 = 50%，组件3 = 25%

// ===== 调试开关（排查问题时改 true）=====
const SS_DEBUG = false;
function ssLog(msg) { if (SS_DEBUG) console.info(msg); }

// ===== 常量表 =====
const SS_TASTE_LEVELS = [
    { threshold: 0.95, text: '§6绝世美味' },
    { threshold: 0.85, text: '§e鲜美可口' },
    { threshold: 0.70, text: '§a味道尚佳' },
    { threshold: 0.50, text: '§f普普通通' },
    { threshold: 0.30, text: '§7略显陈旧' },
    { threshold: 0.15, text: '§8不太新鲜' },
    { threshold: -1,   text: '§4变质边缘' }
];

const SS_QUALITY_LEVELS = {
    superb:    '§6极佳',
    excellent: '§a优秀',
    standard:  '§f普通',
    poor:      '§7生疏'
};

// 品质 → 配比分（组件2，0~100 整数，4 档每档 25）
const SS_QUALITY_SCORE = {
    superb:    100,
    excellent: 75,
    standard:  50,
    poor:      25
};

// ===== NBT 字段名（写入 minecraft:custom_data）=====
const SS_NBT_INGREDIENT = 'ingredient_score'; // 组件1：原料 spoil（0~100 整数）
const SS_NBT_FUZZY      = 'fuzzy_ratio';      // 组件2：配比（0~100 整数）
const SS_NBT_SCORE      = 'score';            // 旧整体分（0~1，保留读出兼容）

// ===== 最终评分权重 =====
const SS_WEIGHT_INGREDIENT = 0.25;
const SS_WEIGHT_FUZZY      = 0.50;
const SS_WEIGHT_FRESHNESS  = 0.25;

// 组件1 低分阈值（任意食材新鲜度低于此值则直接取最低）
const SS_INGREDIENT_LOW_THRESHOLD = 0.20;

// ====================================================
// 一、核心算法
// ====================================================

function ssCalcFreshness(timer, maxTime) {
    if (maxTime <= 0) return 1.0;
    return Math.max(0, Math.min(1, 1.0 - (timer / maxTime)));
}

// 组件1 算法：0~1 新鲜度列表 → 0~1 分数
function ssCalcIngredientRatio(freshnessList) {
    if (!freshnessList || freshnessList.length === 0) return 1.0;

    let lowest = 1.0;
    let sum = 0;
    for (let i = 0; i < freshnessList.length; i++) {
        let f = freshnessList[i];
        if (f < lowest) lowest = f;
        sum += f;
    }
    // 任意食材低于阈值 → 直接取最低
    if (lowest < SS_INGREDIENT_LOW_THRESHOLD) return lowest;
    // 全部高于阈值 → 取平均
    return sum / freshnessList.length;
}


// ====================================================
// 二、最终评分（三组件加权几何平均）
//   ingredient : 0~100 或 null
//   fuzzy      : 0~100 或 null
//   freshness  : 0~100 或 null
//   返回 0~100 最终分

// 最终评分 = 加权几何平均（指数 = 各组件权重 / 参与组件权重和）
//   - 空组件（null/undefined）不参与，指数按比例分摊给其余组件
function ssCalcFinalWeightedScore(ingredient, fuzzy, freshness) {
    let sumW = 0, sumLog = 0;

    function acc(v, w) {
        if (v === null || v === undefined) return;
        let cv = v < 0 ? 0 : v;
        sumW += w;
        sumLog += Math.log(cv) * w;
    }

    acc(ingredient, SS_WEIGHT_INGREDIENT);
    acc(fuzzy,      SS_WEIGHT_FUZZY);
    acc(freshness,  SS_WEIGHT_FRESHNESS);

    if (sumW <= 0) return 100.0; // 全空 → 视为满分
    return Math.exp(sumLog / sumW);
}
// ====================================================
// 三、等级文本（字符串版）
// ====================================================

// ====================================================
// 四、等级文本（Text 对象版）
// ====================================================

function ssGetTasteTextObj(score) {
    if (score >= 0.95) return Text.gold('绝世美味');
    if (score >= 0.85) return Text.yellow('鲜美可口');
    if (score >= 0.70) return Text.green('味道尚佳');
    if (score >= 0.50) return Text.white('普普通通');
    if (score >= 0.30) return Text.gray('略显陈旧');
    if (score >= 0.15) return Text.darkGray('不太新鲜');
    return Text.darkRed('变质边缘');
}

function ssGetQualityTextObj(quality) {
    if (!quality) return Text.gray('无');
    let q = ('' + quality).toLowerCase();
    if (q === 'superb')    return Text.gold('极佳');
    if (q === 'excellent') return Text.green('优秀');
    if (q === 'standard')  return Text.white('普通');
    if (q === 'poor')      return Text.gray('生疏');
    return Text.white(quality);
}

function ssGetFreshnessTextObj(freshPercent) {
    if (freshPercent >= 75) return Text.lightPurple('最佳');
    if (freshPercent >= 50) return Text.blue('新鲜');
    if (freshPercent >= 25) return Text.green('普通');
    return Text.red('临期');
}

// 最终评分（0~100）按同一 4 档 25% 配色
function ssGetScoreTextObj(score100) {
    var n = Number(score100);
    if (n >= 75) return Text.lightPurple('' + score100);
    if (n >= 50) return Text.blue('' + score100);
    if (n >= 25) return Text.green('' + score100);
    return Text.red('' + score100);
}

// 组件1 文本档位（0~100，4 档 25%：紫/蓝/绿/红）
function ssGetIngredientTextObj(score100) {
    if (score100 >= 75) return Text.lightPurple('极鲜食材');
    if (score100 >= 50) return Text.blue('新鲜食材');
    if (score100 >= 25) return Text.green('尚可食材');
    return Text.red('变质食材');
}

// 组件2 文本档位（0~100，4 档 25%：紫/蓝/绿/红）
function ssGetFuzzyTextObj(score100) {
    if (score100 >= 75) return Text.lightPurple('完美配比');
    if (score100 >= 50) return Text.blue('优秀配比');
    if (score100 >= 25) return Text.green('普通配比');
    return Text.red('生疏配比');
}

// ====================================================
// 五、从方块实体 NBT 读食材
// ====================================================

function ssReadInputsFreshness(nbt) {
    let result = [];
    if (!nbt.contains('Inputs')) return result;

    let inputsCompound = nbt.getCompound('Inputs');
    if (!inputsCompound.contains('Items')) return result;

    let itemList = inputsCompound.getList('Items', 10);
    ssLog(`[SpoilScoreAPI] Inputs.Items 大小 = ${itemList.size()}`);

    for (let b = 0; b < itemList.size(); b++) {
        let itemNbt = itemList.getCompound(b);
        if (!itemNbt.contains('id')) continue;

        let itemId = itemNbt.getString('id');
        let freshness = 1.0;
        let hasSpoil = false;

        if (itemNbt.contains('components')) {
            let comps = itemNbt.getCompound('components');
            if (comps.contains('spoiled:spoil_timer')) {
                let td = comps.getCompound('spoiled:spoil_timer');
                let timer = td.getInt('timer');
                let maxTime = td.getInt('maxTime');
                if (maxTime > 0) {
                    freshness = ssCalcFreshness(timer, maxTime);
                    hasSpoil = true;
                    ssLog(`[SpoilScoreAPI] 食材 ${itemId}: timer=${timer}/${maxTime}, 新鲜度=${freshness.toFixed(3)}`);
                }
            }
        }

        if (!hasSpoil) {
            ssLog(`[SpoilScoreAPI] 食材 ${itemId} 无 spoil 值，按 100% 计算`);
        }

        result.push({ id: itemId, freshness: freshness });
    }
    return result;
}

// 从 NBT 算【组件1 分值】（0~100 整数）
function ssCalcIngredientScoreFromNbt(nbt) {
    let inputs = ssReadInputsFreshness(nbt);
    if (inputs.length === 0) return 100;
    let freshnessList = [];
    for (let i = 0; i < inputs.length; i++) {
        freshnessList.push(inputs[i].freshness);
    }
    return Math.round(ssCalcIngredientRatio(freshnessList) * 100);
}


// ====================================================
// 六、从 ItemStack 读数据
// ====================================================

function ssReadQuality(itemStack) {
    try {
        let q = itemStack.getComponents().get('kaleidoscope_cookery:quality');
        if (!q) return null;
        if (typeof q === 'string') return q;
        try { if (q.value !== undefined) return '' + q.value; } catch (e) {}
        try { if (typeof q.get === 'function') return '' + q.get(); } catch (e) {}
        let str = '' + q;
        let m = str.match(/quality[=:]"?([a-zA-Z_]+)"?/);
        if (m) return m[1];
        return str;
    } catch (e) {}
    return null;
}

// 读 custom_data 里的某个数值字段
function ssReadCustomDataNumber(itemStack, key) {
    try {
        let cd = itemStack.getComponents().get('minecraft:custom_data');
        if (!cd) return null;
        if (typeof cd.copyTag === 'function') {
            let tag = cd.copyTag();
            if (tag && tag.contains && tag.contains(key)) {
                let n = tag.getDouble(key);
                if (!isNaN(n)) return n;
            }
        }
        let str = '' + cd;
        let re = new RegExp(key + ':\\s*([\\d.]+)');
        let m = str.match(re);
        if (m) return parseFloat(m[1]);
    } catch (e) {}
    return null;
}

// 旧接口：读旧整体分 score（0~1）
function ssReadScore(itemStack) {
    return ssReadCustomDataNumber(itemStack, 'score');
}

// 组件1：ingredient_score（0~100）
function ssReadIngredientScore(itemStack) {
    return ssReadCustomDataNumber(itemStack, SS_NBT_INGREDIENT);
}

// 组件2：fuzzy_ratio（0~100）
function ssReadFuzzyRatio(itemStack) {
    return ssReadCustomDataNumber(itemStack, SS_NBT_FUZZY);
}

// 从成品 quality 组件推导组件2 分值（0~100 或 null）
function ssQualityToFuzzyRatio(itemStack) {
    let q = ssReadQuality(itemStack);
    if (!q) return null;
    let key = ('' + q).toLowerCase();
    if (SS_QUALITY_SCORE[key] !== undefined) return SS_QUALITY_SCORE[key];
    return null;
}

function ssReadSpoilTimer(itemStack) {
    if (!itemStack || itemStack.isEmpty()) return null;
    try {
        let spo = itemStack.getComponents().get('spoiled:spoil_timer');
        if (!spo) return null;

        let timer = null, maxTime = null;
        try { timer = Number(spo.timer); } catch (e) {}
        try { maxTime = Number(spo.maxTime); } catch (e) {}
        if (isNaN(timer)) {
            try { timer = spo.timer(); } catch (e) {}
        }
        if (isNaN(maxTime)) {
            try { maxTime = spo.maxTime(); } catch (e) {}
        }
        if (isNaN(timer) || isNaN(maxTime)) {
            let str = '' + spo;
            let mt = str.match(/timer:\s*(\d+)/);
            let mm = str.match(/maxTime:\s*(\d+)/);
            if (mt) timer = parseInt(mt[1], 10);
            if (mm) maxTime = parseInt(mm[1], 10);
        }
        if (isNaN(timer) || isNaN(maxTime)) return null;
        return { timer: timer, maxTime: maxTime };
    } catch (e) {}
    return null;
}

function ssReadFreshnessPercent(itemStack) {
    let spoil = ssReadSpoilTimer(itemStack);
    if (!spoil || spoil.maxTime <= 0) return 100.0;
    let remainTicks = spoil.maxTime - spoil.timer;
    return remainTicks / spoil.maxTime * 100;
}

function ssGetItemDisplayNameObj(itemStack) {
    if (!itemStack) return Text.of('未知物品');
    try {
        let n = itemStack.getHoverName();
        if (n) return n;
    } catch (e) {}
    try {
        let dn = itemStack.displayName;
        if (dn) return Text.of('' + dn);
    } catch (e) {}
    return Text.of(String(itemStack.id));
}

// ====================================================
// 七、写入 ItemStack（只写组件1、组件2；组件3 与最终分在 display 时实时计算）
// ====================================================

// 写入组件1、组件2 到 custom_data
//   ingredientScore : 0~100 或 null（不写）
//   fuzzyRatio      : 0~100 或 null（不写）
// 注意：不再写组件3（成品自身 spoil，由 spoild 模组维护）、不写最终评分（display 实时算）
function ssApplyComponentsToItem(itemStack, ingredientScore, fuzzyRatio) {
    if (!itemStack || itemStack.isEmpty()) return false;

    let cd = {};
    if (ingredientScore !== null && ingredientScore !== undefined) {
        cd[SS_NBT_INGREDIENT] = Math.round(ingredientScore);
    }
    if (fuzzyRatio !== null && fuzzyRatio !== undefined) {
        cd[SS_NBT_FUZZY] = Math.round(fuzzyRatio);
    }

    try {
        itemStack.set('minecraft:custom_data', cd);
        ssLog(`[SpoilScoreAPI] 写入 ingredient=${cd[SS_NBT_INGREDIENT]} fuzzy=${cd[SS_NBT_FUZZY]}`);
    } catch (e) {
        console.warn(`[SpoilScoreAPI] set custom_data 失败: ${e}`);
        return false;
    }
    return true;
}

// 从 NBT 算组件1 + 从成品推组件2，写入成品
function ssApplyComponentsFromNbt(nbt, resultItemStack) {
    let ingredient = ssCalcIngredientScoreFromNbt(nbt);
    let fuzzy = ssQualityToFuzzyRatio(resultItemStack); // 无 quality → null（组件2 为空）
    ssApplyComponentsToItem(resultItemStack, ingredient, fuzzy);
    return ingredient;
}


console.info('[SpoilScoreAPI] 评分系统已注册');