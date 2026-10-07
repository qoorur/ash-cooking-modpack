// ==============================================================
// DEPENDENCIES (required mods):
//   Obscure Tooltips, ash_kaleidoscope_kitchen_wok (ash_tooltip bridge); resource pack: kubejs/assets/ash_tooltips
// ==============================================================
// priority: 100
// kubejs/client_scripts/cooking_score/tooltip.js
// =====================================================================
// 【悬停物品提示条】显示食物三大组件 + 最终评分
//   - tooltip 是客户端渲染，必须在 client_scripts 中
//   - 监听 NeoForge 的 ItemTooltipEvent（与 otc_modify/remove_income_tooltip.js 同范式）
//   - 客户端读不到 server 的 ssXxx 函数，故自带一份精简读数 + 权重计算
//   - 组件数据（custom_data / spoiled:spoil_timer）
//     都会随物品同步到客户端，因此可在此读取
//
//   组件1 ingredient_score ：原料 spoil（0~100 整数）
//   组件2 fuzzy_ratio      ：配比（0~100 整数，可空）
//   组件3 （实时）          ：成品自身 spoiled:spoil_timer 新鲜度（0~100）
//   最终评分 = 各非空组件按权重 25/50/25 归一化加权
// =====================================================================

var CS_DEBUG = false;
function csLog(msg) { if (CS_DEBUG) console.info('[FoodTooltip] ' + msg); }

// 权重
var CS_W_INGREDIENT = 0.25;
var CS_W_FUZZY      = 0.50;
var CS_W_FRESHNESS  = 0.25;

// 组件1 低分阈值
var CS_INGREDIENT_LOW = 0.20;

// =====================================================================
// 读数工具（与 score_api.js 保持一致的语义）
// =====================================================================

// 读 custom_data 里的某个数值字段
function csReadCustomDataNumber(stack, key) {
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
        var str = '' + cd;
        var m = str.match(new RegExp(key + ':\\s*(-?[\\d.]+)'));
        if (m) { var n2 = parseFloat(m[1]); if (!isNaN(n2)) return n2; }
    } catch (e) {}
    return null;
}

function csReadIngredientScore(stack) {
    return csReadCustomDataNumber(stack, 'ingredient_score');
}
function csReadFuzzyRatio(stack) {
    return csReadCustomDataNumber(stack, 'fuzzy_ratio');
}
function csReadLegacyScore(stack) {
    return csReadCustomDataNumber(stack, 'score');
}


// 读 spoil_timer → {timer, maxTime} 或 null
function csReadSpoilTimer(stack) {
    if (!stack || stack.isEmpty()) return null;
    try {
        var spo = stack.getComponents().get('spoiled:spoil_timer');
        if (!spo) return null;

        var timer = null, maxTime = null;
        try { timer = Number(spo.timer); } catch (e) {}
        try { maxTime = Number(spo.maxTime); } catch (e) {}
        if (isNaN(timer)) { try { timer = spo.timer(); } catch (e) {} }
        if (isNaN(maxTime)) { try { maxTime = spo.maxTime(); } catch (e) {} }
        if (isNaN(timer) || isNaN(maxTime)) {
            var str = '' + spo;
            var mt = str.match(/timer:\s*(\d+)/);
            var mm = str.match(/maxTime:\s*(\d+)/);
            if (mt) timer = parseInt(mt[1], 10);
            if (mm) maxTime = parseInt(mm[1], 10);
        }
        if (isNaN(timer) || isNaN(maxTime)) return null;
        return { timer: timer, maxTime: maxTime };
    } catch (e) {}
    return null;
}

function csReadFreshnessPercent(stack) {
    var spoil = csReadSpoilTimer(stack);
    if (!spoil || spoil.maxTime <= 0) return 100.0;
    return (spoil.maxTime - spoil.timer) / spoil.maxTime * 100;
}

// 读食物 level（来自 startup 载入的 global.FOOD_LEVEL_MAP / food_level_data.json）
function csReadFoodLevel(stack) {
    if (!stack || stack.isEmpty()) return null;
    try {
        if (typeof global.getFoodLevelOf === 'function') {
            var v = global.getFoodLevelOf(stack);
            return (v === undefined) ? null : v;
        }
    } catch (e) {}
    return null;
}

// level 是否"需要展示档位"：level > 1（不含 1）
function csLevelNeedsGrade(level) {
    return (level !== null && level !== undefined && Number(level) > 1.0);
}

// level 文本配色（数值越大越高级）
function csLevelText(level) {
    var n = Number(level);
    if (n >= 4.0) return Text.lightPurple('' + level);
    if (n >= 3.0) return Text.gold('' + level);
    if (n >= 2.0) return Text.blue('' + level);
    if (n > 1.0)  return Text.green('' + level);
    return Text.gray('' + level);
}

// =====================================================================
// 最终评分（加权几何平均）
// =====================================================================
function csCalcFinalWeightedScore(ingredient, fuzzy, freshness) {
    var sumW = 0, sumLog = 0;

    function acc(v, w) {
        if (v === null || v === undefined) return;
        var cv = v < 0 ? 0 : v;
        sumW += w;
        sumLog += Math.log(cv) * w;
    }

    acc(ingredient, CS_W_INGREDIENT);
    acc(fuzzy,      CS_W_FUZZY);
    acc(freshness,  CS_W_FRESHNESS);

    if (sumW <= 0) return 100.0;
    return Math.exp(sumLog / sumW);
}

// =====================================================================
// 文本档位
// =====================================================================
function csIngredientText(v) {
    if (v >= 75) return Text.lightPurple('极鲜食材');
    if (v >= 50) return Text.blue('新鲜食材');
    if (v >= 25) return Text.green('尚可食材');
    return Text.red('变质食材');
}
function csFuzzyText(v) {
    if (v >= 75) return Text.lightPurple('完美配比');
    if (v >= 50) return Text.blue('优秀配比');
    if (v >= 25) return Text.green('普通配比');
    return Text.red('生疏配比');
}
function csFreshText(v) {
    if (v >= 75) return Text.lightPurple('最佳');
    if (v >= 50) return Text.blue('新鲜');
    if (v >= 25) return Text.green('普通');
    return Text.red('临期');
}
// 最终评分（0~100）按同一 4 档 25% 配色
function csScoreText(v) {
    var n = Number(v);
    if (n >= 75) return Text.lightPurple('' + v);
    if (n >= 50) return Text.blue('' + v);
    if (n >= 25) return Text.green('' + v);
    return Text.red('' + v);
}

// 悬停事件
// =====================================================================
NativeEvents.onEvent(
    'net.neoforged.neoforge.event.entity.player.ItemTooltipEvent',
    function (event) {
        try {
            var stack = event.getItemStack();
            if (!stack || stack.isEmpty()) return;

            // ===== 读取三大组件 =====
            var ingredient = csReadIngredientScore(stack);
            if (ingredient === null) {
                var legacy = csReadLegacyScore(stack);
                if (legacy !== null) ingredient = Math.round(legacy * 100);
            }
            var fuzzy = csReadFuzzyRatio(stack);
            var spoil = csReadSpoilTimer(stack);
            var freshPercent = csReadFreshnessPercent(stack);
            // 食物 level（来自 food_level_data.json；无记录为 null）
            var tooltipLevel = csReadFoodLevel(stack);

            // 无任何评分/腐烂/level 数据 → 不显示（避免所有物品都弹）
            if (ingredient === null && fuzzy === null && spoil === null && tooltipLevel === null) return;

            // ===== 最终评分 =====
            var finalScore = csCalcFinalWeightedScore(
                (ingredient === null) ? null : ingredient,
                (fuzzy === null) ? null : fuzzy,
                freshPercent
            );

            var lines = event.getToolTip();
            if (!lines) return;

            // 追加到提示条末尾
            lines.add(Text.darkGray('———— 食物品鉴 ————'));
            // 食物 level（无记录则不显示）
            if (tooltipLevel !== null) {
                lines.add(
                    Text.gray('等级：')
                        .append(csLevelText(tooltipLevel))
                );
            }
            if (ingredient !== null) {
                lines.add(
                    Text.gray('原料：')
                        .append(csIngredientText(ingredient))
                );
            }
            if (fuzzy !== null) {
                lines.add(
                    Text.gray('配比：')
                        .append(csFuzzyText(fuzzy))
                );
            }
            lines.add(
                Text.gray('新鲜度：')
                    .append(csFreshText(freshPercent))
            );
        } catch (e) {
            console.error('[FoodTooltip] error: ' + e);
        }
    }
);

console.info('[FoodTooltip] 食物悬停提示条已加载');

// =====================================================================
// 【实现思路总览 · 功能 B：tooltip 档位样式】
//
// 目标：让食物 tooltip 按「最终评分档位」显示不同外观
//       （外发光 + 粒子 + 流光），且这套逻辑完全由脚本控制。
//
// 分工：
//   - Java（woktakeout mod）只做「桥」：
//       监听 Obscure Tooltips 构建 tooltip 的时机，
//       post 一个 KubeJS 客户端事件 ash_tooltip.resolveStyle(event)，
//       把脚本返回值当成样式 id 去注册表取样式并叠加。
//   - 本脚本负责「全部业务逻辑」：
//       读三大组件 -> 算最终评分 -> 映射档位 -> 返回样式 id。
//
// 数据流：
//   悬停食物
//     -> Obscure Tooltips 构建 tooltip
//     -> TooltipDefinitionMixin（Java）调用桥 AshTooltipStyleBridge
//     -> post KubeJS 事件（下面这个 resolveStyle）
//     -> 本脚本用 event.exit("ash_tooltips:gradeN") 返回值
//     -> Java 取到 id -> 注册表取样式 -> merge -> 渲染
//
// !!! 关键写法 !!!
//   1. 带返回值的事件必须用 event.exit(值) 结束，普通 return 不会被框架捕获。
//      （event.exit 内部抛 EventExit，由 KubeJS 框架 catch 后取回返回值。）
//   2. 绝不能把 event.exit 包在 try/catch 里 —— catch 会把 EventExit 吞掉，
//      框架就拿不到返回值了。所以下面的写法是「先算好、最后在最外层 exit」。
//
// 样式 id 与资源包 ash_tooltips 对应（沿用与文字档位一致的 4 档 25% 配色）：
//   ash_tooltips:grade1  红  (0~25)
//   ash_tooltips:grade2  绿  (25~50)
//   ash_tooltips:grade3  蓝  (50~75)
//   ash_tooltips:grade4  紫  (75~100)
//
// 调试：改本文件后需 `/kubejs reload client` 重载（/reload 不重载 client_scripts）。
//       日志见 [AshTooltip-Style] source=script:... / [FoodTooltip] 档位样式事件已注册
// =====================================================================

// =====================================================================
// 【档位样式】接入 Ash 桥接 mod 的客户端事件 ash_tooltip.resolveStyle
//   本 mod 会在 Obscure Tooltips 构建 tooltip 时回调本事件，
//   脚本返回一个样式 id（资源包中定义），即可让食物 tooltip 按档位变色/发光/粒子。
//   复用上面已有的 csReadXxx / csCalcFinalWeightedScore 逻辑，保证与文字档位一致。
//
//   样式 id 与资源包 ash_tooltips 对应：
//     ash_tooltips:grade1  红  (0~25)
//     ash_tooltips:grade2  绿  (25~50)
//     ash_tooltips:grade3  蓝  (50~75)
//     ash_tooltips:grade4  紫  (75~100)
// =====================================================================
// 注意：带返回值的事件必须用 event.exit(value) 结束，
//   它内部会抛出 EventExit 由 KubeJS 框架捕获以取回返回值。
//   因此【绝对不能用 try/catch 包住 event.exit】——否则异常被吞，框架拿不到返回值。
//   计算过程若需容错，用「先算好再 exit」的写法。
ash_tooltip.resolveStyle(function (event) {
    var result = '';
    var stack = event.stack;
    // 仅 level > 1（不含 1）才叠加档位样式
    var levelForGrade = csReadFoodLevel(stack);
    var needGrade = csLevelNeedsGrade(levelForGrade);
    if (stack && !stack.isEmpty() && needGrade) {
        var ingredient = csReadIngredientScore(stack);
        if (ingredient === null) {
            var legacy = csReadLegacyScore(stack);
            if (legacy !== null) ingredient = Math.round(legacy * 100);
        }
        var fuzzy = csReadFuzzyRatio(stack);
        var spoil = csReadSpoilTimer(stack);
        var freshPercent = csReadFreshnessPercent(stack);

        // 无任何评分/腐烂数据 → 不叠加特殊样式
        if (!(ingredient === null && fuzzy === null && spoil === null)) {
            var finalScore = csCalcFinalWeightedScore(
                (ingredient === null) ? null : ingredient,
                (fuzzy === null) ? null : fuzzy,
                freshPercent
            );

            var grade;
            if (finalScore >= 75) grade = 4;
            else if (finalScore >= 50) grade = 3;
            else if (finalScore >= 25) grade = 2;
            else grade = 1;

            csLog('resolveStyle grade=' + grade + ' score=' + finalScore.toFixed(2));
            result = 'ash_tooltips:grade' + grade;
        }
    }
    event.exit(result);   // 必须在最外层抛出，不能被 try/catch 包裹
});

console.info('[FoodTooltip] 档位样式事件已注册');

// =====================================================================
// 【档位 Label】接入 Ash 桥接 mod 的客户端事件 ash_tooltip.resolveLabel
//   本 mod 会在 Obscure Tooltips 查找 tooltip label（标题栏下方那一行）时回调本事件，
//   脚本返回 "颜色;文字" 即可把原本的「物品 rarity」那行替换为按评分档位的档位名。
//
//   返回格式："#RRGGBB;档位名"
//     - 颜色可省略（省略则用默认灰）：直接返回 "档位名" 即可。
//     - 支持 "#RRGGBB" 或 "#AARRGGBB"。
//     - 返回 ''（空串）-> 保持物品原本的 label（即物品自身的 rarity）。
//
//   档位名（与上面文字/样式档位一致，沿用柔和化配色）：
//     1 档 红 (#A05A5A) 劣质餐食
//     2 档 绿 (#8FC79A) 家常料理
//     3 档 蓝 (#6E90C8) 珍馐佳肴
//     4 档 紫 (#B888D8) 传世名膳
//
//   同样：带返回值的事件必须 event.exit(value)，且不能被 try/catch 包裹。
// =====================================================================
ash_tooltip.resolveLabel(function (event) {
    var result = '';
    var stack = event.stack;
    // 仅 level > 1（不含 1）才替换 label 档位
    var levelForLabel = csReadFoodLevel(stack);
    var needLabel = csLevelNeedsGrade(levelForLabel);
    if (stack && !stack.isEmpty() && needLabel) {
        var ingredient = csReadIngredientScore(stack);
        if (ingredient === null) {
            var legacy = csReadLegacyScore(stack);
            if (legacy !== null) ingredient = Math.round(legacy * 100);
        }
        var fuzzy = csReadFuzzyRatio(stack);
        var spoil = csReadSpoilTimer(stack);
        var freshPercent = csReadFreshnessPercent(stack);

        // 无任何评分/腐烂数据 → 不替换 label（保持物品 rarity）
        if (!(ingredient === null && fuzzy === null && spoil === null)) {
            var finalScore = csCalcFinalWeightedScore(
                (ingredient === null) ? null : ingredient,
                (fuzzy === null) ? null : fuzzy,
                freshPercent
            );

            var grade;
            if (finalScore >= 75) grade = 4;
            else if (finalScore >= 50) grade = 3;
            else if (finalScore >= 25) grade = 2;
            else grade = 1;

            var label;
            if (grade === 4) label = '#B888D8;传世名膳';
            else if (grade === 3) label = '#6E90C8;珍馐佳肴';
            else if (grade === 2) label = '#8FC79A;家常料理';
            else label = '#A05A5A;劣质餐食';

            csLog('resolveLabel grade=' + grade + ' label=' + label);
            result = label;
        }
    }
    event.exit(result);   // 必须在最外层抛出，不能被 try/catch 包裹
});

console.info('[FoodTooltip] 档位 Label 事件已注册');
