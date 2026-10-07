# kaleidoscope_effects —— 森罗物语厨房「视觉特效」脚本

本目录存放森罗物语（森罗厨房）锅具相关的**纯视觉/反馈特效**脚本（不改配方、不算分）。

## 文件一览

| 文件 | 作用 | 触发时机 |
|---|---|---|
| `pot_cooked_sparkle.js` | 炒锅**烹饪完成**时喷一簇**闪耀粒子**特效 | `ash_wok.cooked` 事件 |

---

## pot_cooked_sparkle.js —— 炒锅完成闪耀粒子

### 依赖
- **kaleidoscope_cookery**（森罗物语 / 森罗厨房）：提供炒锅方块 `kaleidoscope_cookery:pot`
- **ash_kaleidoscope_kitchen_wok**（本整合包附带的桥接 mod）：提供 KubeJS 服务端事件 `ash_wok.cooked`
  - 该 mod 用 Mixin 注入 `PotBlockEntity#tickCooking` 的 RETURN，
    在 `status` 刚变为 `FINISHED(2)`（烹饪完成、成品就绪）时 post 事件。

### 触发链
```
炒锅倒计时归零，status → FINISHED(2)
        ↓
PotBlockEntityMixin 在 tickCooking RETURN 处 post(ash_wok.cooked)
        ↓
pot_cooked_sparkle.js 的 ash_wok.cooked 监听器被调用
        ↓
spawnSparkle(level, pos) 在锅上方喷出闪耀粒子
```

> 触发与「取出方式」无关：玩家右键 / 机械臂 / 女仆 / 管道取走前都会先喷。

### 事件对象字段（`ash_wok.cooked`）
| 字段 | 类型 | 说明 |
|---|---|---|
| `event.level` | ServerLevel | 所在世界 |
| `event.pos` | BlockPos | 炒锅位置 |
| `event.pot` | PotBlockEntity | 炒锅方块实体 |
| `event.result` | ItemStack | 刚做好的成品 |

### 粒子构成（4 层，营造「叮！做好了」的闪耀感）
1. **绽放环**：16 个星点沿锅口一圈向外扩散（电火花 / 末地烛 / 爱心轮换）
2. **上升星点**：末地烛白光在锅口上方缓缓上飘（近静止发光）
3. **中心爆发**：20 个电火花向上爆发
4. **爱心点缀**：村民爱心绿星点缀

> 想调风格：改 `SPARK_TYPES` 数组里的粒子类型，或增删 `spawnSparkle` 里的几层 `sendParticles`。
> 常用原版闪耀粒子：`ELECTRIC_SPARK`、`END_ROD`、`HAPPY_VILLAGER`、`TOTEM_OF_UNDYING`、
> `WAX_ON`、`ENCHANT`、`FIREWORK`、`GLOW`。

### 调试
脚本内 `const DEBUG = false` 改 `true`，会在 `logs/kubejs/server.log` 打印 `[WokSparkle]` 日志。

### 常见问题
| 现象 | 可能原因 |
|---|---|
| 完全没有粒子 | `ash_kaleidoscope_kitchen_wok` 未加载（`ash_wok` 未定义） |
| 报 `ash_wok is not defined` | 同上；该桥接 mod 缺失 |
| 粒子位置偏 | 炒锅模型中心与方块中心有偏移，可微调 `cx/cy/cz` 的 +0.5/+0.15 数值 |
