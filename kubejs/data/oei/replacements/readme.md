# OEI 替换整合 —— 剩余待办清单

来源：`duplicate_candidates.md`（140 个非方块组 + 153 个方块组）
规则：仅按物品 path（去命名空间）相同来找候选，**需要人工判断**。

本目录下已生成的替换表：

| 文件 | 内容 |
|---|---|
| `rice.json` | 熟米 `cooked_rice` 统一为农夫乐事（原有） |
| `food_ingredients.json` | 食材/半成品/基础材料（37 组） |
| `kaleidoscope_food.json` | 成品菜（10 组） |
| `REMAINING.md` | 本文件：剩余待确认 / 已排除 |

---

## 一、整合优先级（假设，待确认）

目前按以下顺序认“正主”（`resultItems`）：

1. `farmersdelight`（农夫乐事）—— 核心烹饪 mod
2. `kaleidoscope_cookery`（森罗厨房）/ `youkaishomecoming`（妖怪归家）
3. `extradelight`（额外乐事）
4. `create` / `createaddition`（机械动力系）
5. 其它功能对应 mod（如 `naturalist` 的鱼）

> ⚠️ 如果你希望某类物品换一个“正主”，改对应 json 的 `resultItems` 即可。

---

## 二、待确认：可整合但正主/边界存疑

### 2.1 正主需要你拍板

| 组 | 候选 | 我暂定 | 备注 |
|---|---|---|---|
| butter | concoction / extradelight / ratatouille_fried_delights / youkaishomecoming | `extradelight` | 已处理，正主可换 |
| mapo_tofu | kaleidoscope_nether / youkaishomecoming | `youkaishomecoming` | 森罗炼狱那版差异未知 |
| cheese | alexsmobsdelight / extradelight / ratatouille_fried_delights / refurbished_furniture | `extradelight` | 已处理，正主可换 |
| salt | extradelight / kaleidoscope_chinesefood / ratatouille | `extradelight` | 已处理，正主可换 |

### 2.2 还没写进 json，等你确认是否整合

| 组 | 候选 | 建议正主 | 说明 |
|---|---|---|---|
| ice_cream | extradelight / ratatouille_fried_delights | `extradelight` | 疑似真重复 |
| ice_cubes | extradelight / ratatouille_fried_delights | `extradelight` | 疑似真重复 |
| french_fries | extradelight / ratatouille_fried_delights | `extradelight` | 疑似真重复 |
| toast | extradelight / refurbished_furniture | `extradelight` | **已处理** |
| cheese_souffle | create_bic_bit / extradelight | `extradelight` | 疑似真重复 |
| hashbrowns | concoction / extradelight | `extradelight` | 疑似真重复 |
| popcorn | concoction / extradelight | `extradelight` | 疑似真重复 |
| cooked_corn | concoction / extradelight | `extradelight` | 疑似真重复 |
| tomato_soup | concoction / extradelight | `extradelight` | 待定 |
| potato_soup | extradelight / youkaishomecoming | `extradelight` | 待定 |
| boiled_egg | concoction / extradelight / mynethersdelight | `extradelight` | 待定 |
| mushroom_cream_soup | alexsmobsdelight / concoction | 待定 | 正主不明 |
| hot_wings | extradelight / mynethersdelight | `extradelight` | 待定 |
| haggis | dungeonsdelight / extradelight | `extradelight` | 待定 |
| cake_base | createaddition / ratatouille | `createaddition` | **已处理** |
| candy_apple | extradelight / youkaishomecoming | `extradelight` | 待定 |
| caramel_apple | alexscaves / extradelight | `extradelight` | 待定 |
| affogato | extradelight / youkaishomecoming | `extradelight` | 待定 |
| coffee_beans | extradelight / youkaishomecoming | `extradelight` | 待定 |
| cocoa_powder / cocoa_solids | extradelight / ratatouille | `extradelight` | **已处理** |
| chocolate_cake | concoction / createaddition / extradelight | `extradelight` | 待定 |
| chocolate_ice_cream | alexscaves / extradelight | `extradelight` | 待定 |
| cheese_burger 等汉堡类 | 各 mod | — | 未见明确重复组 |
| egg_sandwich 类 | extradelight 系 | — | 未见明确重复组 |

### 2.3 鱼类 / 海产食材（Naturalist vs Tide vs 其它）

| 组 | 候选 | 说明 |
|---|---|---|
| anglerfish | naturalist / tide | 生鱼，可整合 |
| catfish | naturalist / tide | 生鱼，可整合 |
| cooked_catfish | alexsmobs / naturalist | 熟鱼，可整合 |
| crab / crab_meat | naturalist / youkaishomecoming | **已处理**（kaleidoscope_food.json）|
| clam / snail 等 | naturalist / spawn | 见下方“生物类” |

> 鱼类整合与否取决于 `tide` 与 `naturalist` 是否都要保留实体，请确认。

### 2.4 饮品 / 酒（kaleidoscope_tavern / kaleidoscope_world_liquor / youkaishomecoming）

| 组 | 候选 | 说明 |
|---|---|---|
| champagne | kaleidoscope_tavern / youkaishomecoming | 酒类，正主待定 |
| dassai | kaleidoscope_world_liquor / youkaishomecoming | 清酒，正主待定 |
| bloody_mary | dungeonsdelight / kaleidoscope_tavern | 鸡尾酒 |
| depth_charge | alexscaves / kaleidoscope_tavern | 名称冲突，**功能完全不同，勿整合** |
| cola | kaleidoscope_world_liquor / ratatouille_fried_delights | 饮料 |
| mayonnaise_bottle | create_bic_bit / youkaishomecoming | 酱料瓶，待定 |

### 2.5 其它成品菜/汤（森罗系）

| 组 | 候选 | 建议正主 |
|---|---|---|
| seafood_miso_soup | kaleidoscope_cookery / youkaishomecoming | `youkaishomecoming`（**已处理**）|
| miso_soup | extradelight / youkaishomecoming | `youkaishomecoming`（**已处理**）|
| borscht | extradelight / kaleidoscope_cookery / youkaishomecoming | `kaleidoscope_cookery`（**已处理**）|
| mantou | kaleidoscope_cookery / youkaishomecoming | `kaleidoscope_cookery`（**已处理**）|
| mapo_tofu | kaleidoscope_nether / youkaishomecoming | `youkaishomecoming`（**已处理**）|
| takoyaki | alexsmobsdelight / dungeonsdelight | 待定 |
| fried_dragon_egg | ends_delight / kaleidoscope_end | `kaleidoscope_end`？待定 |
| chorus_flower_tea | ends_delight / kaleidoscope_end | 待定 |
| dragon_tooth / dragon_tooth_knife | ends_delight / kaleidoscope_end | 末地系，待定 |
| ghast_tentacle | dungeonsdelight / kaleidoscope_nether | 下界系，待定 |
| hoglin_hide | cold_sweat / kaleidoscope_nether / mynethersdelight | 材料，待定 |
| cake_slice | concoction / farmersdelight | `farmersdelight`（**已处理**）|

---

## 三、已排除（不建议整合，仅记录原因）

### 3.1 原版方块/物品（绝不能替换）
- `minecraft:cactus`、`emerald`、`barrel`、`bookshelf`、`decorated_pot`、`suspicious_sand/gravel`
- `sunflower`、`copper_door`、`deepslate_tiles`、`cobblestone_vertical_slab` 等
- 这些被替换会导致原版内容消失。

### 3.2 刷怪蛋 / 生物桶（不同实体，替换会出错）
- `ant_spawn_egg`、`anglerfish_spawn_egg`、`boar_spawn_egg`、`clam_spawn_egg`、`crab_spawn_egg`、`deer_spawn_egg`、`great_white_shark_spawn_egg`、`herring_spawn_egg`、`snail_spawn_egg`、`tuna_spawn_egg`
- `*_bucket`：`anglerfish_bucket`、`catfish_bucket`、`blobfish_bucket`、`crab_bucket`、`herring_bucket`、`devils_hole_pupfish_bucket`、`tuna_bucket`、`ketchup_bucket`、`mayonnaise_bucket` 等
- 注：桶的“内容物类型”不同（`MobBucketItem` vs `NaturalistBucketItem`），硬合并会丢实体。

### 3.3 功能/机制不同的工具与装置（勿整合）
- `brush`：原版刷子(`minecraft:brush`) vs 嗅探兽刷子(`immortalers_delight:brush`)——功能不同
- `wrench`：Companions / Create / 翻新家具 / Supplementaries——各自扳手机制不同
- `broom`：节气 `eclipticseasons` vs 女仆 `touhou_little_maid`——机制不同
- `whisk`：Create（合成用）vs 额外乐事（武器 SwordItem）——机制不同
- `thermometer`：冷热 `cold_sweat` vs 节气 `eclipticseasons`——功能/UI 不同
- `hourglass`：Companions vs Supplementaries——机制不同
- `computer`：三种不同 mod 的功能方块
- `chair` / `scarecrow` / `stove` / `oven` / `millstone` / `freezer` / `stockpot` / `end_stove` / `faucet` / `tap` / `jar` / `soap` / `soap_block` / `straw_bale`——各 mod 自有机器/装饰，**继续各自保留**
- `belt_connector`：**已处理**（装饰工厂 → Create）
- `music_disc_rain`：Quark vs Spawn——不同唱片
- `decorated_pot` / `suspicious_*`：Lootr 的版本

### 3.4 同一 mod 内部/系列物品（不是跨 mod 重复）
- `doll_0`~`doll_12`：`kaleidoscope_doll` vs `kaleidoscope_nether`——同作者不同包
- `custom_spell_homing` / `custom_spell_ring`：`danmaku_api` vs `youkaishomecoming`——API 转发

### 3.5 名称冲突但实为不同物品
- `depth_charge`：Alex 的洞穴「深水炸弹(投掷物)」 vs 森罗酒馆「鸡尾酒」
- `emerald`：森罗酒馆的鸡尾酒叫 emerald，**不是绿宝石**
- `cactus`：额外乐事的仙人掌食材 vs 原版仙人掌方块

### 3.6 装饰方块（duplicate_candidates.md 的 PART 2 全部）
共 153 组，各 mod 的材质/模型/风格不同，属设计选择而非重复，**全部保留，不整合**：
- 木种书柜（hollowmarch vs quark）、树篱（quark vs refurbished_furniture）、竖台阶（quark vs youkaishomecoming）
- 沙发/凳子（kaleidoscope_tavern vs quark vs refurbished_furniture）
- `ice_bricks`/`snow_bricks` 系列（hollowmarch vs youkaishomecoming）—— 视觉风格不同，待你确认是否真要合并
- `limestone` 系列（alexscaves / create / quark）—— 材质/用途不同
- andesite/brass/copper 门窗栏杆（create vs createdeco）

---

## 四、下一步

- [ ] 确认第三节优先级顺序是否需要调整
- [ ] 从第二节挑选要整合的组，逐个补进 `*.json`
- [ ] 对 `ice_bricks`/`snow_bricks` 等同 mod 视觉重复，确认是否合并
- [ ] 整合后游戏内 `/reload` + 检查 `logs/kubejs/server.log` 有无替换报错
