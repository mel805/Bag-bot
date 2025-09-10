const fs = require('fs');
const BackupCommands = require('./backup_commands');

/**
 * Patch pour intégrer les nouvelles commandes de sauvegarde dans le bot principal
 */

async function applyBackupPatch() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // 1. Ajouter l'import de BackupCommands au début du fichier
  const importLine = "const BackupCommands = require('./backup_commands');";
  
  if (!content.includes('BackupCommands')) {
    // Trouver une ligne d'import existante pour insérer après
    const importRegex = /const .+ = require\('.+'\);/;
    const match = content.match(importRegex);
    
    if (match) {
      const insertIndex = content.indexOf(match[0]) + match[0].length;
      content = content.slice(0, insertIndex) + '\n' + importLine + content.slice(insertIndex);
      console.log('✅ Import BackupCommands ajouté');
    }
  }

  // 2. Initialiser BackupCommands
  const initLine = 'const backupCommands = new BackupCommands();';
  
  if (!content.includes('backupCommands = new BackupCommands')) {
    // Insérer après les autres initialisations
    const clientReadyIndex = content.indexOf('client.once(Events.ClientReady');
    if (clientReadyIndex !== -1) {
      content = content.slice(0, clientReadyIndex) + initLine + '\n\n' + content.slice(clientReadyIndex);
      console.log('✅ Initialisation BackupCommands ajoutée');
    }
  }

  // 3. Remplacer l'ancienne commande backup
  const oldBackupCommand = `    // Admin-only: /backup (export config + force snapshot)
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const { readConfig, backupNow } = require('./storage/jsonStore');
        const info = await backupNow();
        const cfg = await readConfig();
        const json = Buffer.from(JSON.stringify(cfg, null, 2), 'utf8');
        const file = { attachment: json, name: 'bag-backup.json' };
        try {
          await sendDetailedBackupLog(interaction.guild, info, 'slash', interaction.user);
        } catch (_) {}
        return interaction.editReply({ content: '📦 Sauvegarde générée.', files: [file] });
      } catch (e) {
        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const errorInfo = {
            local: { success: false, error: String(e?.message || e) },
            github: { success: false, configured: false, error: 'Échec avant sauvegarde' },
            details: { timestamp: new Date().toISOString() }
          };
          await sendDetailedBackupLog(interaction.guild, errorInfo, 'slash', interaction.user);
        } catch (_) {}
        try { return await interaction.editReply({ content: 'Erreur export.' }); } catch (_) { try { return await interaction.followUp({ content: 'Erreur export.', ephemeral: true }); } catch (_) { return; } }
      }
    }`;

  const newBackupCommand = `    // New dual backup system with selector
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      return await backupCommands.handleBackupCommand(interaction);
    }`;

  // Chercher et remplacer l'ancienne commande
  if (content.includes('Admin-only: /backup (export config + force snapshot)')) {
    // Trouver le début et la fin de l'ancienne commande
    const startIndex = content.indexOf('// Admin-only: /backup (export config + force snapshot)');
    const endIndex = content.indexOf('    }', startIndex) + 5; // +5 pour inclure les 4 espaces et }
    
    if (startIndex !== -1 && endIndex > startIndex) {
      const beforeCommand = content.slice(0, startIndex);
      const afterCommand = content.slice(endIndex);
      
      content = beforeCommand + newBackupCommand.trim() + afterCommand;
      console.log('✅ Ancienne commande backup remplacée');
    }
  }

  // 4. Ajouter la gestion des interactions (boutons et menus)
  const interactionHandler = `
    // Handle backup command interactions (buttons and select menus)
    if ((interaction.isButton() && interaction.customId.startsWith('backup_')) ||
        (interaction.isButton() && interaction.customId.startsWith('restore_')) ||
        (interaction.isStringSelectMenu() && interaction.customId === 'backup_select')) {
      return await backupCommands.handleBackupInteraction(interaction);
    }`;

  // Insérer le gestionnaire d'interactions près de la fin de la fonction InteractionCreate
  const interactionCreateEnd = content.lastIndexOf('} catch (error) {');
  if (interactionCreateEnd !== -1 && !content.includes('handleBackupInteraction')) {
    content = content.slice(0, interactionCreateEnd) + interactionHandler + '\n\n  ' + content.slice(interactionCreateEnd);
    console.log('✅ Gestionnaire d\'interactions ajouté');
  }

  // 5. Sauvegarder le fichier modifié
  const backupPath = botFilePath + '.backup-before-patch';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Patch appliqué avec succès');

  return true;
}

// Fonction pour vérifier si le patch a été appliqué
function checkPatchStatus() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    return { applied: false, reason: 'Fichier bot.js introuvable' };
  }

  const content = fs.readFileSync(botFilePath, 'utf8');
  
  const checks = {
    import: content.includes('BackupCommands'),
    init: content.includes('backupCommands = new BackupCommands'),
    command: content.includes('backupCommands.handleBackupCommand'),
    interactions: content.includes('handleBackupInteraction')
  };

  const applied = Object.values(checks).every(Boolean);
  
  return { applied, checks };
}

// Si exécuté directement
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--check')) {
    const status = checkPatchStatus();
    console.log('\n📊 === STATUT DU PATCH ===');
    console.log(`Appliqué: ${status.applied ? '✅' : '❌'}`);
    
    if (status.checks) {
      console.log('\nDétails:');
      console.log(`  Import BackupCommands: ${status.checks.import ? '✅' : '❌'}`);
      console.log(`  Initialisation: ${status.checks.init ? '✅' : '❌'}`);
      console.log(`  Commande backup: ${status.checks.command ? '✅' : '❌'}`);
      console.log(`  Gestionnaire interactions: ${status.checks.interactions ? '✅' : '❌'}`);
    }
    
    if (status.reason) {
      console.log(`Raison: ${status.reason}`);
    }
  } else {
    applyBackupPatch().then(success => {
      if (success) {
        console.log('\n🎉 Patch appliqué avec succès !');
        console.log('\n📋 Nouvelles fonctionnalités disponibles:');
        console.log('  /backup create  - Forcer une sauvegarde');
        console.log('  /backup list    - Sélecteur paginé');
        console.log('  /backup status  - Statut des sauvegardes');
        console.log('  /backup restore - Restaurer par timestamp');
      } else {
        console.log('❌ Échec du patch');
        process.exit(1);
      }
    });
  }
}

module.exports = { applyBackupPatch, checkPatchStatus };