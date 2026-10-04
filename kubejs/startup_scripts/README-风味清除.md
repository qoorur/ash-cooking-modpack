# 移除 concoction「风味/味道」效果 —— 说明与维护文档

> 对应脚本：`kubejs/startup_scripts/concoction_strip_taste.js`
> 适用范围：`concoction`（田园调酿）模组
> 最后更新：见 git / 文件时间戳

---

## 1. 目标

**彻底移除** concoction 模组给物品附加的所有「风味/味道」效果，
**包括模组自己的食物**（即：让吃任何食物都不再获得
甜蜜 / 回复(heal) / 苦味(bitter) / 咸味(salty) / 发光 等附带效果）。

---

## 2. 背景（问题根源，基于反编译）

concoction 模组在：

```
net.mcreator.concoction.init.ConcoctionModDataComponents#modifyComponents
```

里，通过 NeoForge 的 **`ModifyDefaultComponentsEvent`**，把一批**默认数据组件**
**硬编码**挂到了一批物品上：

- 组件：`concoction:food_effect`、`food_effect_2` ~ `food_effect_5`（共 5 个）
- 组件值类型：`FoodEffectComponent(type, level, duration, hidden)`

其中原版物品的例子（完整列表见该类源码）：

| 物品 | 风味类型 | 等级 | 时长(s) |
|---|---|---|---|
| `minecraft:apple` | SWEET（甜蜜） | 1 | 15 |
| `minecraft:melon_slice` | SWEET | 1 | 30 |
| `minecraft:sweet_berries` | SWEET | 1 | 15 |
| `minecraft:cookie` | SWEET | 1 | 15 |
| `minecraft:honey_bottle` | SWEET | 2 | 30 |
| `minecraft:golden_apple` | SWEET(2) + HEAL | — | 15 |
| `minecraft:beetroot` | HEAL（回复） | 2 | — |
| `minecraft:pufferfish` | BITTER（苦味） | 2 | 90 |
| … | … | … | … |

- 吃完物品时，`net.mcreator.concoction.system.FoodTasteApplier` 读取这些组件，
  并施加对应的药水效果。
- 模组**自己的食物物品**（`CherryItem` 等）也在各自构造里挂了同名组件。

**关键点：模组没有提供任何配置开关来关闭这些效果**，所以只能由脚本/数据包移除组件。

---

## 3. 实现方式

脚本 `concoction_strip_taste.js`（**startup_scripts**）：

1. 在 `ItemEvents.modification((event) => { ... })` 回调内，
   从 `BuiltInRegistries.DATA_COMPONENT_TYPE` 解析出 5 个 `food_effect` 组件的
   `DataComponentType` 对象。
2. 遍历**全部已注册物品**（`BuiltInRegistries.ITEM` 的迭代器）。
3. 对每个**带任一 `food_effect` 组件**的物品，调用
   `event.modify(id, (mod) => mod.remove(type))` 移除全部风味组件。

结果：任何物品（原版 / 模组自己）都不再带风味组件 →
`FoodTasteApplier` 取不到组件 → 不再施加效果。

---

## 4. 关键坑（务必遵守）

1. **组件类型解析必须放在回调内部。**
   放在脚本顶部（模块级）执行太早，此时 concoction 的 DataComponentType
   可能尚未注册，`get(...)` 全部返回 `null`。
2. **移除方法名是 `remove(type)`**（源自 KubeJS `ComponentFunctions.kjs$remove`，
   `@RemapPrefixForJS("kjs$")` 去前缀后即为 `remove`）。
3. **改本脚本后必须【重启游戏】。**
   startup 脚本不受 `/reload` 影响（`/reload` 只重载服务端数据，
   `/kubejs reload startup` 亦不等价于重启注册阶段）。
4. **Rhino（KubeJS 的 JS 引擎）语法限制：**
   - 避免使用 `for...of`，统一改用**索引循环** `for (let i = 0; i < arr.length; i++)`。
   - 注意括号配对（曾因多一个 `)` 报 `syntax error`）。
5. **脚本文件编码：UTF-8 无 BOM。** 带 BOM 会导致 KubeJS 解析异常。
6. **不要**把本脚本的备份以 `.js` 后缀留在 `*_scripts/` 目录内
   （会被递归加载）——按仓库约定用 `.jsbak`。

---

## 5. 已验证的副作用（已确认，决定不处理）

concoction 另有一个 `SweetnessWorkProcedure`，其逻辑以
**「玩家当前是否带 `concoction:sweetness`（甜蜜）效果」**为前提：

- 若玩家**带甜蜜效果**：
  - 吃**甜食**（物品带 SWEET 组件）→ 额外补充饱食度
    `bonus = ceil(饱食缺口 × min(0.25 + 0.15×等级, 1.0))`；
  - 吃**非甜食** → 饱食度**惩罚**：`ceil(原营养 × 0.5)`。
- 若玩家**不带甜蜜效果** → 完全不影响，饱食度正常。

**本改动的影响：**
- 甜食判定依赖 SWEET 组件，而组件已被移除；
- 且甜蜜效果的来源（吃甜食）也被一并掐断。
- 因此正常玩法下**玩家几乎不可能再获得甜蜜效果** →
  `SweetnessWorkProcedure` **整体不触发** → **饱食度不受任何影响**。
- **唯一边缘情况**：玩家通过其他途径（药水 / 其他模组 / `/effect give`）
  获得甜蜜效果后，再吃非甜食食物，会触发 ×0.5 饱食度惩罚
  （因为甜食判定已因组件移除而全部失效）。

> 该副作用经评估为**可接受的边缘情况**，决定**不额外处理**。
> 若将来需要消除，可进一步屏蔽 `concoction:sweetness` 效果本身。

---

## 6. 回归验证

重启后，在日志中搜索 `[风味清除]`，应能看到一行：

```
[风味清除] 已移除风味组件的物品数: N（样例: minecraft:apple）
```

- `N` 为被移除风味组件的物品数（原版 + 模组自己食物），通常为几十个。
- 亦可进游戏实测：吃 `minecraft:apple` 等，**不应**再获得甜蜜效果。

---

## 7. 还原方法

1. 将 `concoction_strip_taste.js` 重命名为 `.jsbak`（停用），或整体移出
   `startup_scripts/`；
2. **重启游戏**。

（即可恢复 concoction 原始的风味效果，无需改动模组本体。）

---
*本文档随脚本一并维护；修改脚本时请同步更新本 README。*