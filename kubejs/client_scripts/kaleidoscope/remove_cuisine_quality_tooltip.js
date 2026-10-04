// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery)
// ==============================================================
// priority: 100
// kubejs/client_scripts/kaleidoscope/remove_cuisine_quality_tooltip.js
// =====================================================================
// 森罗物语：厨房 (kaleidoscope_cookery) —— 移除食物自带的“配比/品质”tooltip 行。
//
// 模组逻辑:
//   BowlFoodBlockItem.appendHoverText() 与 FoodWithEffectsItem.appendHoverText()
//   在物品带有 quality 组件时执行:
//       tooltip.add(QualityUtils.getQuality(stack).getTooltip());
//   而 Quality.getTooltip() 返回:
//       Component.translatable("tooltip.kaleidoscope_cookery.cuisine_quality.<name>")
//     name 取值: superb / excellent / standard / poor
//     对应中文: 极佳 / 优秀 / 普通 / 生疏
//
// 因此以翻译键前缀 "tooltip.kaleidoscope_cookery.cuisine_quality." 精确匹配删除。
// 采用翻译键匹配而非文本匹配 —— 不受语言/汉化影响，最稳。
//
// 客户端脚本(仅在客户端渲染 tooltip)，F3+T 或 /reload 生效。
// 本文件保持纯 ASCII。
// =====================================================================

var KC_QUALITY_KEY_PREFIX = "tooltip.kaleidoscope_cookery.cuisine_quality.";

var KC_TRANSLATABLE = null;
try {
    KC_TRANSLATABLE = Java.loadClass("net.minecraft.network.chat.contents.TranslatableContents");
    console.info("[KC-Quality-Tooltip] TranslatableContents class resolved");
} catch (e) {
    console.info("[KC-Quality-Tooltip] TranslatableContents not loadable: " + e);
}

function kcIsQualityLine(comp) {
    if (!comp) return false;
    try {
        var contents = comp.getContents();
        if (contents != null && KC_TRANSLATABLE != null && (contents instanceof KC_TRANSLATABLE)) {
            var key = String(contents.getKey());
            if (key.indexOf(KC_QUALITY_KEY_PREFIX) === 0) return true;
        }
    } catch (e) { /* ignore, fall through */ }
    return false;
}

NativeEvents.onEvent(
    "net.neoforged.neoforge.event.entity.player.ItemTooltipEvent",
    function (event) {
        try {
            var lines = event.getToolTip();
            if (!lines) return;
            for (var i = lines.size() - 1; i >= 0; i--) {
                if (kcIsQualityLine(lines.get(i))) {
                    lines.remove(i);
                }
            }
        } catch (e) {
            console.error("[KC-Quality-Tooltip] error: " + e);
        }
    }
);

console.info("[KC-Quality-Tooltip] cuisine quality tooltip remover loaded");