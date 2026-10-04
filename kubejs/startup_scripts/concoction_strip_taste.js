// ==============================================================
// DEPENDENCIES (required mods):
//   Concoction (concoction)
// ==============================================================
// priority: 1000
// ============================================================
// 移除 concoction(田园调酿) 给物品附加的「风味/味道」效果 (startup)
//
// 背景（反编译结论）：
//   concoction 模组在 net.mcreator.concoction.init.ConcoctionModDataComponents
//   里，通过 ModifyDefaultComponentsEvent 给一批【原版物品】硬编码了默认数据组件
//   concoction:food_effect ~ concoction:food_effect_5。
//   吃完时 FoodTasteApplier 读取这些组件并施加对应药水效果（甜蜜/回复/苦味…）。
//   模组自己的食物物品（CherryItem 等）也在其构造里挂同名组件。
//
// 需求：彻底移除【所有】物品上的这些风味组件（含模组自己的食物）。
// 做法：startup 的 ItemEvents.modification 阶段（此时所有模组物品/组件已注册），
//       遍历全部物品，凡带任一 food_effect 组件的，用 item.remove(type) 移除。
//
// 注意：
//   1) 本事件必须在 startup_scripts（ModifyDefaultComponents 属启动期）。
//   2) 组件类型解析必须放在【回调内部】，顶部代码执行太早会查不到（全 NULL）。
//   3) 改本脚本后需【重启游戏】生效（startup 脚本 /reload 不重载）。
// ============================================================

console.info('(Loaded concoction_strip_taste scripts)')

const BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')

// 需要清除的组件 id
const TASTE_IDS = [
  'concoction:food_effect',
  'concoction:food_effect_2',
  'concoction:food_effect_3',
  'concoction:food_effect_4',
  'concoction:food_effect_5'
]

ItemEvents.modification(event => {
  // ---- 解析组件类型（放回调内，确保已注册）----
  let tasteTypes = []
  TASTE_IDS.forEach(id => {
    let t = null
    try { t = BuiltInRegistries.DATA_COMPONENT_TYPE.get(id) } catch (e) { t = null }
    if (t != null) tasteTypes.push(t)
  })

  if (tasteTypes.length === 0) {
    console.error('[风味清除] 未解析到任何 food_effect 组件类型，跳过（请确认 concoction 已加载）')
    return
  }

  let stripped = 0
  let firstSample = ''

  // 遍历全部已注册物品
  let it = BuiltInRegistries.ITEM.iterator()
  while (it.hasNext()) {
    let item = it.next()

    let id
    try {
      id = BuiltInRegistries.ITEM.getKey(item).toString()
    } catch (e) {
      id = null
    }
    if (!id) continue

    // 该物品是否带任一 food_effect 组件
    let hasTaste = false
    for (let ti = 0; ti < tasteTypes.length; ti++) {
      let v = null
      try {
        v = item.components().get(tasteTypes[ti])
      } catch (e) {
        v = null
      }
      if (v != null) { hasTaste = true; break }
    }
    if (!hasTaste) continue

    // 移除该物品上的所有风味组件
    let theId = id
    event.modify(theId, mod => {
      for (let ti2 = 0; ti2 < tasteTypes.length; ti2++) {
        try {
          mod.remove(tasteTypes[ti2])
        } catch (e) {
          console.error('[风味清除] remove 失败 (' + theId + '): ' + e)
        }
      }
    })
    stripped++
    if (firstSample === '') firstSample = theId
  }

  console.info('[风味清除] 已移除风味组件的物品数: ' + stripped + (firstSample ? '（样例: ' + firstSample + '）' : ''))
})