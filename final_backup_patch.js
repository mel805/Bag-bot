const fs = require('fs');

/**
 * Patch final pour:
 * 1. Supprimer la commande /restore
 * 2. Intégrer BackupCommandsImproved
 * 3. Nettoyer les anciennes références
 */

async function applyFinalBackupPatch() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // 1. Remplacer l'import par BackupCommandsImproved
  content = content.replace(
    "const BackupCommandsSeparated = require('./backup_commands_separated');",
    "const BackupCommandsImproved = require('./backup_commands_improved');"
  );

  // 2. Remplacer l'initialisation
  content = content.replace(
    'const backupCommands = new BackupCommandsSeparated();',
    'const backupCommands = new BackupCommandsImproved();'
  );

  // 3. Supprimer complètement la gestion de la commande /restore
  const restoreCommandPattern = /\/\/ Admin-only: \/restore[\s\S]*?try \{ return await interaction\.editReply\({ content: 'Erreur restauration\.' }\); \} catch \(_\) \{ try \{ return await interaction\.followUp\({ content: 'Erreur restauration\.', ephemeral: true }\); \} catch \(_\) \{ return; \} \}\s*\}\s*\}/;
  
  if (content.match(restoreCommandPattern)) {
    content = content.replace(restoreCommandPattern, '');
    console.log('✅ Ancienne commande /restore supprimée');
  }

  // 4. Supprimer aussi les références à /restore dans les commentaires et conditions
  content = content.replace(/if \(interaction\.isChatInputCommand\(\) && interaction\.commandName === 'restore'\) \{[\s\S]*?\}\s*\}/g, '');

  // 5. Nettoyer les lignes vides multiples
  content = content.replace(/\n\n\n+/g, '\n\n');

  // 6. Sauvegarder le fichier modifié
  const backupPath = botFilePath + '.backup-final-patch';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Patch final appliqué au bot.js');

  return true;
}

// Mettre à jour deploy-commands.js pour supprimer /restore
function removeRestoreFromDeploy() {
  const deployPath = './deploy-commands.js';
  
  if (!fs.existsSync(deployPath)) {
    console.error('❌ Fichier deploy-commands.js introuvable');
    return false;
  }

  let content = fs.readFileSync(deployPath, 'utf8');
  
  // Supprimer complètement la définition de la commande restore
  content = content.replace(
    /new SlashCommandBuilder\(\)\s*\.setName\('restore'\)[\s\S]*?\.toJSON\(\),?\s*/g,
    ''
  );

  // Nettoyer les virgules doubles et espaces
  content = content.replace(/,\s*,/g, ',');
  content = content.replace(/\n\n\n+/g, '\n\n');

  // Sauvegarder
  const backupPath = deployPath + '.backup-final';
  fs.copyFileSync(deployPath, backupPath);
  console.log(`💾 Sauvegarde deploy-commands créée: ${backupPath}`);

  fs.writeFileSync(deployPath, content);
  console.log('✅ Commande /restore supprimée de deploy-commands.js');

  return true;
}

// Fonction pour vérifier le nettoyage
function verifyCleanup() {
  const botFilePath = './src/bot.js';
  const deployPath = './deploy-commands.js';
  
  console.log('\n🔍 === VÉRIFICATION DU NETTOYAGE ===');
  
  // Vérifier bot.js
  if (fs.existsSync(botFilePath)) {
    const botContent = fs.readFileSync(botFilePath, 'utf8');
    const hasOldRestore = botContent.includes("commandName === 'restore'");
    const hasImproved = botContent.includes('BackupCommandsImproved');
    
    console.log(`📁 bot.js:`);
    console.log(`  ${hasImproved ? '✅' : '❌'} BackupCommandsImproved importé`);
    console.log(`  ${!hasOldRestore ? '✅' : '❌'} Commande /restore supprimée`);
  }
  
  // Vérifier deploy-commands.js
  if (fs.existsSync(deployPath)) {
    const deployContent = fs.readFileSync(deployPath, 'utf8');
    const hasRestoreCommand = deployContent.includes(".setName('restore')");
    
    console.log(`📁 deploy-commands.js:`);
    console.log(`  ${!hasRestoreCommand ? '✅' : '❌'} Définition /restore supprimée`);
  }
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Application du patch final...\n');
  
  applyFinalBackupPatch().then(success => {
    if (success) {
      const deploySuccess = removeRestoreFromDeploy();
      
      if (deploySuccess) {
        verifyCleanup();
        
        console.log('\n🎉 Patch final appliqué avec succès !');
        console.log('\n📋 Modifications:');
        console.log('  ✅ BackupCommandsImproved intégré');
        console.log('  ✅ Commande /restore supprimée');
        console.log('  ✅ Embeds détaillés avec fichiers téléchargeables');
        console.log('  ✅ Sélecteur amélioré avec vrais noms');
        console.log('\n📋 Commandes finales:');
        console.log('  /backup    - Sauvegarde avec embed détaillé');
        console.log('  /restorer  - Sélecteur paginé amélioré');
        console.log('\n📋 Prochaines étapes:');
        console.log('  1. node deploy-commands.js');
        console.log('  2. pm2 restart bagbot');
        console.log('  3. Tester les nouvelles fonctionnalités');
      } else {
        console.log('❌ Échec suppression /restore de deploy-commands.js');
        process.exit(1);
      }
    } else {
      console.log('❌ Échec du patch final');
      process.exit(1);
    }
  });
}

module.exports = { applyFinalBackupPatch, removeRestoreFromDeploy, verifyCleanup };