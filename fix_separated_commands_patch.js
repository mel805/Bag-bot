const fs = require('fs');

/**
 * Patch pour corriger les commandes en utilisant /backup et /restorer séparées
 */

async function applySeparatedCommandsPatch() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // 1. Remplacer l'import BackupCommands par BackupCommandsSeparated
  content = content.replace(
    "const BackupCommands = require('./backup_commands');",
    "const BackupCommandsSeparated = require('./backup_commands_separated');"
  );

  // 2. Remplacer l'initialisation
  content = content.replace(
    'const backupCommands = new BackupCommands();',
    'const backupCommands = new BackupCommandsSeparated();'
  );

  // 3. Remplacer la gestion de la commande backup
  const oldBackupHandler = `    // New dual backup system with selector
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      return await backupCommands.handleBackupCommand(interaction);
    }`;

  const newBackupHandler = `    // Force backup command
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      return await backupCommands.handleBackupCommand(interaction);
    }

    // Restore with paginated selector
    if (interaction.isChatInputCommand() && interaction.commandName === 'restorer') {
      return await backupCommands.handleRestorerCommand(interaction);
    }`;

  content = content.replace(oldBackupHandler, newBackupHandler);

  // 4. Mettre à jour le gestionnaire d'interactions
  const oldInteractionHandler = `    // Handle backup command interactions (buttons and select menus)
    if ((interaction.isButton() && interaction.customId.startsWith('backup_')) ||
        (interaction.isButton() && interaction.customId.startsWith('restore_')) ||
        (interaction.isStringSelectMenu() && interaction.customId === 'backup_select')) {
      return await backupCommands.handleBackupInteraction(interaction);
    }`;

  const newInteractionHandler = `    // Handle restorer command interactions (buttons and select menus)
    if ((interaction.isButton() && interaction.customId.startsWith('restorer_')) ||
        (interaction.isButton() && interaction.customId.startsWith('restore_')) ||
        (interaction.isStringSelectMenu() && interaction.customId === 'restorer_select')) {
      return await backupCommands.handleRestorerInteraction(interaction);
    }`;

  content = content.replace(oldInteractionHandler, newInteractionHandler);

  // 5. Sauvegarder le fichier modifié
  const backupPath = botFilePath + '.backup-separated-commands';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Patch commandes séparées appliqué');

  return true;
}

// Mettre à jour deploy-commands.js
function updateDeployCommandsSeparated() {
  const deployPath = './deploy-commands.js';
  
  if (!fs.existsSync(deployPath)) {
    console.error('❌ Fichier deploy-commands.js introuvable');
    return false;
  }

  let content = fs.readFileSync(deployPath, 'utf8');
  
  // Remplacer la définition de backup par une version simple
  const newBackupCommand = `  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Forcer la création d\\'une sauvegarde immédiate')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON(),`;

  // Ajouter la commande restorer
  const restorerCommand = `  new SlashCommandBuilder()
    .setName('restorer')
    .setDescription('Restaurer une sauvegarde avec sélecteur paginé')
    .addStringOption(option =>
      option
        .setName('timestamp')
        .setDescription('Timestamp spécifique (optionnel, sinon utilise le sélecteur)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON(),`;

  // Remplacer l'ancienne définition complexe de backup
  content = content.replace(
    /new SlashCommandBuilder\(\)\s*\.setName\('backup'\)\s*\.setDescription\('Gestion avancée des sauvegardes du bot'\)[\s\S]*?\.toJSON\(\),/,
    newBackupCommand.trim()
  );

  // Ajouter la commande restorer après backup
  const backupIndex = content.indexOf(newBackupCommand.trim());
  if (backupIndex !== -1) {
    const insertIndex = backupIndex + newBackupCommand.trim().length;
    content = content.slice(0, insertIndex) + '\n  ' + restorerCommand.trim() + content.slice(insertIndex);
  }

  // Sauvegarder
  const backupPath = deployPath + '.backup-separated';
  fs.copyFileSync(deployPath, backupPath);
  console.log(`💾 Sauvegarde deploy-commands créée: ${backupPath}`);

  fs.writeFileSync(deployPath, content);
  console.log('✅ deploy-commands.js mis à jour pour commandes séparées');

  return true;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Application du patch pour commandes séparées...\n');
  
  applySeparatedCommandsPatch().then(success => {
    if (success) {
      const deploySuccess = updateDeployCommandsSeparated();
      
      if (deploySuccess) {
        console.log('\n🎉 Patch commandes séparées appliqué avec succès !');
        console.log('\n📋 Nouvelles commandes:');
        console.log('  /backup    - Forcer une sauvegarde immédiate');
        console.log('  /restorer  - Restauration avec sélecteur paginé');
        console.log('\n📋 Prochaines étapes:');
        console.log('  1. node deploy-commands.js');
        console.log('  2. pm2 restart bagbot');
      } else {
        console.log('❌ Échec mise à jour deploy-commands.js');
        process.exit(1);
      }
    } else {
      console.log('❌ Échec du patch');
      process.exit(1);
    }
  });
}

module.exports = { applySeparatedCommandsPatch, updateDeployCommandsSeparated };