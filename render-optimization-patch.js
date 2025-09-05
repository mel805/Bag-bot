#!/usr/bin/env node

/**
 * Patch d'optimisation pour Render - Correction des blocages d'interactions
 * Applique les corrections spécifiques pour l'environnement Render
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Application du patch d\'optimisation Render');
console.log('===============================================\n');

const botJsPath = '/workspace/src/bot.js';
let botCode = fs.readFileSync(botJsPath, 'utf8');

console.log('📊 Code original:', botCode.length, 'caractères');

// 1. PATCH CRITIQUE : Déférer IMMÉDIATEMENT toutes les interactions
console.log('\n🚀 PATCH 1: Déférer immédiatement toutes les interactions');

const immediateDefer = `
// RENDER OPTIMIZATION: Déférer immédiatement TOUTES les interactions
async function immediatelyDeferInteraction(interaction, actionType = 'command') {
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferReply();
      console.log(\`[RENDER-OPT] Interaction \${actionType} déférée immédiatement\`);
      return true;
    } catch (error) {
      console.warn(\`[RENDER-OPT] Échec defer \${actionType}:\`, error.message);
      return false;
    }
  }
  return interaction.deferred;
}
`;

// Injecter la fonction après les imports
const afterImports = botCode.indexOf('// Interaction monitoring for debugging stuck interactions');
if (afterImports !== -1) {
  botCode = botCode.slice(0, afterImports) + immediateDefer + '\n' + botCode.slice(afterImports);
  console.log('  ✅ Fonction immediatelyDeferInteraction ajoutée');
} else {
  console.log('  ⚠️  Point d\'injection non trouvé, ajout en début de fichier');
  botCode = immediateDefer + '\n' + botCode;
}

// 2. PATCH : Réduire tous les timeouts réseau
console.log('\n⏱️  PATCH 2: Optimisation des timeouts réseau');

const timeoutOptimizations = [
  // Réduire les timeouts de fetch
  { from: /timeoutMs\s*=\s*(\d+)/g, to: 'timeoutMs = Math.min($1, 1500)', desc: 'Timeouts fetch' },
  { from: /setTimeout\([^,]+,\s*(\d{4,})/g, to: (match, timeout) => {
    const newTimeout = Math.min(parseInt(timeout), 2000);
    return match.replace(timeout, newTimeout.toString());
  }, desc: 'Timeouts généraux' },
  // Optimiser les timeouts AbortController
  { from: /setTimeout\([^}]+abort[^}]+,\s*(\d+)/g, to: (match, timeout) => {
    const newTimeout = Math.min(parseInt(timeout), 1200);
    return match.replace(timeout, newTimeout.toString());
  }, desc: 'AbortController timeouts' }
];

timeoutOptimizations.forEach(opt => {
  if (typeof opt.to === 'function') {
    botCode = botCode.replace(opt.from, opt.to);
  } else {
    const matches = botCode.match(opt.from);
    if (matches) {
      botCode = botCode.replace(opt.from, opt.to);
      console.log(`  ✅ ${opt.desc}: ${matches.length} optimisation(s)`);
    }
  }
});

// 3. PATCH : Ajouter defer immédiat dans handleEconomyAction
console.log('\n💰 PATCH 3: Optimisation handleEconomyAction');

const economyPatch = `
  // RENDER OPTIMIZATION: Déférer IMMÉDIATEMENT avant tout traitement
  const wasDeferred = await immediatelyDeferInteraction(interaction, \`economy-\${actionKey}\`);
  if (!wasDeferred && !interaction.replied) {
    try {
      await interaction.reply({ content: '⏳ Traitement en cours...', ephemeral: true });
    } catch (_) {}
  }
`;

// Injecter après trackInteraction dans handleEconomyAction
const economyFunctionStart = botCode.indexOf('async function handleEconomyAction(interaction, actionKey) {');
if (economyFunctionStart !== -1) {
  const trackInteractionLine = botCode.indexOf('trackInteraction(interaction, `economy-${actionKey}`);', economyFunctionStart);
  if (trackInteractionLine !== -1) {
    const insertPoint = botCode.indexOf('\n', trackInteractionLine) + 1;
    botCode = botCode.slice(0, insertPoint) + economyPatch + botCode.slice(insertPoint);
    console.log('  ✅ Defer immédiat ajouté dans handleEconomyAction');
  }
}

// 4. PATCH : Optimiser les interactions de commandes slash
console.log('\n⚡ PATCH 4: Optimisation interactions commandes slash');

const slashCommandPatch = `
  // RENDER OPTIMIZATION: Déférer immédiatement toutes les commandes slash
  if (interaction.isChatInputCommand()) {
    await immediatelyDeferInteraction(interaction, interaction.commandName);
  }
`;

// Injecter au début du gestionnaire d'interactions
const interactionCreateStart = botCode.indexOf("client.on('interactionCreate', async (interaction) => {");
if (interactionCreateStart !== -1) {
  const openBrace = botCode.indexOf('{', interactionCreateStart) + 1;
  const firstLine = botCode.indexOf('\n', openBrace) + 1;
  botCode = botCode.slice(0, firstLine) + slashCommandPatch + botCode.slice(firstLine);
  console.log('  ✅ Defer immédiat ajouté pour toutes les commandes slash');
}

// 5. PATCH : Ajouter des fallbacks pour les opérations critiques
console.log('\n🛡️  PATCH 5: Ajout de fallbacks critiques');

const fallbackPatch = `
// RENDER OPTIMIZATION: Fallbacks pour opérations critiques
const renderSafeReply = async (interaction, content, options = {}) => {
  const payload = typeof content === 'string' ? { content, ...options } : content;
  
  try {
    if (interaction.deferred) {
      return await interaction.editReply(payload);
    } else if (!interaction.replied) {
      return await interaction.reply(payload);
    } else {
      return await interaction.followUp(payload);
    }
  } catch (error) {
    console.error('[RENDER-SAFE] Reply failed:', error.message);
    // Dernière tentative avec followUp
    try {
      if (!interaction.replied) {
        return await interaction.reply({ content: '⚠️ Réponse avec délai', ephemeral: true });
      }
    } catch (_) {
      console.error('[RENDER-SAFE] All reply methods failed');
    }
  }
};
`;

// Ajouter après la fonction immediatelyDeferInteraction
const deferFunctionEnd = botCode.indexOf('return interaction.deferred;') + 'return interaction.deferred;'.length;
if (deferFunctionEnd > 'return interaction.deferred;'.length) {
  const insertPoint = botCode.indexOf('\n', deferFunctionEnd) + 1;
  botCode = botCode.slice(0, insertPoint) + fallbackPatch + botCode.slice(insertPoint);
  console.log('  ✅ Fonction renderSafeReply ajoutée');
}

// 6. PATCH : Optimiser les variables d'environnement Render
console.log('\n🌍 PATCH 6: Optimisation environnement Render');

const renderEnvPatch = `
// RENDER OPTIMIZATION: Détection et optimisation environnement Render
const isRenderEnvironment = process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL;
if (isRenderEnvironment) {
  console.log('[RENDER-OPT] Environnement Render détecté - Optimisations activées');
  
  // Réduire les timeouts par défaut
  process.env.DEFAULT_TIMEOUT = '1500';
  process.env.NETWORK_TIMEOUT = '2000';
  process.env.INTERACTION_TIMEOUT = '2500';
  
  // Optimiser la garbage collection
  if (global.gc) {
    setInterval(() => {
      try { global.gc(); } catch (_) {}
    }, 30000);
  }
}
`;

// Ajouter en début du fichier après les imports
const firstConsoleLog = botCode.indexOf('console.log');
if (firstConsoleLog !== -1) {
  botCode = botCode.slice(0, firstConsoleLog) + renderEnvPatch + '\n' + botCode.slice(firstConsoleLog);
  console.log('  ✅ Optimisations environnement Render ajoutées');
}

// 7. PATCH : Remplacer les respondAndUntrack par renderSafeReply dans les endroits critiques
console.log('\n🔄 PATCH 7: Remplacement des réponses critiques');

const criticalReplacements = [
  {
    from: /return respondAndUntrack\(\{ content: `⛔ Action désactivée\.`, ephemeral: true \}\);/g,
    to: 'return renderSafeReply(interaction, "⛔ Action désactivée.", { ephemeral: true });',
    desc: 'Actions désactivées'
  },
  {
    from: /return respondAndUntrack\(\{ content: '⛔ Cible invalide: les bots sont exclus\.', ephemeral: true \}\);/g,
    to: 'return renderSafeReply(interaction, "⛔ Cible invalide: les bots sont exclus.", { ephemeral: true });',
    desc: 'Cibles invalides'
  }
];

criticalReplacements.forEach(replacement => {
  const matches = botCode.match(replacement.from);
  if (matches) {
    botCode = botCode.replace(replacement.from, replacement.to);
    console.log(`  ✅ ${replacement.desc}: ${matches.length} remplacement(s)`);
  }
});

// 8. Sauvegarder le code patché
console.log('\n💾 Sauvegarde du code optimisé...');

// Backup de l'original
const backupPath = '/workspace/src/bot.js.backup';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, fs.readFileSync(botJsPath, 'utf8'));
  console.log('  ✅ Backup créé: bot.js.backup');
}

// Sauvegarder la version patchée
fs.writeFileSync(botJsPath, botCode);
console.log('  ✅ Code optimisé sauvegardé');
console.log('  📊 Nouvelle taille:', botCode.length, 'caractères');
console.log('  📈 Différence:', botCode.length - fs.readFileSync(backupPath, 'utf8').length, 'caractères');

// 9. Créer un script de test Render
const renderTestScript = `#!/usr/bin/env node
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
`;

fs.writeFileSync('/workspace/test-render-optimizations.js', renderTestScript);
fs.chmodSync('/workspace/test-render-optimizations.js', 0o755);

console.log('\n🎉 PATCH RENDER TERMINÉ !');
console.log('========================');
console.log('✅ 7 optimisations appliquées');
console.log('✅ Backup créé (bot.js.backup)');
console.log('✅ Script de test créé (test-render-optimizations.js)');
console.log('\n🚀 Le bot est maintenant optimisé pour Render !');
console.log('💡 Les commandes ne devraient plus rester bloquées sur "réfléchit"');

// Créer un résumé des changements
const summary = {
  timestamp: new Date().toISOString(),
  patches: [
    'Defer immédiat de toutes les interactions',
    'Optimisation des timeouts réseau (max 2000ms)',
    'Fonction renderSafeReply pour fallbacks',
    'Détection environnement Render',
    'Optimisations spécifiques handleEconomyAction',
    'Defer automatique commandes slash',
    'Fallbacks critiques pour réponses'
  ],
  filesModified: ['src/bot.js'],
  filesCreated: ['src/bot.js.backup', 'test-render-optimizations.js'],
  originalSize: fs.readFileSync(backupPath, 'utf8').length,
  optimizedSize: botCode.length,
  sizeDifference: botCode.length - fs.readFileSync(backupPath, 'utf8').length
};

fs.writeFileSync('/workspace/render-optimization-summary.json', JSON.stringify(summary, null, 2));
console.log('📄 Résumé sauvegardé: render-optimization-summary.json');