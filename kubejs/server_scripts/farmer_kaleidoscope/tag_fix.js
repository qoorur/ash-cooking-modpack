// ==============================================================
// DEPENDENCIES (required mods):
//   (none - only item tags c:foods/pasta, c:pasta)
// ==============================================================
ServerEvents.tags('item', event => {
    // 合并读取两个来源标签的物品
    const sourceTags = ['c:foods/pasta', 'c:pasta'];
    let allItems = new Set();

    sourceTags.forEach(tagName => {
        const tag = event.get(tagName);
        const items = tag.objectIds;
        console.log('检测到 ' + tagName + ' 中的物品数量: ' + items.length);
        items.forEach(itemId => allItems.add(String(itemId)));
    });

    // 统一添加到 kubejs:pasta
    allItems.forEach(itemId => {
        console.log('处理物品: ' + itemId);
        event.add('kubejs:pasta', itemId);
    });
})
