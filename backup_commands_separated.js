const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const DualBackupSystem = require('./dual_backup_system_7days');
const FreeboxSync = require('./freebox_sync_7days');

/**
 * Commandes Discord séparées pour la gestion des sauvegardes
 * /backup - Forcer une sauvegarde
 * /restorer - Restauration avec sélecteur paginé
 */

class BackupCommandsSeparated {
  constructor() {
    this.backupSystem = new DualBackupSystem('./data/config.json', './data/backups');
    this.freeboxSync = new FreeboxSync('./data/backups', '/var/data/bot-backups');
  }

  /**
   * Définitions des commandes slash
   */
  getSlashCommands() {
    return [
      // Commande pour forcer une sauvegarde (simple)
      new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Forcer la création d\'une sauvegarde immédiate'),
      
      // Commande pour restaurer avec sélecteur
      new SlashCommandBuilder()
        .setName('restorer')
        .setDescription('Restaurer une sauvegarde avec sélecteur paginé')
        .addStringOption(option =>
          option
            .setName('timestamp')
            .setDescription('Timestamp spécifique (optionnel, sinon utilise le sélecteur)')
            .setRequired(false)
        )
    ];
  }

  /**
   * Gestionnaire de la commande /backup
   */
  async handleBackupCommand(interaction) {
    // Vérifier les permissions (admin seulement)
    if (!interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({
        content: '❌ Seuls les administrateurs peuvent forcer une sauvegarde.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const startTime = Date.now();
      
      console.log('🔄 Sauvegarde forcée démarrée par', interaction.user.tag);
      
      // Créer la sauvegarde
      const backupResult = this.backupSystem.createBackup();
      
      if (!backupResult) {
        return await interaction.editReply({
          content: '❌ Échec de la création de sauvegarde. Vérifiez les logs du serveur.'
        });
      }

      // Synchroniser avec Freebox
      const syncResult = this.freeboxSync.syncToFreebox();
      
      // Nettoyer les anciennes sauvegardes
      this.backupSystem.cleanOldBackups();
      this.freeboxSync.cleanFreeboxBackups();
      
      const duration = Date.now() - startTime;
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Sauvegarde Forcée Réussie')
        .setDescription('La sauvegarde a été créée avec succès')
        .addFields(
          { name: '📋 Configuration', value: `${Math.round(backupResult.configSize || 0)} KB`, inline: true },
          { name: '👥 Données Users', value: `${Math.round(backupResult.userDataSize || 0)} KB`, inline: true },
          { name: '⏱️ Durée', value: `${duration}ms`, inline: true },
          { name: '☁️ Freebox', value: syncResult ? '✅ Synchronisé' : '⚠️ Échec sync', inline: true },
          { name: '📅 Timestamp', value: backupResult.timestamp || 'Inconnu', inline: true },
          { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      return await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('❌ Erreur sauvegarde forcée:', error);
      return await interaction.editReply({
        content: `❌ Erreur lors de la sauvegarde: ${error.message}`
      });
    }
  }

  /**
   * Gestionnaire de la commande /restorer
   */
  async handleRestorerCommand(interaction) {
    // Vérifier les permissions (admin seulement)
    if (!interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({
        content: '❌ Seuls les administrateurs peuvent restaurer des sauvegardes.',
        ephemeral: true
      });
    }

    const timestamp = interaction.options.getString('timestamp');
    
    if (timestamp) {
      // Restauration directe par timestamp
      return await this.handleDirectRestore(interaction, timestamp);
    } else {
      // Afficher le sélecteur paginé
      return await this.handleRestorerSelector(interaction);
    }
  }

  /**
   * Restauration directe par timestamp
   */
  async handleDirectRestore(interaction, timestamp) {
    await interaction.deferReply();

    try {
      const allBackups = this.getAllAvailableBackups();
      const backup = allBackups.find(b => b.timestamp === timestamp);

      if (!backup) {
        return await interaction.editReply({
          content: `❌ Sauvegarde introuvable: \`${timestamp}\`\n💡 Utilisez \`/restorer\` sans paramètre pour voir les sauvegardes disponibles.`
        });
      }

      // Confirmation embed
      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirmation de Restauration')
        .setDescription(`Voulez-vous restaurer cette sauvegarde ?\n\n**⚠️ ATTENTION: Cela remplacera la configuration actuelle !**`)
        .addFields(
          { name: '📅 Timestamp', value: backup.timestamp, inline: true },
          { name: '📍 Emplacement', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
          { name: '📊 Taille', value: `Config: ${backup.configSize}KB\nDonnées: ${backup.userDataSize}KB`, inline: true },
          { name: '⏰ Âge', value: backup.age, inline: true },
          { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true }
        )
        .setColor(0xFF9900);

      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`restore_confirm_${timestamp}`)
            .setLabel('✅ Confirmer')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('restore_cancel')
            .setLabel('❌ Annuler')
            .setStyle(ButtonStyle.Secondary)
        );

      return await interaction.editReply({
        embeds: [confirmEmbed],
        components: [confirmRow]
      });

    } catch (error) {
      console.error('❌ Erreur restauration directe:', error);
      return await interaction.editReply({
        content: `❌ Erreur lors de la restauration: ${error.message}`
      });
    }
  }

  /**
   * Afficher le sélecteur paginé de restauration
   */
  async handleRestorerSelector(interaction) {
    await interaction.deferReply();

    try {
      const allBackups = this.getAllAvailableBackups();
      
      if (allBackups.length === 0) {
        return await interaction.editReply({
          content: '❌ Aucune sauvegarde trouvée.'
        });
      }

      // Afficher la première page
      return await this.displayBackupPage(interaction, allBackups, 0);

    } catch (error) {
      console.error('❌ Erreur sélecteur restauration:', error);
      return await interaction.editReply({
        content: `❌ Erreur lors de la récupération des sauvegardes: ${error.message}`
      });
    }
  }

  /**
   * Affiche une page de sauvegardes avec navigation
   */
  async displayBackupPage(interaction, allBackups, page) {
    const pageSize = 10;
    const maxPage = Math.ceil(allBackups.length / pageSize) - 1;
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, allBackups.length);
    const pageBackups = allBackups.slice(startIndex, endIndex);

    // Créer l'embed
    const embed = new EmbedBuilder()
      .setTitle('🔄 Sélecteur de Restauration')
      .setDescription(`Page ${page + 1}/${maxPage + 1} • ${allBackups.length} sauvegardes disponibles`)
      .setColor(0x0099FF)
      .setTimestamp();

    // Ajouter les sauvegardes de la page
    let description = '';
    pageBackups.forEach((backup, index) => {
      const globalIndex = startIndex + index + 1;
      const icon = backup.location === 'local' ? '🏠' : '☁️';
      const dateStr = backup.date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      description += `**${globalIndex}.** ${icon} \`${backup.timestamp}\`\n`;
      description += `📅 ${dateStr} • ⏰ ${backup.age}\n`;
      description += `📋 ${backup.configSize}KB • 👥 ${backup.userDataSize}KB\n\n`;
    });

    embed.setDescription(description);

    // Créer les boutons de navigation
    const row = new ActionRowBuilder();

    // Bouton page précédente
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`restorer_prev_${page}`)
        .setLabel('◀ Précédent')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0)
    );

    // Bouton refresh
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`restorer_refresh_${page}`)
        .setLabel('🔄 Actualiser')
        .setStyle(ButtonStyle.Primary)
    );

    // Bouton page suivante
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`restorer_next_${page}`)
        .setLabel('Suivant ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === maxPage)
    );

    // Menu de sélection pour restauration rapide
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('restorer_select')
      .setPlaceholder('Sélectionner une sauvegarde à restaurer...')
      .addOptions(
        pageBackups.map((backup, index) => ({
          label: `${backup.timestamp} (${backup.location})`,
          description: `${backup.date.toLocaleString('fr-FR')} • ${backup.configSize + backup.userDataSize}KB`,
          value: backup.timestamp,
          emoji: backup.location === 'local' ? '🏠' : '☁️'
        }))
      );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply({
        embeds: [embed],
        components: [row, selectRow]
      });
    } else {
      return await interaction.reply({
        embeds: [embed],
        components: [row, selectRow]
      });
    }
  }

  /**
   * Récupère toutes les sauvegardes disponibles (local + Freebox)
   */
  getAllAvailableBackups() {
    const allBackups = [];
    
    // Sauvegardes locales
    const localBackups = this.backupSystem.getAllBackups();
    localBackups.forEach(backup => {
      backup.location = 'local';
      allBackups.push(backup);
    });
    
    // Sauvegardes Freebox
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      
      const freeboxConfigs = execSync('ls /var/data/bot-backups/config/bot-config_*.json 2>/dev/null | sort -r || echo ""', { encoding: 'utf8' }).trim();
      
      if (freeboxConfigs) {
        const configFiles = freeboxConfigs.split('\n').filter(f => f);
        
        configFiles.forEach(configPath => {
          const fileName = path.basename(configPath);
          const timestamp = fileName.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1];
          
          if (timestamp) {
            const userDataPath = `/var/data/bot-backups/userdata/user-data_${timestamp}.json`;
            
            if (fs.existsSync(userDataPath)) {
              try {
                const configStats = fs.statSync(configPath);
                const userDataStats = fs.statSync(userDataPath);
                
                // Éviter les doublons avec les sauvegardes locales
                if (!allBackups.find(b => b.timestamp === timestamp)) {
                  allBackups.push({
                    timestamp,
                    configFile: fileName,
                    userDataFile: `user-data_${timestamp}.json`,
                    configSize: Math.round(configStats.size / 1024),
                    userDataSize: Math.round(userDataStats.size / 1024),
                    date: configStats.mtime,
                    age: this.backupSystem.getAge(configStats.mtime),
                    location: 'freebox',
                    configPath,
                    userDataPath
                  });
                }
              } catch (error) {
                // Ignorer les erreurs de lecture de fichiers
              }
            }
          }
        });
      }
    } catch (error) {
      console.log('⚠️ Impossible de lire les sauvegardes Freebox');
    }
    
    // Trier par date (plus récent en premier)
    allBackups.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return allBackups;
  }

  /**
   * Gestionnaire des interactions (boutons et menus)
   */
  async handleRestorerInteraction(interaction) {
    if (interaction.isButton()) {
      return await this.handleRestorerButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      return await this.handleRestorerSelect(interaction);
    }
  }

  /**
   * Gestionnaire des boutons
   */
  async handleRestorerButton(interaction) {
    const [action, ...params] = interaction.customId.split('_');

    if (action === 'restorer') {
      const [subAction, page] = params;
      const currentPage = parseInt(page) || 0;
      const allBackups = this.getAllAvailableBackups();

      switch (subAction) {
        case 'prev':
          await this.displayBackupPage(interaction, allBackups, Math.max(0, currentPage - 1));
          break;
        case 'next':
          const maxPage = Math.ceil(allBackups.length / 10) - 1;
          await this.displayBackupPage(interaction, allBackups, Math.min(maxPage, currentPage + 1));
          break;
        case 'refresh':
          await this.displayBackupPage(interaction, allBackups, currentPage);
          break;
      }
    } else if (action === 'restore') {
      const [subAction, timestamp] = params;
      
      if (subAction === 'confirm') {
        await this.executeRestore(interaction, timestamp);
      } else if (subAction === 'cancel') {
        await interaction.update({
          content: '❌ Restauration annulée.',
          embeds: [],
          components: []
        });
      }
    }
  }

  /**
   * Gestionnaire du menu de sélection
   */
  async handleRestorerSelect(interaction) {
    const timestamp = interaction.values[0];
    
    // Rediriger vers la confirmation de restauration
    await this.handleDirectRestore({
      ...interaction,
      options: {
        getString: () => timestamp
      },
      deferReply: () => interaction.deferUpdate()
    }, timestamp);
  }

  /**
   * Exécute la restauration
   */
  async executeRestore(interaction, timestamp) {
    await interaction.deferUpdate();

    try {
      const allBackups = this.getAllAvailableBackups();
      const backup = allBackups.find(b => b.timestamp === timestamp);

      if (!backup) {
        return await interaction.editReply({
          content: `❌ Sauvegarde introuvable: ${timestamp}`,
          components: []
        });
      }

      console.log(`🔄 Restauration ${timestamp} démarrée par ${interaction.user.tag}`);

      let success = false;
      
      if (backup.location === 'local') {
        const configPath = `./data/backups/${backup.configFile}`;
        const userDataPath = `./data/backups/${backup.userDataFile}`;
        success = this.backupSystem.restoreFromBackup(configPath, userDataPath);
      } else {
        success = this.backupSystem.restoreFromBackup(backup.configPath, backup.userDataPath);
      }

      if (success) {
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Restauration Réussie')
          .setDescription('La sauvegarde a été restaurée avec succès')
          .addFields(
            { name: '📅 Timestamp', value: backup.timestamp, inline: true },
            { name: '📍 Source', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
            { name: '🔄 Restauré par', value: interaction.user.toString(), inline: true }
          )
          .setColor(0x00FF00)
          .setTimestamp();

        const restartRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('restart_bot_info')
              .setLabel('ℹ️ Redémarrage requis')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

        await interaction.editReply({
          content: '⚠️ **N\'oubliez pas de redémarrer le bot** pour appliquer les changements !\n`pm2 restart bagbot`',
          embeds: [successEmbed],
          components: [restartRow]
        });
      } else {
        await interaction.editReply({
          content: `❌ Échec de la restauration de \`${timestamp}\`. Vérifiez les logs du serveur.`,
          components: []
        });
      }

    } catch (error) {
      console.error('❌ Erreur exécution restauration:', error);
      await interaction.editReply({
        content: `❌ Erreur lors de la restauration: ${error.message}`,
        components: []
      });
    }
  }
}

module.exports = BackupCommandsSeparated;