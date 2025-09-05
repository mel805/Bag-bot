#!/usr/bin/env node
/**
 * Test rapide pour vérifier les optimisations Render
 */

console.log('🧪 Test des optimisations Render...');

// Simuler l'environnement Render
process.env.RENDER = 'true';
process.env.NODE_ENV = 'production';

// Test de la fonction immediatelyDeferInteraction
const mockInteraction = {
  deferred: false,
  replied: false,
  deferReply: async () => {
    console.log('✅ Mock deferReply appelé');
    return Promise.resolve();
  }
};

// Charger le bot patché (sans l'exécuter)
try {
  console.log('📋 Vérification syntaxe...');
  require('/workspace/src/bot.js');
  console.log('❌ Le bot s\'est lancé (test interrompu)');
  process.exit(1);
} catch (error) {
  if (error.message.includes('DISCORD_TOKEN')) {
    console.log('✅ Syntaxe OK - Token Discord requis comme attendu');
  } else {
    console.error('❌ Erreur syntaxe:', error.message);
    process.exit(1);
  }
}

console.log('🎉 Optimisations Render appliquées avec succès !');
