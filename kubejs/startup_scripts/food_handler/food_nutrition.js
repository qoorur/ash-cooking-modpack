// ==============================================================
// DEPENDENCIES (required mods):
//   (none - pure KubeJS)
// ==============================================================
// priority: 100
// ============================================================
// 食物效果清空脚本 (startup)
// 目标：清空所有食物"吃完后的 buff / debuff"效果。
//   - 不读取任何配置文件
//   - 不修改营养值(nutrition) / 饱和度(saturation)（保持原样）
//   - 仅把食物原有的食用效果列表清空
//
// 做法：用空的 FoodBuilder（效果列表为空）重建 FoodProperties，
//       并把原营养/饱和度原样带过去，再 setFood 覆盖回物品。
//
// 注意：ItemEvents.modification 是 startup 事件，必须放在 startup_scripts。
// ============================================================

console.info('(Loaded food_effect_strip scripts)')

// KubeJS 的 FoodBuilder 类（用于重建食物属性、清空效果）
const FoodBuilder = Java.loadClass('dev.latvian.mods.kubejs.item.FoodBuilder')

// ---- 运行时读取某物品当前的营养/饱和度 -----------------------------------
// 传入一个 ItemStack；返回值：{ nutrition, saturation } 或 null（无食物组件/读取失败）
function readCurrentFoodProps(stack) {
  try {
    if (!stack || stack.isEmpty()) return null

    let food = null
    try {
      let DataComponents = Java.loadClass('net.minecraft.core.component.DataComponents')
      food = stack.get(DataComponents.FOOD)
    } catch (e1) {
      food = null
    }
    if (food == null) {
      try {
        food = stack.getFoodProperties(null)
      } catch (e2) {
        food = null
      }
    }

    // 无食物组件 => 非食物
    if (food == null) return null

    let nutrition = (typeof food.nutrition === 'function') ? Number(food.nutrition()) : 0
    let saturation = (typeof food.saturation === 'function') ? Number(food.saturation()) : 0
    return { nutrition: nutrition, saturation: saturation }
  } catch (e) {
    return null
  }
}

ItemEvents.modification(event => {
  let changed = 0

  // 遍历所有物品，凡是带 food 组件的，就清空其食用效果。
  Ingredient.all.getItemIds().forEach(id => {
    let original = null
    try {
      // 用一个默认实例读取其食物属性；没有食物组件则跳过
      original = readCurrentFoodProps(Item.of(id))
    } catch (e) {
      original = null
    }
    if (original == null) return  // 非食物，跳过

    const nutrition = original.nutrition
    const saturation = original.saturation
    event.modify(id, item => {
      if (typeof item.setFood === 'function') {
        // 用空效果列表重建，nutrition / saturation 保持原值
        let fb = new FoodBuilder()
        fb.nutrition(nutrition)
        fb.saturation(saturation)
        item.setFood(fb.build())   // 空效果 => 清空原有 buff / debuff
      }
    })
    changed++
  })

  console.info('[食物效果清空] 已清空 ' + changed + ' 个食物的食用效果')
})
