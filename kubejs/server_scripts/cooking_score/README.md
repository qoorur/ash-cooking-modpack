# 森罗物语厨房 - 锅具评分系统 说明文档

> 本文档说明 `stockpot_score.js`（汤锅）、`wok_score.js`（炒锅）与 `steamer_score.js`（蒸笼）的工作机制。
> 三者都依赖同目录下的 `score_api.js` 提供算分与写分能力。

---

## 一、整体目标

给玩家做出来的菜根据**三大组件**打分，展示时算出最终评分（不再写物品名，改为木棍检索显示）。

- **组件1 原料（ingredient_score）**：任意食材新鲜度 <20% → 取最低；否则取平均 (a+b)/2。0~100 整数。
- **组件2 配比（fuzzy_ratio）**：成品 quality 映射 superb=100/excellent=75/standard=50/poor=25；仅炒锅/煎锅有，汤锅/蒸笼为空。0~100 整数。
- **组件3 新鲜度（不写）**：成品自身 `spoiled:spoil_timer`（spoiled 模组维护，实时读）。0~100。
- **最终评分（几何平均，display 实时算）**：加权几何平均
  `最终分 = exp( (Σ log(组件) × 权重) / Σ权重 )`，权重 组件1=0.25 / 组件2=0.50 / 组件3=0.25；
  组件为空（null）则不参与，权重按参与组件归一化。
  - 特性：**短板决定下限**——任一组件趋近 0，总分急剧趋近 0（无法被其他高分组补偿）。
  - 注意：组件 = 0 时 总分 = 0（log(0) = -∞）；全为空 → 100。
  - 显示组件时仍显示**真实值**，不改变输入。
- **写入内容**：只写 `ingredient_score`、`fuzzy_ratio`（不写 score / 组件3 / 最终分）。
- **显示（两种）**：
  - **木棍左键**副手食物 → 聊天栏显示（`display.js`，server 脚本）
  - **鼠标悬停**食物 → 物品提示条显示（`client_scripts/cooking_score/tooltip.js`，client 脚本）
  - 两种都输出组件1/2/3 的文本与分数 + 最终评分
- **注意**：tooltip 是客户端渲染，必须在 `client_scripts` 中监听
  `ItemTooltipEvent`；客户端读不到 server 的 `ssXxx` 函数，故 tooltip.js 自带一份精简读数逻辑。

### 品质 / 味道 等级表（来自 `score_api.js`）

| 分数区间 | 味道文本 | 品质文本 |
|---|---|---|
| ≥ 0.95 | §6绝世美味 | `superb` → §6极佳 |
| ≥ 0.85 | §e鲜美可口 | `excellent` → §a优秀 |
| ≥ 0.70 | §a味道尚佳 | `standard` → §f普通 |
| ≥ 0.50 | §f普普通通 | `poor` → §7生疏 |
| ≥ 0.30 | §7略显陈旧 | |
| ≥ 0.15 | §8不太新鲜 | |
| < 0.15 | §4变质边缘 | |

---

## 二、汤锅（stockpot_score.js）工作原理

### 方块 ID
`kaleidoscope_cookery:stockpot`

### 方案：事件驱动（推荐范式）

汤锅使用**事件驱动**：监听森罗物语提供的配方匹配事件，
在**配方匹配成功、开始烹饪的那一瞬间**算分并写分。**没有 tick 轮询**。

### 触发链路

```
玩家在汤锅放料 → 配方匹配成功
      ↓
NeoForge 事件总线触发 StockpotMatchRecipeEvent$Post
      ↓
我们的监听器 accept(ev) 被调用（见 handleMatch）
```

### 事件监听的关键写法

```js
// 关键点：用 3 参重载 addListener(priority, Class, Consumer) 显式传事件类型，
//         绕过 KubeJS 对泛型事件的推断问题。$Post 是内部类，名字要带 $。
const PostClass = Java.loadClass(
  'com.github.ysbbbbbb.kaleidoscopecookery.api.event.StockpotMatchRecipeEvent$Post');
const NeoForge = Java.loadClass('net.neoforged.neoforge.common.NeoForge');
const EventPriority = Java.loadClass('net.neoforged.bus.api.EventPriority');
const Consumer = Java.loadClass('java.util.function.Consumer');

const listener = new Consumer({
  accept: function (ev) { handleMatch(ev); }
});
NeoForge.EVENT_BUS.addListener(EventPriority.NORMAL, PostClass, listener);
```

### handleMatch 处理流程

| 步骤 | 说明 |
|---|---|
| 1. 取数据 | `ev.getStockpot()` 拿锅实体，`ev.getLevel()` 拿世界 |
| 2. 状态校验 | `stockpot.getStatus() === 1`（烹饪中）才处理 |
| 3. 读 NBT | `stockpot.saveWithFullMetadata(...)` 序列化读食材新鲜度 |
| 4. 防重复 | `hasScore(nbt)`——成品已写过分则跳过 |
| 5. 算分 | `ssCalcScoreFromNbt(nbt)` → 输入食材最低新鲜度 |
| 6. 取成品 | `stockpot.getResult()`（此时已就绪、非空） |
| 7. 写分 | `ssApplyScoreToItem(result, score)` 写 `custom_data` + `custom_name` |
| 8. 同步 | `setChanged()` + `level.sendBlockUpdated(...)` |

### 状态值参考（汤锅）

| 值 | 含义 |
|---|---|
| 1 | 烹饪中（本脚本在此刻写分） |
| 2 | 完成 |

### 实测要点

- 配方匹配事件触发时 `status=1`，`getResult()` 已就绪（非空）。
- `getResult()` 返回的是**锅内的成品 stack 引用**，对其写入 component 后，
  玩家取出到手中**分数与名字都会保留**（已实测通过）。

---

## 三、炒锅（wok_score.js）工作原理

### 方块 ID
`kaleidoscope_cookery:pot`

### 方案：烹饪完成事件（首选）+ 玩家右键（兜底）

**炒锅没有配方匹配事件**（森罗物语只为汤锅、石磨提供了 `*MatchRecipeEvent`），
因此无法在“开始烹饪”瞬间触发。

为此本整合包附带了一个桥接 mod **`ash_kaleidoscope_kitchen_wok`**
（详见 mod 自带 README），它通过 Mixin 注入炒锅方块实体，
在**烹饪完成、成品刚做好的瞬间**向 KubeJS 触发 `ash_wok.cooked` 事件。

脚本据此采用**双入口**：

| 入口 | 时机 | 作用 |
|---|---|---|
| 1. `ash_wok.cooked`（首选） | 成品刚做好（`status` 变为 `FINISHED`） | 完成即写分。**与取出方式无关**，天然兼容 玩家右键 / 机械臂 / 女仆 / 管道 |
| 2. `BlockEvents.rightClicked`（兜底） | 玩家右键取出时 | 若入口 1 因故未覆盖到，在取出瞬间补写 |

两个入口共用 `applyScoreIfNeeded()`，`hasScore(nbt)` 已写则跳过，**不会重复写分**。

### 状态常量（实测）

| 值 | 常量 | 含义 |
|---|---|---|
| 0 | `ST_PUT` | 空闲 / 放料 |
| 1 | `ST_COOKING` | 烹饪中（此时 result 已就绪） |
| 2 | `ST_FINISHED` | 完成（可取出） |
| 3 | `ST_BURNT` | 烧焦 |

### 触发链路

```
（入口 1）烹饪倒计时归零，status → FINISHED(2)
      ↓
mod 的 PotBlockEntityMixin 在 tickCooking RETURN 处 post(ash_wok.cooked)
      ↓
脚本 applyScoreIfNeeded(pot, level, result, '烹饪完成')  ← 完成即写分
      ↓
之后无论谁取出（右键 / 机械臂 / 女仆 / 管道），拿到的都是已带分的成品

（入口 2，兜底）玩家右键取出
      ↓
BlockEvents.rightClicked('kaleidoscope_cookery:pot')
      ↓
检查 getStatus() === 2（FINISHED）→ 补写
```

### 处理流程（两个入口共用）

| 步骤 | 说明 |
|---|---|
| 1. 状态校验 | 仅 `status === 2`（FINISHED）处理；放料/翻铲不会命中 |
| 2. 读 NBT | `saveWithFullMetadata(...)` |
| 3. 防重复 | `hasScore(nbt)` 已写则跳过 |
| 4. 取成品 | `getResult()`，必须非空 |
| 5. 算分 | `ssCalcScoreFromNbt(nbt)` |
| 6. 写分 | `ssApplyScoreToItem(result, score)` |
| 7. 同步 | `setChanged()` + `level.sendBlockUpdated(...)` |

### 实测要点

- 烹饪完成事件触发时 `status=2`，`result` 已就绪。
- 写分发生在**成品刚做好**的瞬间，因此**任何取出方式**（玩家右键、Create 机械臂、
  女仆餐厅、漏斗管道等）拿到的成品都带分（已实测通过）。
- 玩家右键入口作为兜底：`rightClicked` 在 `takeOutProduct` **之前**触发，
  此时成品仍在锅内，对其写入的 component 会被 `takeOutProduct` 带出。

---

## 三之二、蒸笼（steamer_score.js）工作原理

### 方块 ID
`kaleidoscope_cookery:steamer`（方块实体 `SteamerBlockEntity`）

### 方案：烹饪完成事件（桥接 mod，单格粒度）

蒸笼**没有**类似汤锅的配方匹配事件；且与炒锅不同，蒸笼是**多槽位**结构：

- 一个蒸笼方块实体有 **8 个槽位**（半高时 4 个），每格独立计时、独立完成。
- 每格：`items[i]`（放料后是食材，完成后被**原地替换**为成品）、
  `cookingTime[i]`（完成后置 **-1** 作为「已熟」标志）、`cookingProgress[i]`。
- **没有**单一 `result` / `status`；成品直接在 `items` 数组里，等待 `takeFood` 取出。

桥接 mod `ash_kaleidoscope_kitchen_wok` 通过 `SteamerBlockEntityMixin` 注入
`SteamerBlockEntity#cookingTick` 的 RETURN，在**某格刚蒸熟**那一刻触发 KubeJS 事件
`ash_steamer.cooked`，**每格只触发一次**。

### 输入食材新鲜度（关键差异）

炒锅/汤锅完成时 `Inputs` 仍在 NBT 中，可直接读食材新鲜度；
**蒸笼完成时原食材已被替换成成品，无法从成品反推**。

因此桥接层做了额外处理：

| 阶段 | 处理 |
|---|---|
| 放料（`placeFood`） | 预读待放食材的 `spoiled:spoil_timer` 新鲜度，记录到该槽 `inputFreshness[i]` |
| 记录持久化 | 新鲜度数组随方块实体 NBT 存档（`ash_steamer_input_freshness`，新鲜度×10000 存 int） |
| 完成（`cookingTick`） | 通过事件字段 `event.inputFreshness`（0~1；未知 -1）带出 |
| 取出（`takeFood`） | 清空对应槽的记录，避免残留到下批食材 |

> 与炒锅/汤锅「食材新鲜度随 `Inputs` 持久化」语义对齐：区块卸载/重载不丢分。

### 事件字段（`ash_steamer.cooked`）

```javascript
ash_steamer.cooked(event => {
    event.level;            // ServerLevel
    event.pos;              // BlockPos：蒸笼位置
    event.steamer;          // SteamerBlockEntity
    event.slot;             // int：完成的槽位下标 0..7
    event.result;           // ItemStack：该槽成品（引用，可直接写数据）
    event.inputFreshness;   // double：该槽输入食材新鲜度 0..1（未知 -1）
});
```

### 处理流程（steamer_score.js）

| 步骤 | 说明 |
|---|---|
| 1. 取数据 | `event.level / steamer / result / inputFreshness` |
| 2. 防重复 | 成品已带 `ingredient_score` 则跳过 |
| 3. 算组件1 | `Math.round(inputFreshness * 100)`（单格即该值本身） |
| 4. 写分 | `ssApplyComponentsToItem(result, ingredientScore, null)`（组件2 恒空） |
| 5. 同步 | `setChanged()` + `level.sendBlockUpdated(...)` |

### 评分组件（蒸笼）

| 组件 | 是否写入 | 来源 |
|---|---|---|
| 1 原料 `ingredient_score` | ✅ | `event.inputFreshness × 100` |
| 2 配比 `fuzzy_ratio` | ❌ 恒空 | 蒸笼无品质/配比（`SteamerRecipe` 无 quality） |
| 3 新鲜度 | （display 实时算） | 成品自身 `spoiled:spoil_timer` |

### 实测要点

- 完成事件在某格 `cookingTime[i]` 变为 `-1` 时触发，此时成品已写入 `items[i]`。
- 写分发生在**成品刚蒸熟**瞬间，之后无论玩家右键 / 机械臂 / 女仆 / 管道取出，
  拿到的都是已带分的成品。

---
## 四、辅助功能

### 评分 API（`score_api.js`）

统一的算分 / 读分 / 写分函数库，供各锅具、砧板脚本复用：

```
score_api.js （priority: 100）
   ├─ ssCalcScoreFromNbt(nbt)          // 从 NBT 算分
   ├─ ssApplyScoreToItem(stack, score) // 写 score + custom_name
   ├─ ssReadSpoilTimer(stack)          // 读食材腐烂计时（砧板脚本用）
   └─ 等级表 / 文本渲染函数
```

---

## 五、依赖关系

```
score_api.js （priority: 100）
   ├─ ssCalcScoreFromNbt(nbt)
   ├─ ssApplyScoreToItem(stack, score)
   ├─ ssReadSpoilTimer(stack)
   └─ 等级表 / 文本渲染函数

stockpot_score.js            （priority: 0）  依赖上面的 ssXxx
wok_score.js        （priority: 0）  依赖上面的 ssXxx + mod 的 ash_wok.cooked 事件
steamer_score.js     （priority: 0）  依赖上面的 ssXxx + mod 的 ash_steamer.cooked 事件
cutting_board_spoil.js （priority: 50） 依赖 ssReadSpoilTimer
```

> priority 越大越早加载。`score_api.js` 必须先于使用者加载，
> 因此 priority 设为 100。

---

## 六、调试开关

| 脚本 | 开关 | 说明 |
|---|---|---|
| `stockpot_score.js` | `const DEBUG = false` | 改 `true` 打印 `[SpoilScore]` 日志 |
| `wok_score.js` | `const DEBUG = false` | 改 `true` 打印 `[SpoilScore]` 日志 |
| `steamer_score.js` | `const DEBUG = false` | 改 `true` 打印 `[SpoilScore]` 日志 |
| `score_api.js` | `const SS_DEBUG = false` | 改 `true` 打印 `[SpoilScoreAPI]` 明细（食材新鲜度、写入过程等） |

开启后会打印注册、算分、写分等过程信息，排查问题时使用。

---

## 七、常见排查点

| 现象 | 可能原因 |
|---|---|
| 成品没分 | 事件未触发 / 状态判断不符 / `getResult()` 为空 |
| 炒锅 `ash_wok is not defined` | 桥接 mod `ash_kaleidoscope_kitchen_wok` 未安装或未加载 |
| 蒸笼 `ash_steamer is not defined` | 同上（桥接 mod 未安装 / 未加载 / 版本过旧） |
| 蒸笼成品无「原料分」 | 放料时食材无 `spoiled:spoil_timer`（按未知 -1 处理，组件1 不写） |
| 分数一直不变 | 输入食材本身无 `spoiled:spoil_timer`（按 100% 计） |
| 中文乱码（脚本文件） | 文件被存成带 BOM 或非 UTF-8，务必保存为 UTF-8 无 BOM |

---

*文档随脚本实现更新。若修改了触发方式/状态值，请同步更新本文档。*