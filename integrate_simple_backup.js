const fs = require('fs');

/**
 * Intégration simple des commandes backup/restorer fonctionnelles
 */

function integrateSimpleBackup() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // 1. Ajouter l'import
  const importLine = "const SimpleBackupCommands = require('./simple_backup_commands');";
  
  if (!content.includes('SimpleBackupCommands')) {
    const firstRequire = content.indexOf("const ");
    if (firstRequire !== -1) {
      const lineEnd = content.indexOf('\n', firstRequire);
      content = content.slice(0, lineEnd + 1) + importLine + '\n' + content.slice(lineEnd + 1);
      console.log('✅ Import SimpleBackupCommands ajouté');
    }
  }

  // 2. Initialiser la classe
  const initLine = 'const simpleBackupCommands = new SimpleBackupCommands();';
  
  if (!content.includes('simpleBackupCommands = new SimpleBackupCommands')) {
    const clientReadyIndex = content.indexOf('client.once(Events.ClientReady');
    if (clientReadyIndex !== -1) {
      content = content.slice(0, clientReadyIndex) + initLine + '\n\n' + content.slice(clientReadyIndex);
      console.log('✅ Initialisation SimpleBackupCommands ajoutée');
    }
  }

  // 3. Ajouter la gestion des commandes backup et restorer
  const commandHandlers = `
    // Simple backup commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      return await simpleBackupCommands.handleBackupCommand(interaction);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'restorer') {
      return await simpleBackupCommands.handleRestorerCommand(interaction);
    }

    // Handle backup interactions
    if ((interaction.isButton() && (interaction.customId.startsWith('backup_') || interaction.customId.startsWith('restore_'))) ||
        (interaction.isStringSelectMenu() && interaction.customId === 'backup_select')) {
      return await simpleBackupCommands.handleInteraction(interaction);
    }`;

  // Trouver un bon endroit pour insérer les gestionnaires
  const insertPoint = content.indexOf('    // Economy standalone commands (aliases)');
  if (insertPoint !== -1) {
    content = content.slice(0, insertPoint) + commandHandlers + '\n\n    ' + content.slice(insertPoint);
    console.log('✅ Gestionnaires de commandes ajoutés');
  }

  // 4. Sauvegarder et écrire
  const backupPath = botFilePath + '.backup-simple-integration';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Intégration simple terminée');

  return true;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Intégration des commandes backup simples...\n');
  
  const success = integrateSimpleBackup();
  
  if (success) {
    console.log('\n🎉 Intégration réussie !');
    console.log('\n📋 Commandes intégrées:');
    console.log('  /backup    - Sauvegarde simple avec fichiers téléchargeables');
    console.log('  /restorer  - Sélecteur simple avec vrais noms');
    console.log('\n📋 Prochaines étapes:');
    console.log('  1. pm2 restart bagbot');
    console.log('  2. Tester les commandes');
  } else {
    console.log('❌ Échec de l\'intégration');
    process.exit(1);
  }
}

module.exports = { integrateSimpleBackup };