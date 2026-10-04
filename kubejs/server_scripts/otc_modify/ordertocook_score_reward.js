// ==============================================================
// DEPENDENCIES (required mods):
//   OrderToCook (ordertocook); depends on otc_reward_logic.js (otcGiveReward)
// ==============================================================
// priority: 50
// kubejs/server_scripts/otc_modify/ordertocook_score_reward.js
// =====================================================================
// OrderToCook reward registrar.
// Listens to OrderLifecycleApi COMPLETED (server-side, has Player + OrderView).
// Listener body only calls otcGiveReward(player, order).
//
// OrderLifecycleApi has no unregister and KubeJS blocks reflection,
// so the listener cannot be replaced on /reload.
//   -> Edit otc_reward_logic.js for reward changes (/reload works).
//   -> Edit THIS file -> requires game RESTART.
// =====================================================================

(function () {
    function otcLog(msg) { console.info("[OTC-ScoreReward] " + msg); }

    var LISTENER_ID = "ordertocook_score_reward:main";

    try {
        var OrderLifecycleApi = Java.loadClass("cn.breezeth.ordertocook.api.OrderLifecycleApi");
        var RL = Java.loadClass("net.minecraft.resources.ResourceLocation");

        var listenerImpl = {
            onOrderEvent: function (ev) {
                try {
                    if (String(ev.type()) !== "COMPLETED") return;
                    var player = ev.player();
                    var order = ev.order();
                    if (!player || !order) return;

                    if (typeof otcGiveReward === "function") {
                        otcGiveReward(player, order);
                        otcLog("order completed " + order.orderId() + " -> reward given");
                    } else {
                        otcLog("WARN: otcGiveReward not defined (check otc_reward_logic.js)");
                    }
                } catch (e) {
                    otcLog("onOrderEvent error: " + e);
                }
            }
        };

        try {
            OrderLifecycleApi.register(RL.parse(LISTENER_ID), 0, listenerImpl);
            otcLog("OrderLifecycleApi listener registered");
        } catch (regErr) {
            otcLog("register skipped (listener exists): " + regErr);
        }

    } catch (e) {
        otcLog("load failed: " + e);
    }

    console.info("[OTC-ScoreReward] ========== reward registrar loaded ==========");
})();

