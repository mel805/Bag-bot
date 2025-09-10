const fs = require('fs');

/**
 * Debug de l'interface Truth/Dare pour identifier le problème
 */

function debugTruthDareInterface() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // Ajouter des logs de debug dans la fonction d'ajout de prompts
  const addPromptsPattern = /if \(interaction\.isModalSubmit\(\) && interaction\.customId\.startsWith\('td_prompts_add:'\)\) \{/;
  
  if (content.match(addPromptsPattern)) {
    // Trouver la fonction et ajouter des logs
    const addPromptsIndex = content.search(addPromptsPattern);
    const functionStart = content.indexOf('{', addPromptsIndex) + 1;
    
    const debugLogs = `
      console.log('[TD DEBUG] Modal submit detected:', interaction.customId);
      const debugParts = interaction.customId.split(':');
      console.log('[TD DEBUG] Parts:', debugParts);
      const debugType = debugParts[1] || 'action';
      const debugMode = debugParts[2] || 'sfw';
      console.log('[TD DEBUG] Type:', debugType, 'Mode:', debugMode);
`;

    content = content.slice(0, functionStart) + debugLogs + content.slice(functionStart);
    console.log('✅ Logs de debug ajoutés dans l\'ajout de prompts');
  }

  // Ajouter des logs dans la fonction addTdPrompts elle-même
  const addTdPromptsCall = content.indexOf('await addTdPrompts(interaction.guild.id, type, textsRaw, mode);');
  
  if (addTdPromptsCall !== -1) {
    const beforeCall = content.slice(0, addTdPromptsCall);
    const afterCall = content.slice(addTdPromptsCall);
    
    const debugCall = `console.log('[TD DEBUG] Calling addTdPrompts with:', { guildId: interaction.guild.id, type, textsCount: textsRaw.length, mode });
      const addResult = await addTdPrompts(interaction.guild.id, type, textsRaw, mode);
      console.log('[TD DEBUG] addTdPrompts result:', addResult.length, 'prompts total');`;
    
    content = beforeCall + debugCall + afterCall.replace('await addTdPrompts(interaction.guild.id, type, textsRaw, mode);', '');
    console.log('✅ Logs de debug ajoutés dans l\'appel addTdPrompts');
  }

  // Sauvegarder
  const backupPath = botFilePath + '.backup-debug-td';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Debug Truth/Dare ajouté');

  return true;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Ajout de debug Truth/Dare...\n');
  
  const success = debugTruthDareInterface();
  
  if (success) {
    console.log('\n🎉 Debug ajouté avec succès !');
    console.log('\n📋 Logs ajoutés:');
    console.log('  ✅ Detection du modal submit');
    console.log('  ✅ Parsing des paramètres');
    console.log('  ✅ Appel addTdPrompts avec résultat');
    console.log('\n📋 Prochaines étapes:');
    console.log('  1. pm2 restart bagbot');
    console.log('  2. Aller dans Discord /config → Action/Vérité');
    console.log('  3. Ajouter un prompt et observer les logs');
    console.log('  4. pm2 logs bagbot --follow');
  } else {
    console.log('❌ Échec de l\'ajout de debug');
    process.exit(1);
  }
}