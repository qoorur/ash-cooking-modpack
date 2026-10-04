# farmer_kaleidoscope —— 农夫乐事 × 森罗厨房 × 妖怪归家 配方整合

本目录下的 KubeJS 脚本用于把**多个食物 mod 的重复/冲突配方**统一到一套机器上，
核心思路：**遍历运行时配方表 (`event.originalRecipes`)，把某类配方转换成另一种机器配方，并删除原配方。**

> 关联资料
> - `kubejs/data/oei/replacements/*.json`：oei 物品替换表。例如 `rice.json` 把
>   `kaleidoscope_cookery:cooked_rice`、`concoction:cooked_rice` 统一视为 **农夫乐事的米饭** (`farmersdelight:cooked_rice`)。
> - `kubejs/server_scripts/rice.js`：米 → 熟米 的平衡（汤锅 2 生米 → 1 熟米）。

---

## 一、2026-09-30 今日新增（重点）

### 1. `yhc_to_cutting_board.js` —— 妖怪归家「料理台」→ 切菜板拼装

**背景**：妖怪归家 (youkaishomecoming) 的寿司是「料理台 (cuisine board)」多步摆放配方，
其 `base`（`youkaishomecoming:sushi` / `gunkan` / `hosomaki` / `futomaki` / `california`）
**不是物品**，而是料理台的中间状态 ID（由 `TableItemManager` 管理）。
真正定义 base 的是**标签**：
- `youkaishomecoming:cuisine/cooked_rice`（米饭，含 farmersdelight/kaleidoscope 的熟米饭）
- `youkaishomecoming:cuisine/dried_kelp`（干海苔）

**转换规则**（base 展开为具体配料）：
| 原 base | 展开为 |
|---|---|
| `youkaishomecoming:sushi` | `{tag: youkaishomecoming:cuisine/cooked_rice}` |
| `gunkan` / `hosomaki` / `futomaki` / `california` | 米饭标签 + 干海苔标签 |
| `california_roll`（成品物品） | `{item: youkaishomecoming:california_roll}` |

- 目标类型：`refurbished_furniture:cutting_board_combining`（切菜板拼装，无序）
- **配料数 > 5 的跳过**（切菜板上限 5），且**保留原料理台配方**（避免死区）
- 转换成功后**删除**对应的料理台配方（按 id 精确删，只删成功的）
- 当前：注册 18 个，跳过 2 个（`california_roll`、`egg_futomaki` 都是 6 料超限）

### 2. `rice_crafting_to_combine.js` —— 工作台「米饭生食寿司/卷」→ 切菜板拼装

**背景**：农夫乐事系各 mod 里用**米饭**在**工作台**合成的生食寿司/卷很多，重复且占工作台。
统一转到切菜板拼装。

**判定**：
- 「用米」：配方 JSON 含 `cooked_rice`（oei 已把各种 cooked_rice 统一为米饭）
- 「生的」：产物 id 含 `roll` / `sushi` / `nigiri` / `maki` / `gunkan`
- 「排除」：`katsudon`（炸猪排饭，熟食，不转）
- 「熟食」：如饭团 (`riceball`)、拌饭 (`furikake_rice`) 等**产物名不含上述关键字**，自然不转

**处理**：
1. 配料提取：shapeless 直取；**shaped 按 pattern 取"用了哪些料"**（丢弃图案，支持重复字符计数）
2. **米饭去重 + 置顶**：多份米饭只保留 **1 份**，放在配料**第一位**
3. **配料数 > 5 跳过**，保留原工作台配方
4. **数量统一为 2**（一份米饭 → 2 份产物）
5. 转换后**删除**原工作台配方
6. 输出 id：`refurbished_furniture:combining/rice_<原名去 : / >`

**已验证转换的产物清单（23~24 个）**：
- 农夫乐事：`cod_roll`、`salmon_roll`、`kelp_roll`、`rice_roll_medley_block`
- 田园调酿：`cod_sushi`、`salmon_sushi`、`tropical_sushi`
- 生机遍布：`tuna_roll`、`bluefish_roll`、`herring_roll`
- Alex 生物乐事：`catfish_roll`、`lobster_roll`、`banana_roll`、`flying_fish_roll` 等（一堆 `*_roll`）
- 千古乐事：`pitcher_sushi`、`hamburger_meat_sushi`、`incandescence_sushi`、`kwat_pocket_sushi`、`pufferfish_roll`
- lendersdelight：`lionfish_roll`
- 妖怪归家：`tobiko_gunkan`

**超限跳过**：`alexsmobsdelight:dried_kelp_rolled_tarantula_hawk_larva`（6 料）→ 保留原工作台配方。


## 二、目录内所有脚本一览

| 文件 | 作用 |
|---|---|
| `yhc_to_cutting_board.js` | 【今日】妖怪归家料理台寿司 → 切菜板拼装 |
| `rice_crafting_to_combine.js` | 【今日】工作台米饭生食寿司/卷 → 切菜板拼装 |
| `stockpot.js` | 森罗汤锅/农夫锅 → `flex_stockpot`（无序），去重、清残留 |
| `youkai_stockpot.js` | 妖怪归家 `unordered_cooking` → `flex_stockpot`（无序），不同产物用不同 carrier |
| `concoction_stockpot.js` | 田园调酿 `cauldron_brewing` → `flex_stockpot` |
| `youkai_steamer.js` | 妖怪归家 `steaming` → 森罗蒸锅 `steamer` |
| `pot.js` | 锅类配方转换（flex） |
| `cutting.js` | 切制配方转换 |
| `extradelight_jam_to_flex.js` | 额外乐事动态果酱配方 → `flex_stockpot`（仅装载 extradelight 时启用） |
| `cuisine_from_crafting.js` | （空文件，预留） |
| `tag_fix.js` | 合并 `c:foods/pasta` / `c:pasta` 标签物品 |

---

## 三、通用要点 / 踩坑记录

- **`event.originalRecipes`**：KubeJS 提供的"原始配方表"，遍历它可按类型批量转换；
  处理完用 `event.remove({id})` 删原配方，`event.custom({...}).id(...)` 生成新配方。
- **切菜板拼装 (`refurbished_furniture:cutting_board_combining`) 配料上限 = 5**，
  超过会报 `Recipe JSON for refurbished_furniture:combining/...`，必须跳过并保留原配方。
- **料理台 base 不是物品**：`youkaishomecoming:sushi` 等是中间状态 ID，需靠
  `cuisine/cooked_rice`、`cuisine/dried_kelp` 标签展开（见 `yhc_to_cutting_board.js`）。
- **oei 替换**：把 `kaleidoscope_cookery:cooked_rice`、`concoction:cooked_rice` 等
  统一为 `farmersdelight:cooked_rice`，脚本判定米饭时按 `cooked_rice` 子串匹配即可。
- **日志位置**：`logs/kubejs/server.log`（不是 `logs/server.log`）。
  脚本用 `console.info('[前缀] ...')` 输出，方便定位。

---

## 四、待办 / 未完成

- [ ] **熟食寿司/饭类** 转森罗**蒸锅 (`kaleidoscope_cookery:steamer`)**，**米饭作为 carrier**（Q3 当时先搁置）。
- [ ] 森罗蒸锅配方是否支持 `carrier` 字段待确认（`stockpot` 支持 carrier；steamer 结构需核对）。
- [ ] 游戏内实测：切菜板能否拼出 `concoction:cod_sushi`（数量 2）等；确认 count、配料匹配无误。
- [ ] 确认 shaped → 无序转换后，个别配方的料是否偏多（如 `banana_roll` 的 pattern 有 2 个 `r`）。

