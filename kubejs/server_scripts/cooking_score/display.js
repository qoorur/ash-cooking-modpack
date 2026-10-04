// ==============================================================
// DEPENDENCIES (required mods):
//   KubeJS only; depends on score_api.js (ssXxx functions)
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/display.js
// 主手木棍左键时，读取副手食物的三大组件数据，聊天栏显示
//   组件1 ingredient_score ：原料 spoil（0~100，文本 + 分数）
//   组件2 fuzzy_ratio      ：配比（0~100，文本 + 分数；可能为空）
//   组件3 （实时）          ：成品自身 spoiled:spoil_timer 新鲜度（0~100，仅文本）
//   最终评分 = 各非空组件按权重 25/50/25 归一化加权
// 数据读取与等级转换由 ssXxx 系列函数提供

ItemEvents.firstLeftClicked('minecraft:stick', function (event) {
    var player = event.player;
    if (!player) return;
    if (player.level.clientSide) return;

    var offhand = null;
    try { offhand = player.offHandItem; } catch (e) {}
    if (!offhand) {
        try { offhand = player.getOffhandItem(); } catch (e) {}
    }

    if (!offhand || offhand.isEmpty()) {
        player.tell(Text.gray('[食物品鉴] 副手没有物品'));
        return;
    }

    // ===== 读取三大组件 =====
    // 组件1：原料分（0~100）
    var ingredient = ssReadIngredientScore(offhand);
    // 组件2：配比（0~100）
    var fuzzy = ssReadFuzzyRatio(offhand);
    // 兼容旧数据：若没有 ingredient_score，退化为旧 score（0~1 → 0~100）
    if (ingredient === null) {
        var legacy = ssReadScore(offhand);
        if (legacy !== null) ingredient = Math.round(legacy * 100);
    }
    // 组件3：成品自身新鲜度（0~100，实时读取）
    var freshPercent = ssReadFreshnessPercent(offhand);
    var spoil = ssReadSpoilTimer(offhand);


    if (ingredient === null && fuzzy === null && spoil === null) {
        player.tell(
            Text.gray('[食物品鉴] ')
                .append(ssGetItemDisplayNameObj(offhand))
                .append(Text.gray(' 没有可展示的数据'))
        );
        return;
    }

    var displayNameObj = ssGetItemDisplayNameObj(offhand);

    // ===== 最终评分（归一化加权） =====
    var ingredientForCalc = (ingredient === null) ? null : ingredient;
    var fuzzyForCalc      = (fuzzy === null) ? null : fuzzy;
    var freshForCalc      = freshPercent; // 无 spoil 时 ssReadFreshnessPercent 已返回 100，始终计入
    var finalScore        = ssCalcFinalWeightedScore(ingredientForCalc, fuzzyForCalc, freshForCalc);

    // ===== 输出 =====
    player.tell(Text.darkGray('                              ').strikethrough(true));

    player.tell(
        Text.gold('[食物品鉴] ')
            .append(displayNameObj)
    );


    // 组件1：原料 spoil（文本 + 分数）
    if (ingredient !== null) {
        player.tell(
            Text.gray('原料：')
                .append(ssGetIngredientTextObj(ingredient))
                .append(Text.gray(' (' + ingredient + '/100)'))
        );
    } else {
        player.tell(Text.gray('原料：').append(Text.darkGray('无数据')));
    }

    // 组件2：配比（文本 + 分数；为空时显示无数据，保证三项齐全）
    if (fuzzy !== null) {
        player.tell(
            Text.gray('配比：')
                .append(ssGetFuzzyTextObj(fuzzy))
                .append(Text.gray(' (' + fuzzy + '/100)'))
        );
    } else {
        player.tell(Text.gray('配比：').append(Text.darkGray('无数据')));
    }

    // 组件3：成品新鲜度（文本 + 分数）
    player.tell(
        Text.gray('新鲜度：')
            .append(ssGetFreshnessTextObj(freshPercent))
            .append(Text.gray(' (' + Math.round(freshPercent) + '/100)'))
    );

    // 最终评分
    player.tell(
        Text.gray('最终评分：')
            .append(ssGetScoreTextObj(finalScore.toFixed(1)))
            .append(Text.gray('/100'))
    );

    player.tell(Text.darkGray('                              ').strikethrough(true));
});