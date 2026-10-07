// ==============================================================
// DEPENDENCIES (required mods):
//   Kaleidoscope Cookery (kaleidoscope_cookery)
//   (also covers all its addons that reuse the same Item classes,
//    e.g. kaleidoscope_nether / _end / _chinesefood / _flora / ...)
// ==============================================================
// priority: 100
// kubejs/client_scripts/kaleidoscope/remove_food_effect_tooltip.js
// =====================================================================
// 森罗物语：厨房 (kaleidoscope_cookery) —— 移除食物 tooltip 里的
// 「药水效果描述行」。
//
// 问题根源 (反编译结论):
//   FoodWithEffectsItem.appendHoverText() 与
//   BowlFoodBlockItem.appendHoverText() 里:
//
//       boolean showEffect = !effectInstances.isEmpty()
//           && CompatRegistry.SHOW_POTION_EFFECT_TOOLTIPS
//           && ClientConfig.SHOW_FOOD_EFFECT_TOOLTIPS.get();   // 客户端配置
//
//       if (QualityUtils.hasQuality(stack)) {   // 有品质
//           tooltip.add(quality.getTooltip());
//           if (showEffect) { ...显示效果... }   // 受配置控制
//       } else {                                // 无品质
//           tooltip.add(CommonComponents.space());
//           PotionContents.addPotionTooltip(effectInstances, ...);  // 无视配置，硬编码显示!
//       }
//
//   即: 无品质分支【没有判断 showEffect】，始终显示效果行。
//   所以 config/kaleidoscope_cookery-client.toml 的
//   ShowFoodEffectTooltips=false 只对「带品质」的食物生效，
//   对绝大多数普通成品(无品质)无效 —— 这就是残留 tooltip 的来源。
//
//   另外 effectInstances 是【物品注册时】从 ModFoods 静态缓存的，
//   与运行时 DataComponent / startup 清空效果无关，
//   因此脚本怎么清组件都拦不住 tooltip 里的这段。
//
// 本脚本对策:
//   客户端 ItemTooltipEvent 中，仅针对「森罗系列食物物品」
//   (FoodWithEffectsItem 及其子类 / BowlFoodBlockItem)，
//   删除其 tooltip 中的药水效果行及其前导空行。
//
// 效果行的识别:
//   PotionContents.addPotionTooltip 对每个效果生成:
//     - 最外层 key = "potion.withDuration" 或 "potion.withAmplifier"
//     - 无等级且时长短时, 直接用 "effect.<ns>.<path>"
//   因此按 key 前缀 "potion." / "effect." 匹配。
//   每个效果区块的前一行是 CommonComponents.space()(空行), 一并清除。
//
// 客户端脚本(仅在客户端渲染 tooltip)。
// 改本文件后: F3+T 或 /kubejs reload client 生效(不必重启)。
// 本文件保持纯 ASCII (中文用 \u 转义)。
// =====================================================================

// ---- 目标物品类 (森罗系列带效果食物) ----
// BowlFoodOnlyItem extends FoodWithEffectsItem, 故仅判 FoodWithEffectsItem 即可覆盖它;
// BowlFoodBlockItem 是 BlockItem, 单独判。
var KC_FOOD_WITH_EFFECTS = null;
var KC_BOWL_FOOD_BLOCK = null;
try {
    KC_FOOD_WITH_EFFECTS = Java.loadClass("com.github.ysbbbbbb.kaleidoscopecookery.item.FoodWithEffectsItem");
    console.info("[KC-FoodEffect-Tooltip] FoodWithEffectsItem resolved");
} catch (e) {
    console.info("[KC-FoodEffect-Tooltip] FoodWithEffectsItem NOT loadable: " + e);
}
try {
    KC_BOWL_FOOD_BLOCK = Java.loadClass("com.github.ysbbbbbb.kaleidoscopecookery.item.BowlFoodBlockItem");
    console.info("[KC-FoodEffect-Tooltip] BowlFoodBlockItem resolved");
} catch (e) {
    console.info("[KC-FoodEffect-Tooltip] BowlFoodBlockItem NOT loadable: " + e);
}

var KC_TRANSLATABLE = null;
try {
    KC_TRANSLATABLE = Java.loadClass("net.minecraft.network.chat.contents.TranslatableContents");
} catch (e) {
    console.info("[KC-FoodEffect-Tooltip] TranslatableContents NOT loadable: " + e);
}

// 物品是否是森罗系列带效果食物
function kcIsKaleidoscopeEffectFood(stack) {
    if (!stack || stack.isEmpty()) return false;
    try {
        var item = stack.getItem();
        if (item == null) return false;
        if (KC_FOOD_WITH_EFFECTS != null && (item instanceof KC_FOOD_WITH_EFFECTS)) return true;
        if (KC_BOWL_FOOD_BLOCK != null && (item instanceof KC_BOWL_FOOD_BLOCK)) return true;
    } catch (e) { /* ignore */ }
    return false;
}

// 这一行是否是「药水效果行」
function kcIsEffectLine(comp) {
    if (!comp) return false;
    try {
        var contents = comp.getContents();
        if (contents != null && KC_TRANSLATABLE != null && (contents instanceof KC_TRANSLATABLE)) {
            var key = String(contents.getKey());
            if (key.indexOf("potion.") === 0) return true;   // potion.withDuration / potion.withAmplifier / ...
            if (key.indexOf("effect.") === 0) return true;   // effect.<ns>.<path>
        }
    } catch (e) { /* ignore */ }
    return false;
}

// 空行(无内容 / 纯空白)
function kcIsEmptyLine(comp) {
    if (!comp) return true;
    try {
        var s = String(comp.getString());
        return s == null || s.length === 0;
    } catch (e) { /* ignore */ }
    return false;
}

NativeEvents.onEvent(
    "net.neoforged.neoforge.event.entity.player.ItemTooltipEvent",
    function (event) {
        try {
            var stack = event.getItemStack();
            if (!kcIsKaleidoscopeEffectFood(stack)) return;

            var lines = event.getToolTip();
            if (!lines) return;

            // 从后往前删, 避免索引错位。
            // 效果行由 PotionContents.addPotionTooltip 生成, 在无品质分支里,
            // 它们整体前面有一个 CommonComponents.space()(空行)。
            // 找到效果行后, 一并删掉它上方紧邻的那个空行(且仅删一个)。
            for (var i = lines.size() - 1; i >= 0; i--) {
                if (kcIsEffectLine(lines.get(i))) {
                    lines.remove(i);
                    if (i - 1 >= 0 && kcIsEmptyLine(lines.get(i - 1))) {
                        lines.remove(i - 1);
                        i--; // 上方空行已删, 修正外层计数
                    }
                }
            }
        } catch (e) {
            console.error("[KC-FoodEffect-Tooltip] error: " + e);
        }
    }
);

console.info("[KC-FoodEffect-Tooltip] kaleidoscope food effect tooltip remover loaded");
