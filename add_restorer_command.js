const fs = require('fs');

/**
 * Ajouter la commande /restorer manquante
 */

function addRestorerCommand() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // Trouver où insérer la commande restorer (après la commande backup)
  const backupCommandEnd = content.indexOf('        }') + 9; // Après la fin de la commande backup
  const insertPoint = content.indexOf('\n', backupCommandEnd);
  
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

  if (insertPoint !== -1) {
    content = content.slice(0, insertPoint) + restorerCommand + content.slice(insertPoint);
    console.log('✅ Commande /restorer ajoutée');
  } else {
    console.log('❌ Point d\'insertion non trouvé');
    return false;
  }

  // Sauvegarder et écrire
  const backupPath = botFilePath + '.backup-add-restorer';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Commande /restorer intégrée');

  return true;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Ajout de la commande /restorer...\n');
  
  const success = addRestorerCommand();
  
  if (success) {
    console.log('\n🎉 Commande /restorer ajoutée avec succès !');
    console.log('\n📋 Fonctionnalités:');
    console.log('  ✅ Sélecteur avec vrais noms des backups');
    console.log('  ✅ Confirmation avant restauration');
    console.log('  ✅ Embeds détaillés');
    console.log('  ✅ Gestion des erreurs');
    console.log('\n📋 Prochaines étapes:');
    console.log('  1. pm2 restart bagbot');
    console.log('  2. Tester /restorer');
  } else {
    console.log('❌ Échec de l\'ajout');
    process.exit(1);
  }
}