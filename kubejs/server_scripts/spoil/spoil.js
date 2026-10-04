// ==============================================================
// DEPENDENCIES (required mods):
//   Spoiled (spoiled), KubeJS (kubejs); optional: Cold Sweat (cold_sweat)
// ==============================================================
// priority: 0
console.info('(Loaded spoil scripts)');

// 腐烂时间常量：所有自动生成的腐烂配方统一使用该值
const SPOIL_TIME = 100;

// ==================== 函数定义 ====================
let SPOIL_CONFIG = null;

function loadSpoilConfig() {
  if (SPOIL_CONFIG) return SPOIL_CONFIG;
  // 明确使用从游戏根目录起的路径（JsonIO 实际也支持这样写）
  let configPath = 'kubejs/config/spoil_config.json';
  let config = null;
  try {
    config = JsonIO.read(configPath);
  } catch (e) {
    console.warn('[Spoil] 读取配置文件失败: ' + e);
  }
  if (!config) {
    console.warn('[Spoil] 配置文件不存在，腐烂系统未启用');
    return null;
  }
  console.log('[Spoil] 配置文件加载成功');
  SPOIL_CONFIG = config;
  return config;
}

let ALL_FOOD_IDS = null;
function getAllFoodItemIds() {
  if (ALL_FOOD_IDS) return ALL_FOOD_IDS;
  let foodSet = new Set();

  // 扫描全部物品，只检查 minecraft:food 数据组件
  Ingredient.all.getItemIds().forEach(function (id) {
    if (isRealFood(id)) foodSet.add(id);
  });

  ALL_FOOD_IDS = Array.from(foodSet);
  console.log('[Spoil] 发现食物总数：' + ALL_FOOD_IDS.length);
  return ALL_FOOD_IDS;
}

function isRealFood(id) {
  try {
    let stack = Item.of(id);
    // 兼容不同 KubeJS 版本：优先用 components.get，缺失组件可能返回 null 或抛错
    let food = stack.components.get('minecraft:food');
    return food !== null && food !== undefined;
  } catch (e) {
    return false;
  }
}

function getSpoilSettings(itemId, config) {
  if (!config) return null;
  if (config.overrides) {
    for (let i = 0; i < config.overrides.length; i++) {
      let override = config.overrides[i];
      if (override.item === itemId) {
        if (override.result === "none") return { result: null, time: 0 };
        return { result: override.result, time: SPOIL_TIME };
      }
    }
  }
  return { result: config.default_spoil_result, time: SPOIL_TIME };
}

// ==================== 事件注册 ====================

ServerEvents.loaded(function (event) {
  loadSpoilConfig();
  // 提前初始化食物列表
  getAllFoodItemIds();
});

ServerEvents.recipes(function (event) {
  let config = loadSpoilConfig();
  if (!config) return;

  console.log('[Spoil] 开始注册腐烂配方...');
  let foodIds = getAllFoodItemIds();
  let count = 0;
  for (let i = 0; i < foodIds.length; i++) {
    let id = foodIds[i];
    let settings = getSpoilSettings(id, config);
    if (settings && settings.result) {
      try {
        event.custom({
          type: "spoiled:spoil_recipe",
          ingredient: { item: id },
          spoiltime: settings.time,
          priority: 10,
          result: { id: settings.result }
        });
        count++;
      } catch (e) {
        console.error('[Spoil] 注册配方失败: ' + id + ' - ' + e);
      }
    }
  }
  console.log('[Spoil] 腐烂配方注册完成，共 ' + count + ' 个');
});

ServerEvents.tags('item', function (event) {
  // 无论腐烂与否，都移除模组自带的 spoiler:foods 标签
  try {
    if (Platform.isLoaded('cold_sweat')) {
      event.removeAll('cold_sweat:icebox_valid');
    }
    event.removeAll('spoiled:foods');
  } catch (e) {
    console.warn('[Spoil] 移除旧标签时出错: ' + e);
  }

  let config = loadSpoilConfig();
  let foodIds = getAllFoodItemIds();
  let enabled = config != null;

  if (enabled) {
    console.log('[Spoil] 开始处理腐烂标签...');
    let addedCount = 0;
    let removedCount = 0;

    for (let i = 0; i < foodIds.length; i++) {
      let id = foodIds[i];
      let settings = getSpoilSettings(id, config);

      if (settings) {
        if (settings.result) {
          // 有有效的腐烂产物，添加标签
          event.add('kubejs:spoiled', id);
          if (Platform.isLoaded('cold_sweat')) {
            event.add('cold_sweat:icebox_valid', id);
          }
          addedCount++;
        }
      }
    }

    // 移除配置中明确设为 "none" 的物品
    if (config.overrides) {
      for (let j = 0; j < config.overrides.length; j++) {
        let override = config.overrides[j];
        if (override.result === "none") {
          try {
            event.remove('kubejs:spoiled', override.item);
            removedCount++;
            console.log('[Spoil] 已从标签中移除: ' + override.item);
          } catch (e) { }
        }
      }
    }

    console.log('[Spoil] 标签处理完成：添加 ' + addedCount + ' 个，移除 ' + removedCount + ' 个');
  }
})