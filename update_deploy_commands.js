const fs = require('fs');

/**
 * Met à jour deploy-commands.js avec la nouvelle définition de /backup
 */

function updateDeployCommands() {
  const deployPath = './deploy-commands.js';
  
  if (!fs.existsSync(deployPath)) {
    console.error('❌ Fichier deploy-commands.js introuvable');
    return false;
  }

  let content = fs.readFileSync(deployPath, 'utf8');
  
  // Trouver et remplacer l'ancienne définition de backup
  const oldBackupCommand = `  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Admin: exporter la configuration complète en JSON')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),`;

  const newBackupCommand = `  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Gestion avancée des sauvegardes du bot')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Forcer la création d\\'une sauvegarde immédiate')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Afficher toutes les sauvegardes avec sélecteur paginé')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Afficher le statut détaillé des sauvegardes')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('restore')
        .setDescription('Restaurer une sauvegarde par timestamp')
        .addStringOption(option =>
          option
            .setName('timestamp')
            .setDescription('Timestamp de la sauvegarde (ex: 2025-09-10_17h25)')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON(),`;

  if (content.includes('.setName(\'backup\')')) {
    // Sauvegarder l'original
    const backupPath = deployPath + '.backup-before-update';
    fs.copyFileSync(deployPath, backupPath);
    console.log(`💾 Sauvegarde créée: ${backupPath}`);

    // Remplacer l'ancienne commande
    content = content.replace(
      /new SlashCommandBuilder\(\)\s*\.setName\('backup'\)\s*\.setDescription\('[^']*'\)\s*\.setDefaultMemberPermissions\([^)]+\)\s*\.setDMPermission\([^)]+\)\s*\.toJSON\(\),/,
      newBackupCommand.trim()
    );

    // Supprimer l'ancienne commande restore car elle est maintenant intégrée dans backup
    content = content.replace(
      /new SlashCommandBuilder\(\)\s*\.setName\('restore'\)\s*\.setDescription\('[^']*'\)\s*\.setDefaultMemberPermissions\([^)]+\)\s*\.setDMPermission\([^)]+\)\s*\.toJSON\(\),\s*/,
      ''
    );

    fs.writeFileSync(deployPath, content);
    console.log('✅ deploy-commands.js mis à jour');
    console.log('✅ Ancienne commande restore supprimée (intégrée dans backup)');
    return true;
  } else {
    console.log('⚠️ Commande backup introuvable dans deploy-commands.js');
    return false;
  }
}

// Si exécuté directement
if (require.main === module) {
  const success = updateDeployCommands();
  
  if (success) {
    console.log('\n🎉 Mise à jour terminée !');
    console.log('\n📋 Prochaines étapes:');
    console.log('  1. Redéployer les commandes: node deploy-commands.js');
    console.log('  2. Redémarrer le bot: pm2 restart bagbot');
    console.log('  3. Tester: /backup list');
  } else {
    console.log('❌ Échec de la mise à jour');
    process.exit(1);
  }
}

module.exports = { updateDeployCommands };