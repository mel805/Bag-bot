const fs = require('fs');

/**
 * Patch final pour intégrer BackupCommandsWithLogs avec système de logs
 */

async function applyLogsBackupPatch() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // 1. Remplacer l'import par BackupCommandsWithLogs
  if (content.includes('BackupCommandsImproved')) {
    content = content.replace(
      "const BackupCommandsImproved = require('./backup_commands_improved');",
      "const BackupCommandsWithLogs = require('./backup_commands_with_logs');"
    );
  } else if (content.includes('BackupCommandsSeparated')) {
    content = content.replace(
      "const BackupCommandsSeparated = require('./backup_commands_separated');",
      "const BackupCommandsWithLogs = require('./backup_commands_with_logs');"
    );
  } else if (content.includes('BackupCommands')) {
    content = content.replace(
      "const BackupCommands = require('./backup_commands');",
      "const BackupCommandsWithLogs = require('./backup_commands_with_logs');"
    );
  }

  // 2. Remplacer l'initialisation
  if (content.includes('new BackupCommandsImproved')) {
    content = content.replace(
      'const backupCommands = new BackupCommandsImproved();',
      'const backupCommands = new BackupCommandsWithLogs();'
    );
  } else if (content.includes('new BackupCommandsSeparated')) {
    content = content.replace(
      'const backupCommands = new BackupCommandsSeparated();',
      'const backupCommands = new BackupCommandsWithLogs();'
    );
  } else if (content.includes('new BackupCommands')) {
    content = content.replace(
      'const backupCommands = new BackupCommands();',
      'const backupCommands = new BackupCommandsWithLogs();'
    );
  }

  // 3. Supprimer complètement toute référence à /restore restante
  content = content.replace(/\/\/ Admin-only: \/restore[\s\S]*?}\s*}/g, '');
  content = content.replace(/if \(interaction\.isChatInputCommand\(\) && interaction\.commandName === 'restore'\) \{[\s\S]*?\}\s*}/g, '');

  // 4. Nettoyer les lignes vides multiples
  content = content.replace(/\n\n\n+/g, '\n\n');

  // 5. Sauvegarder le fichier modifié
  const backupPath = botFilePath + '.backup-logs-patch';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Patch logs appliqué au bot.js');

  return true;
}

// Fonction pour vérifier le patch
function verifyLogsPatch() {
  const botFilePath = './src/bot.js';
  
  console.log('\n🔍 === VÉRIFICATION DU PATCH LOGS ===');
  
  if (fs.existsSync(botFilePath)) {
    const botContent = fs.readFileSync(botFilePath, 'utf8');
    const hasWithLogs = botContent.includes('BackupCommandsWithLogs');
    const hasOldRestore = botContent.includes("commandName === 'restore'");
    
    console.log(`📁 bot.js:`);
    console.log(`  ${hasWithLogs ? '✅' : '❌'} BackupCommandsWithLogs importé`);
    console.log(`  ${!hasOldRestore ? '✅' : '❌'} Commande /restore supprimée`);
    
    return hasWithLogs && !hasOldRestore;
  }
  
  return false;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Application du patch final avec logs...\n');
  
  applyLogsBackupPatch().then(success => {
    if (success) {
      const verified = verifyLogsPatch();
      
      if (verified) {
        console.log('\n🎉 Patch final avec logs appliqué avec succès !');
        console.log('\n📋 Nouvelles fonctionnalités:');
        console.log('  ✅ Embeds détaillés dans les logs configurés');
        console.log('  ✅ Fichiers JSON téléchargeables');
        console.log('  ✅ Sélecteur paginé amélioré');
        console.log('  ✅ Historique complet des opérations');
        console.log('  ✅ Commande /restore supprimée');
        console.log('\n📋 Configuration requise:');
        console.log('  1. Utilisez /config dans Discord');
        console.log('  2. Allez dans "Logs"');
        console.log('  3. Activez et configurez le canal "backup"');
        console.log('\n📋 Commandes finales:');
        console.log('  /backup    - Sauvegarde avec logs détaillés');
        console.log('  /restorer  - Restauration avec logs et sélecteur');
        console.log('\n📋 Prochaines étapes:');
        console.log('  1. node deploy-commands.js (si nécessaire)');
        console.log('  2. pm2 restart bagbot');
        console.log('  3. Configurer le canal de logs via /config');
        console.log('  4. Tester /backup et /restorer');
      } else {
        console.log('❌ Vérification du patch échouée');
        process.exit(1);
      }
    } else {
      console.log('❌ Échec du patch logs');
      process.exit(1);
    }
  });
}

module.exports = { applyLogsBackupPatch, verifyLogsPatch };