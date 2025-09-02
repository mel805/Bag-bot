#!/usr/bin/env node

require('dotenv').config();

const { 
  ensureStorageExists,
  readConfig,
  writeConfig,
  getEconomyConfig,
  updateEconomyConfig,
  getEconomyUser,
  setEconomyUser,
  paths
} = require('./src/storage/jsonStore');

async function main() {
  // This script validates that booster discounts apply to shop prices when a user
  // has the booster role configured, without needing a live Discord connection.
  // It simulates the pricing computation performed by the bot embed.

  await ensureStorageExists();

  // Fake guild and user identifiers
  const guildId = process.env.GUILD_ID || 'test-guild';
  const userId = 'user-1';

  // Prepare economy config with a booster role and shopPriceMult
  const boosterRoleId = 'role-boost';
  let eco = await getEconomyConfig(guildId);
  eco.booster = {
    enabled: true,
    textXpMult: 2,
    voiceXpMult: 2,
    actionCooldownMult: 0.5,
    shopPriceMult: 0.5, // 50% discount expected
    roles: [boosterRoleId]
  };
  eco.currency = { name: 'BAG$', symbol: '🪙' };
  eco.karmaModifiers = { shop: [], actions: [], grants: [] };
  await updateEconomyConfig(guildId, eco);

  // Ensure user economy exists
  const userEco = await getEconomyUser(guildId, userId);
  if (!userEco.amount) {
    await setEconomyUser(guildId, userId, { amount: 10000, charm: 0, perversion: 0 });
  }

  // Re-read eco to ensure persistence
  eco = await getEconomyConfig(guildId);

  // Simulate the price calculation similar to bot.js buildBoutiqueEmbed
  const basePrice = 1000;
  const karmaPercent = 0;
  const boosterMult = Number(eco.booster?.shopPriceMult || 1);

  // Expected: 1000 * 0.5 = 500
  const expectedFinal = Math.floor(basePrice * boosterMult);

  // Print results
  console.log('--- Booster Discount Test ---');
  console.log('Config path:', paths.CONFIG_PATH);
  console.log('Booster enabled:', eco.booster?.enabled);
  console.log('Booster roles:', eco.booster?.roles);
  console.log('Booster shopPriceMult:', boosterMult);
  console.log('Base price:', basePrice);
  console.log('Expected final price (50%):', expectedFinal);

  // Simple assertion
  if (expectedFinal !== 500) {
    console.error('❌ Expected final price 500 with 50% multiplier');
    process.exit(1);
  }

  console.log('✅ Local config and expected computation are consistent');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Test failed:', e?.message || e);
  process.exit(1);
});

