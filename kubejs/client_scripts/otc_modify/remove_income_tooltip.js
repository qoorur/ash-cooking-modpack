// ==============================================================
// DEPENDENCIES (required mods):
//   OrderToCook (ordertocook)
// ==============================================================
// priority: 100
// kubejs/client_scripts/otc_modify/remove_income_tooltip.js
// =====================================================================
// OrderToCook: remove the "expected income" tooltip line.
// The mod adds, in TakeoutBagItem.appendHoverText():
//     Component.translatable("tooltip.ordertocook.coin_reward", <int>)
// Since the real reward is custom, hide that line.
//
// Primary match  : translation key == tooltip.ordertocook.coin_reward
// Fallback match : rendered text contains the Chinese marker (see below)
//
// Client-side only (tooltips render on the client).
// This file is kept pure ASCII; the Chinese marker uses \u escapes.
// =====================================================================

var OTC_TOOLTIP_KEY = "tooltip.ordertocook.coin_reward";
var OTC_INCOME_MARK = "\u8ba2\u5355\u6536\u76ca"; // "order income"

// Try to resolve the TranslatableContents class once (may or may not be
// loadable depending on the class filter).
var OTC_TRANSLATABLE = null;
try {
    OTC_TRANSLATABLE = Java.loadClass("net.minecraft.network.chat.contents.TranslatableContents");
    console.info("[OTC-Tooltip] TranslatableContents class resolved");
} catch (e) {
    console.info("[OTC-Tooltip] TranslatableContents not loadable, will use text fallback: " + e);
}

function otcIsIncomeLine(comp) {
    if (!comp) return false;
    // 1) translation key match (preferred, language-independent)
    try {
        var contents = comp.getContents();
        if (contents != null && OTC_TRANSLATABLE != null && (contents instanceof OTC_TRANSLATABLE)) {
            var key = String(contents.getKey());
            if (key === OTC_TOOLTIP_KEY) return true;
        }
    } catch (e) { /* ignore, fall through */ }
    // 2) rendered-text fallback
    try {
        var s = String(comp.getString());
        if (s.indexOf(OTC_INCOME_MARK) !== -1) return true;
    } catch (e) { /* ignore */ }
    return false;
}

NativeEvents.onEvent(
    "net.neoforged.neoforge.event.entity.player.ItemTooltipEvent",
    function (event) {
        try {
            var lines = event.getToolTip();
            if (!lines) return;
            for (var i = lines.size() - 1; i >= 0; i--) {
                if (otcIsIncomeLine(lines.get(i))) {
                    lines.remove(i);
                }
            }
        } catch (e) {
            console.error("[OTC-Tooltip] error: " + e);
        }
    }
);

console.info("[OTC-Tooltip] income tooltip remover loaded");

