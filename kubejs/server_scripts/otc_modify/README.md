# 下单了（OrderToCook）订单奖励模块 说明文档

> 本文档说明 `ordertocook_score_reward.js`（注册器）与 `otc_reward_logic.js`（奖励逻辑）的工作机制。
> 目标：在**订单交付完成**时给玩家发放额外奖励（后续接入评分系统动态算报酬）。

---


## 一、系统概述与官方 API


### 1.1 采用官方 API（OrderLifecycleApi）

下单了提供了官方订单生命周期 API：

```
cn.breezeth.ordertocook.api.OrderLifecycleApi
   ├─ register(ResourceLocation id, int priority, Listener)
   ├─ emit(Type, ServerLevel, Player, ItemStack/OrderView)
   └─ Type 枚举：GENERATED / ACCEPTED / PACKED / COMPLETED / EXPIRED / CANCELLED

Listener { void onOrderEvent(Event) }
Event { Type type; ServerLevel world; Player player; OrderView order; }
OrderView { orderId, customerName, machineId, delivery, longDistance,
            urgent, expiryTick, prestige, foods(Map<菜品ID,数量>) }
```

**关键优势**：事件在**服务端**触发，且**自带 Player 与 OrderView**，
无需再监听 `EntityInteract` 或用客户端戏法。

### 1.2 触发链路

```
玩家把餐盘交给顾客 → 交付完成
      ↓
OrderLifecycleApi 触发 COMPLETED 事件（带 Player + OrderView）
      ↓
注册器里的 listener.onOrderEvent(ev) 被调用
      ↓
调用 otcGiveReward(player, order)（奖励逻辑层）
      ↓
player.give(...) / CoinUtils.giveCoins(...) 发放奖励
```

### 1.3 两个脚本的分工

| 文件 | 职责 | 修改后如何生效 |
|---|---|---|
| `ordertocook_score_reward.js` | 注册监听器（固定 ID），体内只调用 `otcGiveReward` | **重启游戏** |
| `otc_reward_logic.js` | 定义 `otcGiveReward(player, order)`，写奖励规则 | **重启游戏** |

> **为什么都要重启？**
> `OrderLifecycleApi` **没有 unregister**，且 KubeJS **禁用了反射**
> （`java.lang.Class` 被 class filter 拦截），无法在 `/reload` 时
> 替换已注册的监听器。
> 另外，监听器**绑定的是注册那一刻的脚本作用域**，
> `/reload` 虽会重新执行脚本，但旧监听器仍指向旧作用域，
> 因此**改奖励逻辑也必须重启游戏才生效**（不是 `/reload`）。

### 1.4 注册器关键写法

```js
var OrderLifecycleApi = Java.loadClass('cn.breezeth.ordertocook.api.OrderLifecycleApi');
var RL = Java.loadClass('net.minecraft.resources.ResourceLocation');

var listenerImpl = {
    onOrderEvent: function (ev) {
        if (String(ev.type()) !== 'COMPLETED') return;  // 只处理交付完成
        var player = ev.player();
        var order  = ev.order();
        if (!player || !order) return;
        otcGiveReward(player, order);                   // 调用奖励逻辑
    }
};
OrderLifecycleApi.register(RL.parse('ordertocook_score_reward:main'), 0, listenerImpl);
```

> KubeJS 用**普通 JS 对象**实现 Java 的 `Listener` SAM 接口即可（已实测通过）。
> `register` 用**固定 ID**：重复注册会被 API 以 `Duplicate ... listener` 拒绝，
> 因此**不会累积、不会重复发奖**。

### 1.5 奖励逻辑（当前版本）

```js
function otcGiveReward(player, order) {
    // 当前：固定给 2 个钻石
    player.give(Item.of('minecraft:diamond', 2));
}
```

**后续接入评分系统**：在 `otcGiveReward` 内根据 `order` 计算报酬，例如：

```js
function otcGiveReward(player, order) {
    var score = 计算评分(order);        // 你的评分逻辑
    var coins = Math.floor(score * 10);
    CoinUtils.giveCoins(player, coins); // 发金币
    player.give(Item.of('minecraft:diamond', ...));
}
```

可用的 `order` 字段：`orderId()`、`customerName()`、`prestige()`、
`urgent()`、`longDistance()`、`foods()`（菜品 Map）。

### 1.6 发钱的工具类

```
cn.breezeth.ordertocook.util.CoinUtils
   ├─ giveCoins(Player, int)     // 发金币
   ├─ countCoins(Player)         // 查余额
   ├─ tryConsume(Inventory, int)
   └─ tryConsumeWithChange(Player, int)
```

### 1.7 常见排查点

| 现象 | 可能原因 |
|---|---|
| 改奖励后 `/reload` 无效 | listener 绑定旧脚本作用域，**需重启游戏** |
| `Duplicate order lifecycle listener` 报错 | 脚本被加载两次，第二次注册被拒（**无害**） |
| 事件不触发 | 未接到 `COMPLETED`；确认脚本已注册成功 |
| KubeJS 里 `.class` / `.getClass()` 报错 | KubeJS class filter 禁用 `java.lang.Class`，**无法反射** |
| 中文脚本乱码 | 文件务必存为 **UTF-8 无 BOM**（推荐脚本内注释用英文） |

---

## 二、客户端：隐藏"预期收益"提示

> 文件：`kubejs/client_scripts/otc_modify/remove_income_tooltip.js`

### 2.1 背景

`TakeoutBagItem.appendHoverText()` 会给外卖餐盒/订单物品加一行：

```java
if (nbt.contains("Prestige")) {
    int prestige = nbt.getInt("Prestige");
    list.add(Component.translatable("tooltip.ordertocook.coin_reward", prestige)
             .withStyle(ChatFormatting.GOLD));   // 语言文件 = "订单收益：%s"
}
```

该值是 mod **原有算法**算出的预期收益。既然实际收益已被自定义，
这行提示会**误导玩家**，因此在这里隐藏。

### 2.2 方案：客户端事件删除该行

tooltip 在**客户端**渲染，故脚本放在 `client_scripts`，
监听 `ItemTooltipEvent`，从 tooltip 列表里删掉匹配行。

```js
NativeEvents.onEvent(
    "net.neoforged.neoforge.event.entity.player.ItemTooltipEvent",
    event => {
        const lines = event.getToolTip();
        for (let i = lines.size() - 1; i >= 0; i--) {
            if (otcIsIncomeLine(lines.get(i))) lines.remove(i);
        }
    }
);
```

### 2.3 匹配策略（主 + 备）

| 优先级 | 方式 | 说明 |
|---|---|---|
| 主 | **翻译 key** `tooltip.ordertocook.coin_reward` | 语言无关，最严谨 |
| 备 | **渲染文本**含"订单收益" | 万一 `TranslatableContents` 类加载失败时兜底 |

脚本加载时会打印走了哪种模式：

| 日志 | 含义 |
|---|---|
| `[OTC-Tooltip] TranslatableContents class resolved` | key 模式可用 |
| `[OTC-Tooltip] TranslatableContents not loadable ...` | 退回文本模式 |

### 2.4 生效方式

**客户端脚本** → `F3+T`（重载资源）或 `/reload`，**不必重启游戏**。

---

## 三、配置：关闭 / 调整小费

> 文件：`config/ordertocook/ordertocook.json5`（**不在 kubejs 目录内**）

小费由 mod 配置项控制，**无需写代码**：

| 配置项 | 含义 | 默认 |
|---|---|---|
| `tipNormalChance` | 普通订单给小费概率 | 0.1 |
| `tipUrgentChance` | 加急订单给小费概率 | 0.5 |
| `tipEasterEggCustomerChance` | 彩蛋顾客给小费概率 | 1.0 |
| `tipMin` / `tipMax` | 非雨天小费金额范围 | 1 ~ 3 |
| `rainTipMin` / `rainTipMax` | 雨天小费金额范围 | 3 ~ 5 |

**当前设置（已关闭小费）**：

```json5
"tipNormalChance": 0.0,
"tipUrgentChance": 0.0,
"tipEasterEggCustomerChance": 0.0,
```

> 生效方式：**重启游戏**（NeoForge 配置一般在启动时读取）。

---

## 四、模块文件总览

```
kubejs/
├── server_scripts/otc_modify/
│   ├── ordertocook_score_reward.js   订单奖励注册器（改后需重启）
│   ├── otc_reward_logic.js           订单奖励逻辑（改后需重启）
│   └── README.md                     本文档
└── client_scripts/otc_modify/
    └── remove_income_tooltip.js      隐藏"预期收益"提示（F3+T 生效）

config/ordertocook/ordertocook.json5  小费等配置（改后需重启）
```

---

## 五、常见排查点

| 现象 | 可能原因 |
|---|---|
| "订单收益"仍在 | 脚本未加载（看 `[OTC-Tooltip]` 日志）/ 未 F3+T |
| 改奖励 `/reload` 无效 | listener 绑定旧脚本作用域，**需重启** |
| 小费仍发放 | 配置未重启读取；或订单在改前已生成 |
| `Duplicate order lifecycle listener` | 脚本重复加载，无害 |

---

*文档随脚本实现更新。若修改了触发方式/API 用法，请同步更新本文档。*