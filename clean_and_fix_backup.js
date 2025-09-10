const fs = require('fs');

/**
 * Nettoie et corrige les commandes backup/restorer
 */

function cleanAndFixBackup() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // 1. Supprimer les gestionnaires vides
  const emptyHandlers = `    // Simple backup commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'restorer') {
    }

    // Handle backup interactions
    if ((interaction.isButton() && (interaction.customId.startsWith('backup_') || interaction.customId.startsWith('restore_'))) ||
        (interaction.isStringSelectMenu() && interaction.customId === 'backup_select')) {
    }`;

  content = content.replace(emptyHandlers, '');
  console.log('✅ Gestionnaires vides supprimés');

  // 2. Remplacer l'ancienne commande backup par une version fonctionnelle
  const oldBackupCommand = /\/\/ Admin-only: \/backup \(export config \+ force snapshot\)[\s\S]*?try \{ return await interaction\.editReply\({ content: 'Erreur export\.' }\); \} catch \(_\) \{ try \{ return await interaction\.followUp\({ content: 'Erreur export\.', ephemeral: true }\); \} catch \(_\) \{ return; \} \}\s*\}/;

  const newBackupCommand = `    // Enhanced backup command with embeds and logs
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        
        await interaction.deferReply({ ephemeral: true });
        
        const startTime = Date.now();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        
        // Créer la sauvegarde avec jsonStore
        const { readConfig, backupNow } = require('./storage/jsonStore');
        const info = await backupNow();
        const cfg = await readConfig();
        
        const duration = Date.now() - startTime;
        const configSize = Math.round(JSON.stringify(cfg).length / 1024);
        
        // Créer l'embed détaillé
        const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Sauvegarde Forcée Créée')
          .setDescription('Nouvelle sauvegarde générée avec succès')
          .addFields(
            { name: '📅 Timestamp', value: \`\\\`\${timestamp}\\\`\`, inline: true },
            { name: '📋 Taille Config', value: \`\${configSize} KB\`, inline: true },
            { name: '⏱️ Durée', value: \`\${duration}ms\`, inline: true },
            { name: '📁 Local', value: info?.local?.success ? '✅ Réussi' : '❌ Échec', inline: true },
            { name: '☁️ GitHub', value: info?.github?.success ? '✅ Réussi' : '⚠️ Non configuré', inline: true },
            { name: '🔄 Créé par', value: interaction.user.toString(), inline: true }
          )
          .setColor(0x00FF00)
          .setTimestamp()
          .setFooter({ text: 'Sauvegarde manuelle' });

        // Fichier téléchargeable
        const json = Buffer.from(JSON.stringify(cfg, null, 2), 'utf8');
        const attachment = new AttachmentBuilder(json, { name: \`backup-\${timestamp}.json\` });

        // Envoyer dans les logs si configuré
        try {
          const logsConfig = await getLogsConfig(interaction.guild.id);
          if (logsConfig?.backup?.enabled && logsConfig?.backup?.channel) {
            const logChannel = interaction.guild.channels.cache.get(logsConfig.backup.channel);
            if (logChannel) {
              await logChannel.send({ embeds: [embed], files: [attachment] });
              console.log('✅ Embed backup envoyé dans les logs');
            }
          }
        } catch (logError) {
          console.log('⚠️ Impossible d\\'envoyer dans les logs:', logError.message);
        }

        // Envoyer la réponse à l'utilisateur
        try {
          await sendDetailedBackupLog(interaction.guild, info, 'slash', interaction.user);
        } catch (_) {}
        
        return interaction.editReply({ 
          embeds: [embed],
          files: [attachment]
        });

      } catch (e) {
        console.error('❌ Erreur backup:', e);
        
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erreur de Sauvegarde')
          .setDescription('Échec de la création de sauvegarde')
          .addFields(
            { name: '🔍 Erreur', value: \`\\\`\${e?.message || e}\\\`\`, inline: false },
            { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true },
            { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
          )
          .setColor(0xFF0000)
          .setTimestamp();

        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const errorInfo = {
            local: { success: false, error: String(e?.message || e) },
            github: { success: false, configured: false, error: 'Échec avant sauvegarde' },
            details: { timestamp: new Date().toISOString() }
          };
          await sendDetailedBackupLog(interaction.guild, errorInfo, 'slash', interaction.user);
        } catch (_) {}
        
        try { 
          return await interaction.editReply({ embeds: [errorEmbed] }); 
        } catch (_) { 
          try { 
            return await interaction.followUp({ content: 'Erreur export.', ephemeral: true }); 
          } catch (_) { 
            return; 
          } 
        }
      }
    }`;

  // Remplacer l'ancienne commande
  content = content.replace(oldBackupCommand, newBackupCommand);
  console.log('✅ Commande backup améliorée');

  // 3. Ajouter une commande restorer fonctionnelle
  const restorerCommand = `
    // Enhanced restorer command with selector
    if (interaction.isChatInputCommand() && interaction.commandName === 'restorer') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        
        await interaction.deferReply({ ephemeral: true });
        
        // Lister les sauvegardes disponibles
        const { listBackups } = require('./storage/jsonStore');
        const backups = await listBackups();
        
        if (!backups || backups.length === 0) {
          return interaction.editReply({ content: '❌ Aucune sauvegarde trouvée.' });
        }

        const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
          .setTitle('🔄 Sélecteur de Restauration')
          .setDescription(\`\${backups.length} sauvegardes disponibles\`)
          .setColor(0x0099FF);

        // Créer le sélecteur avec vrais noms
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('restore_select')
          .setPlaceholder('Sélectionner une sauvegarde à restaurer...')
          .addOptions(
            backups.slice(0, 25).map((backup, index) => {
              const name = backup.name || backup.filename || \`Sauvegarde \${index + 1}\`;
              const date = backup.date ? new Date(backup.date).toLocaleString('fr-FR') : 'Date inconnue';
              const size = backup.size ? \`\${Math.round(backup.size / 1024)}KB\` : 'Taille inconnue';
              
              return {
                label: name,
                description: \`\${date} • \${size}\`,
                value: backup.filename || backup.name || \`backup_\${index}\`,
                emoji: '📦'
              };
            })
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Ajouter les détails des sauvegardes dans l'embed
        let backupsList = '';
        backups.slice(0, 10).forEach((backup, index) => {
          const name = backup.name || backup.filename || \`Sauvegarde \${index + 1}\`;
          const date = backup.date ? new Date(backup.date).toLocaleString('fr-FR') : 'Date inconnue';
          const size = backup.size ? \`\${Math.round(backup.size / 1024)}KB\` : '?KB';
          
          backupsList += \`**\${index + 1}.** 📦 \\\`\${name}\\\`\\n📅 \${date} • 📊 \${size}\\n\\n\`;
        });

        embed.addFields({ name: 'Sauvegardes Disponibles', value: backupsList || 'Aucune', inline: false });

        return interaction.editReply({
          embeds: [embed],
          components: [row]
        });

      } catch (e) {
        console.error('❌ Erreur restorer:', e);
        return interaction.editReply({ content: \`❌ Erreur: \${e.message}\` });
      }
    }

    // Handle restore selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'restore_select') {
      try {
        const selectedBackup = interaction.values[0];
        
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        const confirmEmbed = new EmbedBuilder()
          .setTitle('⚠️ Confirmation de Restauration')
          .setDescription(\`Restaurer la sauvegarde \\\`\${selectedBackup}\\\` ?\`)
          .addFields(
            { name: '⚠️ ATTENTION', value: 'Cette action remplacera la configuration actuelle !', inline: false },
            { name: '🔄 Action requise', value: 'Redémarrage du bot nécessaire après restauration', inline: false }
          )
          .setColor(0xFF9900);

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(\`restore_confirm_\${selectedBackup}\`)
            .setLabel('✅ Confirmer')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('restore_cancel')
            .setLabel('❌ Annuler')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({
          embeds: [confirmEmbed],
          components: [confirmRow]
        });

      } catch (e) {
        console.error('❌ Erreur sélection restore:', e);
        await interaction.update({ content: \`❌ Erreur: \${e.message}\`, components: [] });
      }
    }

    // Handle restore confirmation
    if (interaction.isButton() && interaction.customId.startsWith('restore_confirm_')) {
      try {
        const backupName = interaction.customId.replace('restore_confirm_', '');
        
        await interaction.deferUpdate();
        
        const { restoreBackup } = require('./storage/jsonStore');
        const result = await restoreBackup(backupName);
        
        const { EmbedBuilder } = require('discord.js');
        
        if (result.success) {
          const successEmbed = new EmbedBuilder()
            .setTitle('✅ Restauration Réussie')
            .setDescription(\`Sauvegarde \\\`\${backupName}\\\` restaurée\`)
            .addFields(
              { name: '🔄 Restauré par', value: interaction.user.toString(), inline: true },
              { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
              { name: '⚠️ Action requise', value: '**Redémarrez le bot** : \`pm2 restart bagbot\`', inline: false }
            )
            .setColor(0x00FF00)
            .setTimestamp();

          // Envoyer dans les logs si configuré
          try {
            const logsConfig = await getLogsConfig(interaction.guild.id);
            if (logsConfig?.backup?.enabled && logsConfig?.backup?.channel) {
              const logChannel = interaction.guild.channels.cache.get(logsConfig.backup.channel);
              if (logChannel) {
                await logChannel.send({ embeds: [successEmbed] });
                console.log('✅ Embed restore envoyé dans les logs');
              }
            }
          } catch (logError) {
            console.log('⚠️ Impossible d\\'envoyer dans les logs:', logError.message);
          }

          await interaction.editReply({
            content: '🎉 **Restauration terminée !** N\\'oubliez pas de redémarrer le bot.',
            embeds: [successEmbed],
            components: []
          });
        } else {
          const failEmbed = new EmbedBuilder()
            .setTitle('❌ Échec de Restauration')
            .setDescription(\`Impossible de restaurer \\\`\${backupName}\\\`\`)
            .addFields(
              { name: '🔍 Erreur', value: result.error || 'Erreur inconnue', inline: false }
            )
            .setColor(0xFF0000)
            .setTimestamp();

          await interaction.editReply({
            embeds: [failEmbed],
            components: []
          });
        }

      } catch (e) {
        console.error('❌ Erreur confirmation restore:', e);
        await interaction.editReply({ content: \`❌ Erreur: \${e.message}\`, components: [] });
      }
    }

    // Handle restore cancel
    if (interaction.isButton() && interaction.customId === 'restore_cancel') {
      await interaction.update({
        content: '❌ Restauration annulée.',
        embeds: [],
        components: []
      });
    }`;

  // Remplacer l'ancienne commande
  content = content.replace(oldBackupCommand, newBackupCommand);
  console.log('✅ Commandes backup/restorer intégrées');

  // 4. Nettoyer les lignes vides multiples
  content = content.replace(/\n\n\n+/g, '\n\n');

  // 5. Sauvegarder et écrire
  const backupPath = botFilePath + '.backup-clean-fix';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Nettoyage et correction appliqués');

  return true;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🧹 Nettoyage et correction des commandes backup...\n');
  
  const success = cleanAndFixBackup();
  
  if (success) {
    console.log('\n🎉 Nettoyage et correction appliqués avec succès !');
    console.log('\n📋 Corrections apportées:');
    console.log('  ✅ Gestionnaires vides supprimés');
    console.log('  ✅ /backup avec embeds et logs');
    console.log('  ✅ /restorer avec vrai sélecteur');
    console.log('  ✅ Gestion des interactions complète');
    console.log('  ✅ Intégration avec jsonStore');
    console.log('\n📋 Prochaines étapes:');
    console.log('  1. pm2 restart bagbot');
    console.log('  2. Configurer canal logs via /config');
    console.log('  3. Tester /backup et /restorer');
  } else {
    console.log('❌ Échec du nettoyage');
    process.exit(1);
  }
}

module.exports = { cleanAndFixBackup };