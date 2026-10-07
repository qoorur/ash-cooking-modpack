// ==============================================================
// 森罗物语 · 炒锅「烹饪完成」闪耀粒子特效（加强版）
// --------------------------------------------------------------
// 依赖：
//   - kaleidoscope_cookery（森罗厨房/森罗物语）—— 提供炒锅方块
//   - ash_kaleidoscope_kitchen_wok —— 提供 KubeJS 事件 ash_wok.cooked
//
// 作用：炒锅里的菜「刚做好」时，在锅上方喷出一大簇闪耀粒子：
//       环绕绽放环 + 上升星点 + 中心电火花爆发 + 金色火花 + 烟花爆发。
//
// 【踩坑】ash_wok.cooked 回调里，事件字段 level / pos 会被 KubeJS
//   以「隐式变量」注入作用域。若再写 const level = ... 会报
//   "redeclaration of var level"。所以回调内直接用 level / pos，
//   或用 typeof 兜底回退到 event 字段。
// ==============================================================

// priority: 0
// kubejs/server_scripts/kaleidoscope_effects/pot_cooked_sparkle.js

(function () {
    const DEBUG = false; // 调试开关
    function log(msg) { if (DEBUG) console.info(msg); }

    let ParticleTypes;
    try {
        ParticleTypes = Java.loadClass('net.minecraft.core.particles.ParticleTypes');
    } catch (e) {
        console.error('[WokSparkle] 无法加载 ParticleTypes，粒子特效已禁用: ' + e);
        return;
    }

    // 环上轮换的闪耀粒子
    const SPARK_TYPES = [
        ParticleTypes.ELECTRIC_SPARK,
        ParticleTypes.END_ROD,
        ParticleTypes.ELECTRIC_SPARK
    ];

    /**
     * 在炒锅上方喷一大簇闪耀粒子。
     * @param {Internal.ServerLevel} lvl
     * @param {Internal.BlockPos} bp
     */
    function spawnSparkle(lvl, bp) {
        if (!lvl || !bp) return;

        const cx = bp.getX() + 0.5;
        const cy = bp.getY() + 0.15; // 略高于锅口
        const cz = bp.getZ() + 0.5;
        const random = lvl.getRandom();

        // ---- 第 1 层：外圈「绽放环」——两圈星点向外扩张 ----
        const ringCount = 28;
        for (let i = 0; i < ringCount; i++) {
            const angle = (Math.PI * 2 / ringCount) * i;
            const radius = 1.0 + random.nextDouble() * 0.6;
            const dx = Math.cos(angle) * radius;
            const dz = Math.sin(angle) * radius;
            const type = SPARK_TYPES[i % SPARK_TYPES.length];
            lvl.sendParticles(type, cx, cy, cz, 2, dx, 0.2, dz, 0.16);
        }

        // ---- 第 2 层：内圈较快的小环 ----
        const innerCount = 16;
        for (let i = 0; i < innerCount; i++) {
            const angle = (Math.PI * 2 / innerCount) * i + 0.3;
            const radius = 0.5 + random.nextDouble() * 0.3;
            const dx = Math.cos(angle) * radius;
            const dz = Math.sin(angle) * radius;
            lvl.sendParticles(ParticleTypes.ELECTRIC_SPARK, cx, cy + 0.05, cz, 1, dx, 0.25, dz, 0.1);
        }

        // ---- 第 3 层：锅口上方大量上升的末地烛白光（星点雨）----
        lvl.sendParticles(ParticleTypes.END_ROD, cx, cy + 0.4, cz, 40, 0.45, 0.5, 0.45, 0.06);
        lvl.sendParticles(ParticleTypes.ELECTRIC_SPARK, cx, cy + 0.6, cz, 25, 0.35, 0.4, 0.35, 0.05);

        // ---- 第 4 层：中心电火花大爆发 ----
        lvl.sendParticles(ParticleTypes.ELECTRIC_SPARK, cx, cy + 0.2, cz, 50, 0.3, 0.35, 0.3, 0.35);
        lvl.sendParticles(ParticleTypes.END_ROD, cx, cy + 0.2, cz, 20, 0.2, 0.25, 0.2, 0.25);

        // ---- 第 5 层：金色火花（WAX_ON）飞溅 ----
        lvl.sendParticles(ParticleTypes.WAX_ON, cx, cy + 0.15, cz, 20, 0.4, 0.3, 0.4, 0.15);


        // ---- 第 7 层：烟花火花（更绚丽的爆裂感）----
        lvl.sendParticles(ParticleTypes.FIREWORK, cx, cy + 0.3, cz, 30, 0.35, 0.35, 0.35, 0.15);

        // ---- 第 8 层：闪光一闪（FLASH）----
        lvl.sendParticles(ParticleTypes.FLASH, cx, cy + 0.25, cz, 1, 0, 0, 0, 0);
    }

    // 入口：炒锅「烹饪完成」事件
    ash_wok.cooked(function (event) {
        try {
            var lv = (typeof level !== 'undefined') ? level : event.level;
            var bp = (typeof pos !== 'undefined') ? pos : event.pos;
            if (!lv || !bp) return;
            spawnSparkle(lv, bp);
            log('[WokSparkle] 炒锅完成，已在 ' + bp + ' 喷出闪耀粒子');
        } catch (e) {
            console.error('[WokSparkle] 生成粒子失败: ' + e);
        }
    });

    console.info('[WokSparkle] pot_cooked_sparkle.js 已加载（炒锅烹饪完成 → 闪耀粒子·加强版）');
})();