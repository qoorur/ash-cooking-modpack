// ==============================================================
// DEPENDENCIES (required mods):
//   Spoiled (spoiled)
// ==============================================================
// priority: 100
// kubejs/client_scripts/spoil/remove_spoil_tooltip.js
// =====================================================================
// Spoiled 模组: 移除其自带的“新鲜度/腐烂”tooltip 行。
//
// 模组逻辑 (com.mrbysco.spoiled.handler.TooltipHandler):
//   监听 ItemTooltipEvent，向 tooltip 末尾 add:
//       TooltipUtil.getTooltip(stack)
//   该方法在物品带有组件 "spoiled:spoil_timer" 时返回一个
//   TranslatableContents 组件，其翻译键为:
//       "spoiled.spoiling"        (开启 showPercentage 时)
//       "spoiled.spoiling.0"      Fresh / 新鲜
//       "spoiled.spoiling.25"     (空文本)
//       "spoiled.spoiling.50"     Stale
//       "spoiled.spoiling.75"     Stale
//       "spoiled.spoiling.100"    Rotten / 腐烂
//
// 因为部分翻译文本为空字符串，不能靠 getString() 判断，
// 故以翻译键 key.startsWith("spoiled.spoiling") 精确匹配并删除。
//
// 客户端脚本(仅在客户端渲染 tooltip)，F3+T 或 /reload 生效。
// 本文件保持纯 ASCII。
// =====================================================================

var SPOIL_TOOLTIP_KEY_PREFIX = "spoiled.spoiling";

var SPOIL_TRANSLATABLE = null;
try {
    SPOIL_TRANSLATABLE = Java.loadClass("net.minecraft.network.chat.contents.TranslatableContents");
    console.info("[Spoil-Tooltip] TranslatableContents class resolved");
} catch (e) {
    console.info("[Spoil-Tooltip] TranslatableContents not loadable: " + e);
}

function spoilIsSpoilLine(comp) {
    if (!comp) return false;
    try {
        var contents = comp.getContents();
        if (contents != null && SPOIL_TRANSLATABLE != null && (contents instanceof SPOIL_TRANSLATABLE)) {
            var key = String(contents.getKey());
            if (key.indexOf(SPOIL_TOOLTIP_KEY_PREFIX) === 0) return true;
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
                if (spoilIsSpoilLine(lines.get(i))) {
                    lines.remove(i);
                }
            }
        } catch (e) {
            console.error("[Spoil-Tooltip] error: " + e);
        }
    }
);

console.info("[Spoil-Tooltip] spoil tooltip remover loaded");