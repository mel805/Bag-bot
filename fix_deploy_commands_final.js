const fs = require('fs');

/**
 * Correction finale de deploy-commands.js
 */

function fixDeployCommandsFinal() {
  const deployPath = './src/deploy-commands.js';
  
  if (!fs.existsSync(deployPath)) {
    console.error('❌ Fichier deploy-commands.js introuvable');
    return false;
  }

  let content = fs.readFileSync(deployPath, 'utf8');
  
  // 1. Remplacer l'ancienne définition de backup
  const oldBackupCommand = `  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Admin: exporter la configuration complète en JSON')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),`;

  const newBackupCommand = `  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Forcer la création d\\'une sauvegarde avec embeds et logs')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON(),`;

  if (content.includes('.setName(\'backup\')')) {
    content = content.replace(oldBackupCommand, newBackupCommand);
    console.log('✅ Commande /backup mise à jour');
  }

  // 2. Ajouter la commande restorer si elle n'existe pas
  if (!content.includes('.setName(\'restorer\')')) {
    const restorerCommand = `  new SlashCommandBuilder()
    .setName('restorer')
    .setDescription('Restaurer une sauvegarde avec sélecteur paginé')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON(),`;

    // Insérer après la commande backup
    const backupIndex = content.indexOf(newBackupCommand);
    if (backupIndex !== -1) {
      const insertIndex = backupIndex + newBackupCommand.length;
      content = content.slice(0, insertIndex) + '\n' + restorerCommand + content.slice(insertIndex);
      console.log('✅ Commande /restorer ajoutée');
    }
  }

  // 3. Supprimer l'ancienne commande restore si elle existe
  content = content.replace(
    /new SlashCommandBuilder\(\)\s*\.setName\('restore'\)\s*\.setDescription\('[^']*'\)\s*\.setDefaultMemberPermissions\([^)]+\)\s*\.setDMPermission\([^)]+\)\s*\.toJSON\(\),?\s*/,
    ''
  );
  console.log('✅ Ancienne commande /restore supprimée');

  // 4. Sauvegarder et écrire
  const backupPath = deployPath + '.backup-final-fix';
  fs.copyFileSync(deployPath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(deployPath, content);
  console.log('✅ deploy-commands.js mis à jour');

  return true;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Correction finale de deploy-commands.js...\n');
  
  const success = fixDeployCommandsFinal();
  
  if (success) {
    console.log('\n🎉 deploy-commands.js corrigé avec succès !');
    console.log('\n📋 Modifications:');
    console.log('  ✅ /backup: Description et permissions mises à jour');
    console.log('  ✅ /restorer: Commande ajoutée');
    console.log('  ✅ /restore: Ancienne commande supprimée');
    console.log('\n📋 ÉTAPES CRITIQUES:');
    console.log('  1. node src/deploy-commands.js  ← OBLIGATOIRE');
    console.log('  2. pm2 restart bagbot');
    console.log('  3. Tester les commandes dans Discord');
  } else {
    console.log('❌ Échec de la correction');
    process.exit(1);
  }
}