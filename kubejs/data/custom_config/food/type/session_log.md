# 食物 / 食材 / Level 系统 —— 完整会话记录

> 项目：Minecraft 1.21.1 NeoForge 整合包（"Ash Cooking"）
> 工作版本目录：`D:\Ash Cooking\.minecraft\versions\1.21.1-NeoForge_21.1.253`
> 数据导出目录：`local\kubejs\export`（recipes / tags / registries 等）

---

## 一、需求总览

本次会话逐步确定了以下目标：

1. **找出"食材"清单**：从全部食物中，剔除"成品"，留下"食材"，并进一步分类。
2. **生成食物 Level 分层系统**：
   - Level 1 = 基础食材
   - 其他食物的 level = 由合成它的原料 level 递归计算
   - 营养值 = 2 × level，饱和度 = 4 × level
3. **输出**：CSV（供游戏/配置读取）+ 多个 MD（供人工核查）。
4. **产物落地目录**：`kubejs\data\custom_config\food\type\`

---

## 二、关键规则（逐步确认）

### 规则 1：食材 vs 成品（first task）

| 概念 | 定义 |
|---|---|
| 食物 | 有营养值(nutrition>0) 且在当前版本物品注册表中存在的物品 |
| 成品 | 有效配方的产出 |
| **1对多排除** | **原料总数量 < 成品总数量** 的配方，其产出**不算成品**（视为食材）。如 "1个苹果箱 → 9个苹果" |
| `create:emptying` | 产出不算成品（算食材） |
| 失效剔除 | 既不是成品、也不作任何有效配方原料的食物 → 直接删除 |

**原料字段**（用于判断与计数）：`ingredient`、`ingredients`、`key`、`crafting_ingredients`、`stage_ingredients`、`input`
**不算原料**（载体/工具）：`container`、`carrier`、`tool`、`bowl_ingredient`、`bottle_ingredient`
**忽略的配方类型**：`spoiled:spoil_recipe`（腐烂）、`farmersdelight:cutting`（会干扰判断）

### 规则 2：Level 计算（second task）

**纳入计算的合成方式（type）**：

| type | 含义 |
|---|---|
| `kaleidoscope_cookery:flex_stockpot` | 森罗物语 模糊煮锅 |
| `kaleidoscope_cookery:flex_pot` | 森罗物语 模糊炒锅 |
| `minecraft:crafting_shaped` | 工作台(有序) |
| `minecraft:crafting_shapeless` | 工作台(无序) |
| `farmersdelight:cutting` | 农夫乐事 砧板 |
| `minecraft:smelting` | 熔炉 |
| `minecraft:smoking` | 烟熏 |
| `minecraft:campfire_cooking` | 营火 |
| `kaleidoscope_cookery:rice_bowl` | 装饭/盖饭 |

**计算规则**：

- **level** = 原料中食物 level 之和 ÷ 产出数量（保留 2 位小数）
- **nutrition** = 2 × level，**saturation** = 4 × level
- **递归**：从 level1 开始反复迭代，直到收敛（共 5 轮）
- **非食物原料** → 贡献 0（忽略）
- **未知食物原料**（是食物但还没算出 level）→ 该成品**不计入**
- **tag 原料** → 见规则 3
- **产出物必须是食物**（有营养值），否则不计入

### 规则 3：tag 原料处理（方案 1）

- tag 原料的 level = **该 tag 包含的已知食物里最小的 level**（保守取小）
- 若 tag 内无任何已知食物 → 该配方跳过
- 若 tag 内有**多个不同 level 的食物** → 记录到 `food_level_tag_multi_level.md`

**关键修正**：tag 文件路径 `c/crops/potato.json` 对应的 tag ID 是 **`c:crops/potato`**（命名空间后的第一个 `/` 换成 `:`），并递归展开嵌套 tag（`#其它tag`）。

### 规则 4：多配方物品（方案 A）

- 多个配方若"原料/数量/产出数量**完全相同**"（仅 type 不同，如熔炉/烟熏/营火）→ 合并为一个
- 去重后仍有多配方 → **取"原料总数 ÷ 产出数量"比值最小的配方**参与计算
- 原始多配方物品记录到 `food_level_multi_recipes.md`

### 规则 5：OEI 替换（物品统一）

- 读取 `kubejs\data\oei\replacements\*.json`
- `matchItems` 中的物品**统一视为** `resultItems`
- 例：`kaleidoscope_cookery:cooked_rice`、`concoction:cooked_rice` → `farmersdelight:cooked_rice`
- 应用于：原料、产出、tag 成员

### 规则 6：手动指定

- `food_level_1.csv` 的 `type level` 列会被脚本读取（不再一律=1）
- 手动物品的 `tag` 标记为 `manual`
- 例：`farmersdelight:ham`（火腿）手动设为 **level 2**，tag=`manual`
- 新算出的 level=1 物品标记 `tag=generated`

---

## 三、最终产物

### 目录：`kubejs\data\custom_config\food\type\`

| 文件 | 说明 |
|---|---|
| `food_level_1.csv` | 226 行 Level 1 食材 |
| `food_level.csv` | **591 行**，全部食物的 level 数据 |
| `food_level2.py` | Level 分层脚本（主脚本） |
| `food_ingredients.py` | 食材提取脚本 |
| `food_level_multi_recipes.md` | 多配方物品（1038 个） |
| `food_level_tag_multi_level.md` | 含多个不同 level 的 tag（30 个） |
| `待完成.md` | 待做清单（已剔除 food_level_1 的 mod） |
| `待完成_level.md` | 原始完整备份 |

### CSV 列结构

```
mod_name, item_id, nutrition, saturation, tag, type level, note
```

### food_level_1.csv 统计

- 总行数：226
- level 分布：level 1 = 225，level 2 = 1（火腿）
- tag 分布：空 = 223，`manual` = 1（火腿），`generated` = 1（米饭），`non-food` = 1（鸡蛋）

### food_level.csv 统计（591 行）

| level | 数量 |
|---|---|
| 0.12 | 8 |
| 0.17 | 1 |
| 0.25 | 7 |
| 0.33 | 16 |
| 0.5 | 46 |
| 0.67 | 1 |
| 0.94 | 1 |
| 1.0 | 421 |
| 1.33 | 9 |
| 1.5 | 10 |
| 1.75 | 1 |
| 2.0 | 40 |
| 2.33 | 5 |
| 2.5 | 3 |
| 3.0 | 14 |
| 3.33 | 1 |
| 4.0 | 6 |
| 4.33 | 1 |

---

## 四、解决的具体问题（问题追踪）

| 物品 | 问题 | 原因 | 解决 |
|---|---|---|---|
| `minecraft:potato` 马铃薯 | 不在食材里 | `farmersdelight:cutting` 的野生土豆配方干扰 | 忽略 cutting 类型 |
| `hollowmarch:kelp_soup` 海带汤 | 应被剔除 | 只作为 `spoiled:spoil_recipe` 原料 | 排除 spoil 类型 |
| `extradelight:sliced_potato` 土豆片 | 无 level | 配方原料是 tag `c:crops/potato` | 启用 tag 方案1 |
| `mynethersdelight:sausage_and_potatoes` | 无 level | 原料含 tag `c:crops/potato` | 启用 tag 方案1 |
| `kaleidoscope_chinesefood:twice_cooked_pork_rice` 回锅肉饭 | 无 level | ①type=`rice_bowl`未纳入 ②原料回锅肉无level ③cooked_porkchop无level | 纳入 rice_bowl + 熔炉/烟熏/营火 + tag方案1 → 最终 = 1.5 |
| `minecraft:cooked_porkchop` 熟猪排 | 曾算出 0.5（偏低） | 选中 `smoked_ham→cooked_porkchop`，而 smoked_ham=0.5 | 手动把 `farmersdelight:ham` 提为 level2 → cooked_porkchop=1.0 |

---

## 五、脚本核心逻辑（food_level2.py）

```
1. 读 food_level_1.csv -> level1（含手动 level）
2. 读 foods.json      -> 判断食物/非食物 + 名称
3. 读 oei/*.json      -> 物品替换映射
4. 读 tags/...        -> tag -> 物品集合（递归展开）
5. 遍历 recipes，筛选 COOK_TYPES：
     - 提取原料(ids,tags)、产出(pid,cnt)，应用 OEI 规范化
     - 合并相同 signature 的配方
     - 多配方取比值最小
6. 迭代计算 level（共 5 轮）：
     - 非食物原料忽略；未知食物原料跳过；tag 取最小 level
7. 输出 food_level.csv + 两个 MD
```

---

## 六、关键文件路径

| 用途 | 路径 |
|---|---|
| 配方 | `local\kubejs\export\recipes` |
| tag | `local\kubejs\export\tags\minecraft\item\...` |
| 物品注册表 | `local\kubejs\export\registries\item.json` |
| 食物库 | `..\1.21.1-NeoForge_21.1.248\kubejs\foods.json` |
| OEI 替换 | `kubejs\data\oei\replacements\*.json` |
| 输出目录 | `kubejs\data\custom_config\food\type\` |

---

*（本文档由本次会话过程整理生成）*
