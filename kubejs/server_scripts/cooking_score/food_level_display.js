// ==============================================================
// DEPENDENCIES (required mods):
//   KubeJS only (level 数据由 startup_scripts/cooking_score/food_level.js 提供)
// ==============================================================
// priority: 0
// kubejs/server_scripts/cooking_score/food_level_display.js
// 主手木棍左键时，读取副手食物的 level（食物等级），聊天栏显示。
//   level 数据来源：global.FOOD_LEVEL_MAP（startup 由 food_level_data.json 载入）
//   展示：物品名 + level（按数值配色）
// =====================================================================

// level 文本配色（数值越大越"高级"）
function flcLevelTextObj(level) {
    var n = Number(level);
    if (n >= 4.0) return Text.lightPurple('' + level);
    if (n >= 3.0) return Text.gold('' + level);
    if (n >= 2.0) return Text.blue('' + level);
    if (n > 1.0)  return Text.green('' + level);
    return Text.gray('' + level); // level 1 及以下
}

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
        player.tell(Text.gray('[食物等级] 副手没有物品'));
        return;
    }

    var itemId = null;
    try { itemId = '' + offhand.id; } catch (e) {}
    var level = null;
    try { level = global.getFoodLevel(itemId); } catch (e) {}

    var nameObj = ssGetItemDisplayNameObj(offhand);

    if (level === null) {
        player.tell(
            Text.gray('[食物等级] ')
                .append(nameObj)
                .append(Text.gray(' 没有 level 数据'))
        );
        return;
    }

    player.tell(Text.darkGray('                              ').strikethrough(true));
    player.tell(
        Text.gold('[食物等级] ')
            .append(nameObj)
    );
    player.tell(
        Text.gray('level：')
            .append(flcLevelTextObj(level))
    );
    player.tell(Text.darkGray('                              ').strikethrough(true));
});