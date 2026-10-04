// ==============================================================
// DEPENDENCIES (required mods):
//   OrderToCook (ordertocook)
// ==============================================================
// priority: 100
// kubejs/server_scripts/otc_modify/otc_reward_logic.js
// =====================================================================
// OrderToCook order reward - LOGIC layer.
// Defines otcGiveReward(player, order), called by the listener that is
// registered in ordertocook_score_reward.js.
//
// NOTE: the OrderLifecycleApi listener binds to the script scope at the
//   moment of registration; changing this file does NOT take effect on
//   /reload. After editing, RESTART THE GAME.
//
// order: OrderView { orderId, customerName, machineId, delivery,
//                    longDistance, urgent, expiryTick, prestige, foods }
// =====================================================================

function otcGiveReward(player, order) {
    // Fixed reward: 2 diamonds regardless of order content.
    // TODO: replace with score-based payout later.
    player.give(Item.of("minecraft:diamond", 2));
}

console.info("[OTC-Reward] reward logic loaded/refreshed (diamonds=2)");

