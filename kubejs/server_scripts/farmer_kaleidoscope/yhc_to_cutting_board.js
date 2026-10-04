// ==============================================================
// DEPENDENCIES (required mods):
//   Youkaishomecoming (youkaishomecoming), MrCrayfish's Furniture Refurbished (refurbished_furniture), Farmer's Delight (farmersdelight)
// ==============================================================
// priority: 1
// kubejs/server_scripts/farmer_kaleidoscope/yhc_to_cutting_board.js
// =====================================================================
// 【配方转换】妖怪归家料理台 → MrCrayfish 家具 切菜板拼装（combining）
// ---------------------------------------------------------------------
// 关键机制（javap 反汇编 + 数据包实证）：
//   料理台的 base（sushi/gunkan/hosomaki/futomaki/california）【不是物品】，
//   而是 TableItem 的中间状态 ID。它们由【放上去的标签物品】生成：
//     cuisine/cooked_rice 标签 (RICE)   = farmersdelight:cooked_rice 等
//     cuisine/dried_kelp  标签          = minecraft:dried_kelp
//   base 展开规则（据字节码 + tobiko_gunkan 的 workbench 配方）：
//     sushi                       -> [cooked_rice 标签]
//     gunkan/hosomaki/futomaki/
//     california                  -> [cooked_rice 标签, dried_kelp 标签]
//     california_roll (成品物品)   -> [item youkaishomecoming:california_roll]
//
// 用户规则：
//   Q1 全转  Q4 tag 保留  Q5 count 照搬  Q6 不加前缀  Q7 取代
//   Q3 展开后 ingredient 数 > 5 的跳过（并保留其料理台配方，避免死区）
//
// 数据来源：youkaishomecoming 内建 cuisine_* 配方 JSON（已逐个读取）。
//   cuisine_ordered(15) 全转；cuisine_mixed(7) 转 5 个；
//   超限跳过：salmon_futomaki、rainbow_futomaki。cuisine_fixed(3) 无配料不转。
// =====================================================================

(function () {
    const DEBUG = true;
    function log(m) { if (DEBUG) console.info('[YHC2CB] ' + m); }

    const COMBINING = 'refurbished_furniture:cutting_board_combining';
    const B = 'youkaishomecoming:';
    const RICE = { tag: B + 'cuisine/cooked_rice' };
    const KELP = { tag: B + 'cuisine/dried_kelp' };

    // base 展开
    function baseIng(name) {
        switch (name) {
            case B + 'sushi':           return [ RICE ];
            case B + 'gunkan':          return [ RICE, KELP ];
            case B + 'hosomaki':        return [ RICE, KELP ];
            case B + 'futomaki':        return [ RICE, KELP ];
            case B + 'california':      return [ RICE, KELP ];
            case B + 'california_roll': return [ { item: B + 'california_roll' } ];
            default: return null; // 未知 base
        }
    }

    // 原始配方（不含 base）：{ name, base, ing(配料), result }
    const RAW = [
        // ===== cuisine_ordered =====
        { name:'cod_roll', base:B+'sushi', result:{count:2,id:'farmersdelight:cod_roll'},
          ing:[ {tag:'c:foods/safe_raw_fish'} ] },
        { name:'salmon_roll', base:B+'sushi', result:{count:2,id:'farmersdelight:salmon_roll'},
          ing:[ {tag:'c:foods/raw_salmon'} ] },
        { name:'tuna_nigiri', base:B+'sushi', result:{count:2,id:B+'tuna_nigiri'},
          ing:[ {tag:B+'raw_tuna'} ] },
        { name:'otoro_nigiri', base:B+'sushi', result:{count:2,id:B+'otoro_nigiri'},
          ing:[ {item:B+'otoro'} ] },
        { name:'egg_nigiri', base:B+'sushi', result:{count:2,id:B+'egg_nigiri'},
          ing:[ {item:B+'tamagoyaki'}, {tag:B+'cuisine/dried_kelp'} ] },
        { name:'flesh_roll', base:B+'sushi', result:{count:2,id:B+'flesh_roll'},
          ing:[ {tag:B+'raw_flesh'}, {tag:B+'cuisine/dried_kelp'} ] },
        { name:'lorelei_nigiri', base:B+'sushi', result:{count:2,id:B+'lorelei_nigiri'},
          ing:[ {item:B+'kabayaki'}, {tag:B+'cuisine/dried_kelp'} ] },
        { name:'tobiko_gunkan', base:B+'gunkan', result:{count:2,id:B+'tobiko_gunkan'},
          ing:[ {item:B+'roe'} ] },
        { name:'nattou_gunkan', base:B+'gunkan', result:{count:2,id:B+'nattou_gunkan'},
          ing:[ {item:B+'nattou'} ] },
        { name:'seagrass_gunkan', base:B+'gunkan', result:{count:2,id:B+'seagrass_gunkan'},
          ing:[ {item:'minecraft:seagrass'} ] },
        { name:'kappa_maki', base:B+'hosomaki', result:{count:1,id:B+'kappa_maki'},
          ing:[ {item:B+'soy_sauce_bottle'}, {tag:B+'cucumber_slice'} ] },
        { name:'shinnko_maki', base:B+'hosomaki', result:{count:1,id:B+'shinnko_maki'},
          ing:[ {item:B+'soy_sauce_bottle'}, {tag:'c:vegetables/beetroot'} ] },
        { name:'tekka_maki', base:B+'hosomaki', result:{count:1,id:B+'tekka_maki'},
          ing:[ {item:B+'soy_sauce_bottle'}, {tag:B+'raw_tuna'} ] },
        { name:'kelp_roll', base:B+'hosomaki', result:{count:1,id:'farmersdelight:kelp_roll'},
          ing:[ {tag:'c:vegetables/carrot'} ] },
        { name:'roe_california_roll', base:B+'california_roll', result:{count:1,id:B+'roe_california_roll'},
          ing:[ {item:B+'crab_roe'} ] },

        // ===== cuisine_mixed（5 个）=====
        { name:'california_roll', base:B+'california', result:{count:1,id:B+'california_roll'},
          ing:[ {item:B+'mayonnaise_bottle'}, {tag:B+'cucumber_slice'},
                {item:B+'tamagoyaki_slice'}, {item:B+'imitation_crab'} ] },
        { name:'egg_futomaki', base:B+'futomaki', result:{count:1,id:B+'egg_futomaki'},
          ing:[ {item:B+'soy_sauce_bottle'},
                {item:B+'tamagoyaki_slice'}, {item:B+'tamagoyaki_slice'}, {item:B+'tamagoyaki_slice'} ] },
        { name:'rainbow_roll', base:B+'california_roll', result:{count:1,id:B+'rainbow_roll'},
          ing:[ {item:B+'crab_roe'}, {tag:'c:foods/raw_salmon'},
                {tag:'c:foods/safe_raw_fish'}, {tag:B+'raw_tuna'} ] },
        { name:'salmon_lover_roll', base:B+'california_roll', result:{count:1,id:B+'salmon_lover_roll'},
          ing:[ {item:B+'crab_roe'}, {tag:'c:foods/raw_salmon'},
                {tag:'c:foods/raw_salmon'}, {tag:'c:foods/raw_salmon'} ] },
        { name:'volcano_roll', base:B+'california_roll', result:{count:1,id:B+'volcano_roll'},
          ing:[ {item:B+'soy_sauce_bottle'}, {tag:B+'raw_tuna'},
                {item:B+'otoro'}, {tag:B+'raw_tuna'} ] }
    ];

    // 每类料理台配方的命名空间前缀（用于按 id 精确禁用）
    //   cuisine_ordered 全转 -> 用 type remove
    //   cuisine_mixed 只有【转换成功的】才按 id 禁用（关键：超限的必须保留，否则死区）
    const REMOVE_PREFIX = {
        'cod_roll': B+'cuisine_ordered/', 'salmon_roll': B+'cuisine_ordered/',
        'tuna_nigiri': B+'cuisine_ordered/', 'otoro_nigiri': B+'cuisine_ordered/',
        'egg_nigiri': B+'cuisine_ordered/', 'flesh_roll': B+'cuisine_ordered/',
        'lorelei_nigiri': B+'cuisine_ordered/', 'tobiko_gunkan': B+'cuisine_ordered/',
        'nattou_gunkan': B+'cuisine_ordered/', 'seagrass_gunkan': B+'cuisine_ordered/',
        'kappa_maki': B+'cuisine_ordered/', 'shinnko_maki': B+'cuisine_ordered/',
        'tekka_maki': B+'cuisine_ordered/', 'kelp_roll': B+'cuisine_ordered/',
        'roe_california_roll': B+'cuisine_ordered/',
        'california_roll': B+'cuisine_mixed/', 'egg_futomaki': B+'cuisine_mixed/',
        'rainbow_roll': B+'cuisine_mixed/', 'salmon_lover_roll': B+'cuisine_mixed/',
        'volcano_roll': B+'cuisine_mixed/'
    };

    ServerEvents.recipes(event => {
        let ok = 0, skip = 0;
        let successNames = [];

        for (let i = 0; i < RAW.length; i++) {
            let r = RAW[i];
            let bc = baseIng(r.base);
            if (!bc) { log('未知base, 跳过: ' + r.name + ' base=' + r.base); skip++; continue; }
            let ing = bc.concat(r.ing);
            if (ing.length > 5) { log('超5跳过: ' + r.name + ' = ' + ing.length + ' 项'); skip++; continue; }
            event.custom({
                type: COMBINING,
                ingredients: ing,
                result: r.result
            }).id('refurbished_furniture:combining/yhc_' + r.name);
            ok++;
            successNames.push(r.name);
        }
        log('已注册 ' + ok + ' 个切菜板配方，跳过 ' + skip + ' 个');

        // 禁用【转换成功的】料理台配方（按 id 精确删，超限的保留 -> 无死区）
        for (let i = 0; i < successNames.length; i++) {
            let id = REMOVE_PREFIX[successNames[i]] + successNames[i];
            event.remove({ id: id });
        }
        log('已禁用 ' + successNames.length + ' 个对应的料理台配方');
    });

    console.info('[YHC2CB] ========== 料理台→切菜板 配方转换模块已加载 ==========');
})();
