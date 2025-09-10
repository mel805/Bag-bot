const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const DualBackupSystem = require('./dual_backup_system_7days');
const FreeboxSync = require('./freebox_sync_7days');
const fs = require('fs');
const path = require('path');

/**
 * Commandes Discord améliorées pour la gestion des sauvegardes
 * /backup - Forcer une sauvegarde avec embed détaillé et fichiers téléchargeables
 * /restorer - Restauration avec vrai sélecteur paginé
 */

class BackupCommandsImproved {
  constructor() {
    this.backupSystem = new DualBackupSystem('./data/config.json', './data/backups');
    this.freeboxSync = new FreeboxSync('./data/backups', '/var/data/bot-backups');
  }

  /**
   * Définitions des commandes slash
   */
  getSlashCommands() {
    return [
      // Commande pour forcer une sauvegarde
      new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Forcer la création d\'une sauvegarde immédiate'),
      
      // Commande pour restaurer avec sélecteur amélioré
      new SlashCommandBuilder()
        .setName('restorer')
        .setDescription('Restaurer une sauvegarde avec sélecteur paginé avancé')
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
      
      // Créer les fichiers téléchargeables
      const configPath = `./data/backups/bot-config_${this.getTimestampFromPath(backupResult.configBackupFile)}.json`;
      const userDataPath = `./data/backups/user-data_${this.getTimestampFromPath(backupResult.userDataBackupFile)}.json`;
      
      const attachments = [];
      
      // Ajouter les fichiers s'ils existent
      if (fs.existsSync(configPath)) {
        const configBuffer = fs.readFileSync(configPath);
        attachments.push(new AttachmentBuilder(configBuffer, { name: path.basename(configPath) }));
      }
      
      if (fs.existsSync(userDataPath)) {
        const userDataBuffer = fs.readFileSync(userDataPath);
        attachments.push(new AttachmentBuilder(userDataBuffer, { name: path.basename(userDataPath) }));
      }
      
      // Embed détaillé
      const embed = new EmbedBuilder()
        .setTitle('✅ Sauvegarde Forcée Créée')
        .setDescription('Une nouvelle sauvegarde a été créée avec succès')
        .addFields(
          { name: '📅 Timestamp', value: `\`${this.getTimestampFromPath(backupResult.configBackupFile) || 'Inconnu'}\``, inline: true },
          { name: '📋 Fichier Config', value: `\`${path.basename(configPath)}\`\n${Math.round((fs.existsSync(configPath) ? fs.statSync(configPath).size : 0) / 1024)} KB`, inline: true },
          { name: '👥 Fichier Données', value: `\`${path.basename(userDataPath)}\`\n${Math.round((fs.existsSync(userDataPath) ? fs.statSync(userDataPath).size : 0) / 1024)} KB`, inline: true },
          { name: '⏱️ Durée', value: `${duration}ms`, inline: true },
          { name: '☁️ Synchronisation', value: syncResult ? '✅ Freebox OK' : '⚠️ Freebox échec', inline: true },
          { name: '🧹 Nettoyage', value: '✅ Anciennes sauvegardes supprimées', inline: true },
          { name: '📁 Emplacement Local', value: '🏠 `./data/backups/`', inline: true },
          { name: '📡 Emplacement Freebox', value: '☁️ `/var/data/bot-backups/`', inline: true },
          { name: '🔄 Créé par', value: interaction.user.toString(), inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: 'Sauvegarde automatique • Rétention 7 jours' });

      return await interaction.editReply({ 
        embeds: [embed],
        files: attachments
      });

    } catch (error) {
      console.error('❌ Erreur sauvegarde forcée:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erreur de Sauvegarde')
        .setDescription('Une erreur est survenue lors de la création de la sauvegarde')
        .addFields(
          { name: '🔍 Erreur', value: `\`${error.message}\``, inline: false },
          { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true },
          { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp();
        
      return await interaction.editReply({ embeds: [errorEmbed] });
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

    await interaction.deferReply();

    try {
      const allBackups = this.getAllAvailableBackups();
      
      if (allBackups.length === 0) {
        const noBackupEmbed = new EmbedBuilder()
          .setTitle('❌ Aucune Sauvegarde')
          .setDescription('Aucune sauvegarde n\'a été trouvée')
          .addFields(
            { name: '💡 Solution', value: 'Utilisez `/backup` pour créer une première sauvegarde', inline: false },
            { name: '📁 Emplacements vérifiés', value: '🏠 Local: `./data/backups/`\n☁️ Freebox: `/var/data/bot-backups/`', inline: false }
          )
          .setColor(0xFF9900)
          .setTimestamp();
          
        return await interaction.editReply({ embeds: [noBackupEmbed] });
      }

      // Afficher la première page du sélecteur
      return await this.displayRestorerPage(interaction, allBackups, 0);

    } catch (error) {
      console.error('❌ Erreur sélecteur restauration:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erreur du Sélecteur')
        .setDescription('Impossible de charger les sauvegardes')
        .addFields(
          { name: '🔍 Erreur', value: `\`${error.message}\``, inline: false }
        )
        .setColor(0xFF0000)
        .setTimestamp();
        
      return await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Affiche une page du sélecteur de restauration amélioré
   */
  async displayRestorerPage(interaction, allBackups, page) {
    const pageSize = 10;
    const maxPage = Math.ceil(allBackups.length / pageSize) - 1;
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, allBackups.length);
    const pageBackups = allBackups.slice(startIndex, endIndex);

    // Créer l'embed principal
    const embed = new EmbedBuilder()
      .setTitle('🔄 Sélecteur de Restauration')
      .setDescription(`Choisissez une sauvegarde à restaurer\n\n**Page ${page + 1}/${maxPage + 1}** • **${allBackups.length} sauvegardes** disponibles`)
      .setColor(0x0099FF)
      .setTimestamp()
      .setFooter({ text: 'Sélectionnez dans le menu ci-dessous' });

    // Ajouter les détails des sauvegardes de la page
    let backupsList = '';
    pageBackups.forEach((backup, index) => {
      const globalIndex = startIndex + index + 1;
      const icon = backup.location === 'local' ? '🏠' : '☁️';
      const dateStr = backup.date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      backupsList += `**${globalIndex}.** ${icon} \`${backup.timestamp}\`\n`;
      backupsList += `📅 ${dateStr} • ⏰ ${backup.age}\n`;
      backupsList += `📊 Config: ${backup.configSize}KB • Données: ${backup.userDataSize}KB\n\n`;
    });

    embed.addFields(
      { name: '📋 Sauvegardes Disponibles', value: backupsList || 'Aucune sauvegarde sur cette page', inline: false }
    );

    // Créer les boutons de navigation
    const navigationRow = new ActionRowBuilder();

    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`restorer_prev_${page}`)
        .setLabel('◀ Page Précédente')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`restorer_refresh_${page}`)
        .setLabel('🔄 Actualiser')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`restorer_next_${page}`)
        .setLabel('Page Suivante ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === maxPage)
    );

    // Créer le menu de sélection avec noms complets
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('restorer_select')
      .setPlaceholder('📋 Choisir une sauvegarde à restaurer...')
      .addOptions(
        pageBackups.map((backup, index) => {
          const globalIndex = startIndex + index + 1;
          const dateStr = backup.date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          return {
            label: `${globalIndex}. ${backup.timestamp}`,
            description: `${dateStr} • ${backup.location} • ${backup.configSize + backup.userDataSize}KB`,
            value: backup.timestamp,
            emoji: backup.location === 'local' ? '🏠' : '☁️'
          };
        })
      );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    // Informations additionnelles
    const infoRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('restorer_info')
        .setLabel('ℹ️ Aide')
        .setStyle(ButtonStyle.Secondary)
    );

    const components = [navigationRow, selectRow, infoRow];

    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply({
        embeds: [embed],
        components: components
      });
    } else {
      return await interaction.reply({
        embeds: [embed],
        components: components
      });
    }
  }

  /**
   * Gère la confirmation de restauration avec embed détaillé
   */
  async handleRestoreConfirmation(interaction, timestamp) {
    await interaction.deferUpdate();

    try {
      const allBackups = this.getAllAvailableBackups();
      const backup = allBackups.find(b => b.timestamp === timestamp);

      if (!backup) {
        const notFoundEmbed = new EmbedBuilder()
          .setTitle('❌ Sauvegarde Introuvable')
          .setDescription(`La sauvegarde \`${timestamp}\` n'a pas été trouvée`)
          .addFields(
            { name: '💡 Solution', value: 'Utilisez 🔄 Actualiser pour mettre à jour la liste', inline: false }
          )
          .setColor(0xFF0000)
          .setTimestamp();
          
        return await interaction.editReply({
          embeds: [notFoundEmbed],
          components: []
        });
      }

      // Embed de confirmation détaillé
      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirmation de Restauration')
        .setDescription(`**ATTENTION:** Cette action remplacera la configuration actuelle du bot !`)
        .addFields(
          { name: '📅 Sauvegarde Sélectionnée', value: `\`${backup.timestamp}\``, inline: true },
          { name: '📍 Emplacement', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
          { name: '📊 Taille Totale', value: `${backup.configSize + backup.userDataSize} KB`, inline: true },
          { name: '📋 Fichier Config', value: `\`${backup.configFile}\`\n${backup.configSize} KB`, inline: true },
          { name: '👥 Fichier Données', value: `\`${backup.userDataFile}\`\n${backup.userDataSize} KB`, inline: true },
          { name: '⏰ Âge', value: backup.age, inline: true },
          { name: '📅 Date Création', value: backup.date.toLocaleString('fr-FR'), inline: true },
          { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true },
          { name: '⚠️ Impact', value: '• Configuration actuelle remplacée\n• Redémarrage du bot requis\n• Sauvegarde automatique de l\'ancien config', inline: false }
        )
        .setColor(0xFF9900)
        .setTimestamp();

      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`restore_execute_${timestamp}`)
            .setLabel('✅ Confirmer la Restauration')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('restore_cancel')
            .setLabel('❌ Annuler')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`restore_preview_${timestamp}`)
            .setLabel('👁️ Prévisualiser')
            .setStyle(ButtonStyle.Primary)
        );

      return await interaction.editReply({
        embeds: [confirmEmbed],
        components: [confirmRow]
      });

    } catch (error) {
      console.error('❌ Erreur confirmation restauration:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erreur de Confirmation')
        .setDescription('Impossible de préparer la restauration')
        .addFields(
          { name: '🔍 Erreur', value: `\`${error.message}\``, inline: false }
        )
        .setColor(0xFF0000)
        .setTimestamp();
        
      return await interaction.editReply({ 
        embeds: [errorEmbed],
        components: [] 
      });
    }
  }

  /**
   * Exécute la restauration avec embed de résultat détaillé
   */
  async executeRestore(interaction, timestamp) {
    await interaction.deferUpdate();

    try {
      const allBackups = this.getAllAvailableBackups();
      const backup = allBackups.find(b => b.timestamp === timestamp);

      if (!backup) {
        const notFoundEmbed = new EmbedBuilder()
          .setTitle('❌ Sauvegarde Introuvable')
          .setDescription(`La sauvegarde \`${timestamp}\` n'est plus disponible`)
          .setColor(0xFF0000)
          .setTimestamp();
          
        return await interaction.editReply({
          embeds: [notFoundEmbed],
          components: []
        });
      }

      console.log(`🔄 Restauration ${timestamp} démarrée par ${interaction.user.tag}`);
      
      const startTime = Date.now();
      let success = false;
      let configPath, userDataPath;
      
      if (backup.location === 'local') {
        configPath = `./data/backups/${backup.configFile}`;
        userDataPath = `./data/backups/${backup.userDataFile}`;
        success = this.backupSystem.restoreFromBackup(configPath, userDataPath);
      } else {
        configPath = backup.configPath;
        userDataPath = backup.userDataPath;
        success = this.backupSystem.restoreFromBackup(backup.configPath, backup.userDataPath);
      }
      
      const duration = Date.now() - startTime;

      if (success) {
        // Créer les fichiers téléchargeables de la restauration
        const attachments = [];
        
        try {
          if (fs.existsSync(configPath)) {
            const configBuffer = fs.readFileSync(configPath);
            attachments.push(new AttachmentBuilder(configBuffer, { name: `restored-config-${timestamp}.json` }));
          }
          
          if (fs.existsSync(userDataPath)) {
            const userDataBuffer = fs.readFileSync(userDataPath);
            attachments.push(new AttachmentBuilder(userDataBuffer, { name: `restored-userdata-${timestamp}.json` }));
          }
        } catch (fileError) {
          console.log('⚠️ Impossible de créer les fichiers téléchargeables:', fileError.message);
        }
        
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Restauration Réussie')
          .setDescription('La sauvegarde a été restaurée avec succès')
          .addFields(
            { name: '📅 Sauvegarde Restaurée', value: `\`${backup.timestamp}\``, inline: true },
            { name: '📍 Source', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
            { name: '⏱️ Durée', value: `${duration}ms`, inline: true },
            { name: '📋 Config Restauré', value: `\`${backup.configFile}\`\n${backup.configSize} KB`, inline: true },
            { name: '👥 Données Restaurées', value: `\`${backup.userDataFile}\`\n${backup.userDataSize} KB`, inline: true },
            { name: '💾 Sauvegarde Auto', value: '✅ Ancien config sauvegardé', inline: true },
            { name: '📅 Date Originale', value: backup.date.toLocaleString('fr-FR'), inline: true },
            { name: '🔄 Restauré par', value: interaction.user.toString(), inline: true },
            { name: '⚠️ Action Requise', value: '**Redémarrez le bot** pour appliquer les changements:\n`pm2 restart bagbot`', inline: false }
          )
          .setColor(0x00FF00)
          .setTimestamp()
          .setFooter({ text: 'Restauration terminée • Redémarrage requis' });

        const restartRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('restart_info')
              .setLabel('ℹ️ Comment Redémarrer')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

        return await interaction.editReply({
          content: '🎉 **Restauration terminée !** N\'oubliez pas de redémarrer le bot.',
          embeds: [successEmbed],
          components: [restartRow],
          files: attachments
        });
      } else {
        const failEmbed = new EmbedBuilder()
          .setTitle('❌ Échec de la Restauration')
          .setDescription('La restauration a échoué')
          .addFields(
            { name: '📅 Sauvegarde Tentée', value: `\`${timestamp}\``, inline: true },
            { name: '📍 Source', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
            { name: '⏱️ Durée', value: `${duration}ms`, inline: true },
            { name: '🔍 Vérifications', value: '• Permissions des fichiers\n• Intégrité des données\n• Espace disque disponible', inline: false },
            { name: '💡 Solutions', value: '• Vérifiez les logs du serveur\n• Essayez une autre sauvegarde\n• Contactez l\'administrateur', inline: false }
          )
          .setColor(0xFF0000)
          .setTimestamp();
          
        return await interaction.editReply({
          embeds: [failEmbed],
          components: []
        });
      }

    } catch (error) {
      console.error('❌ Erreur exécution restauration:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erreur de Restauration')
        .setDescription('Une erreur critique est survenue')
        .addFields(
          { name: '🔍 Erreur', value: `\`${error.message}\``, inline: false },
          { name: '📅 Timestamp', value: timestamp, inline: true },
          { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp();
        
      return await interaction.editReply({
        embeds: [errorEmbed],
        components: []
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
          await this.displayRestorerPage(interaction, allBackups, Math.max(0, currentPage - 1));
          break;
        case 'next':
          const maxPage = Math.ceil(allBackups.length / 10) - 1;
          await this.displayRestorerPage(interaction, allBackups, Math.min(maxPage, currentPage + 1));
          break;
        case 'refresh':
          await this.displayRestorerPage(interaction, allBackups, currentPage);
          break;
        case 'info':
          await this.showRestorerHelp(interaction);
          break;
      }
    } else if (action === 'restore') {
      const [subAction, timestamp] = params;
      
      if (subAction === 'execute') {
        await this.executeRestore(interaction, timestamp);
      } else if (subAction === 'cancel') {
        await this.cancelRestore(interaction);
      } else if (subAction === 'preview') {
        await this.showRestorePreview(interaction, timestamp);
      }
    }
  }

  /**
   * Gestionnaire du menu de sélection
   */
  async handleRestorerSelect(interaction) {
    const timestamp = interaction.values[0];
    await this.handleRestoreConfirmation(interaction, timestamp);
  }

  /**
   * Annule la restauration
   */
  async cancelRestore(interaction) {
    await interaction.update({
      content: '❌ Restauration annulée.',
      embeds: [],
      components: []
    });
  }

  /**
   * Affiche l'aide du sélecteur
   */
  async showRestorerHelp(interaction) {
    const helpEmbed = new EmbedBuilder()
      .setTitle('ℹ️ Aide du Sélecteur de Restauration')
      .setDescription('Guide d\'utilisation du système de restauration')
      .addFields(
        { name: '🎯 Navigation', value: '• **◀ ▶** : Changer de page\n• **🔄** : Actualiser la liste\n• **Menu** : Sélectionner une sauvegarde', inline: false },
        { name: '📋 Informations', value: '• **🏠** : Sauvegarde locale\n• **☁️** : Sauvegarde Freebox\n• **Âge** : Temps écoulé depuis création', inline: false },
        { name: '⚠️ Restauration', value: '• Confirmation obligatoire\n• Sauvegarde auto de l\'ancien config\n• Redémarrage requis après restauration', inline: false },
        { name: '🔧 Fichiers', value: '• **Config** : Configuration du bot\n• **Données** : Données utilisateurs\n• **Téléchargement** : Fichiers joints aux embeds', inline: false }
      )
      .setColor(0x0099FF)
      .setTimestamp()
      .setFooter({ text: 'Système de restauration avancé' });

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('restorer_refresh_0')
          .setLabel('🔙 Retour au Sélecteur')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.update({
      embeds: [helpEmbed],
      components: [backButton]
    });
  }

  /**
   * Affiche un aperçu de la sauvegarde
   */
  async showRestorePreview(interaction, timestamp) {
    await interaction.deferUpdate();
    
    try {
      const allBackups = this.getAllAvailableBackups();
      const backup = allBackups.find(b => b.timestamp === timestamp);

      if (!backup) {
        return await interaction.editReply({
          content: '❌ Sauvegarde introuvable pour l\'aperçu',
          components: []
        });
      }

      // Lire un aperçu des fichiers
      let configPreview = 'Impossible de lire';
      let userDataPreview = 'Impossible de lire';
      
      try {
        const configPath = backup.location === 'local' ? `./data/backups/${backup.configFile}` : backup.configPath;
        const userDataPath = backup.location === 'local' ? `./data/backups/${backup.userDataFile}` : backup.userDataPath;
        
        if (fs.existsSync(configPath)) {
          const configContent = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          const guildsCount = Object.keys(configContent.guilds || {}).length;
          configPreview = `${guildsCount} serveur(s) configuré(s)`;
        }
        
        if (fs.existsSync(userDataPath)) {
          const userDataContent = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
          let totalUsers = 0;
          Object.values(userDataContent.guilds || {}).forEach(guild => {
            if (guild.economy?.balances) totalUsers += Object.keys(guild.economy.balances).length;
          });
          userDataPreview = `${totalUsers} utilisateur(s) avec données`;
        }
      } catch (error) {
        console.log('⚠️ Erreur lecture aperçu:', error.message);
      }

      const previewEmbed = new EmbedBuilder()
        .setTitle('👁️ Aperçu de la Sauvegarde')
        .setDescription(`Aperçu du contenu de \`${timestamp}\``)
        .addFields(
          { name: '📋 Configuration', value: configPreview, inline: true },
          { name: '👥 Données Utilisateurs', value: userDataPreview, inline: true },
          { name: '📍 Emplacement', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
          { name: '📅 Créé le', value: backup.date.toLocaleString('fr-FR'), inline: true },
          { name: '⏰ Âge', value: backup.age, inline: true },
          { name: '📊 Taille', value: `${backup.configSize + backup.userDataSize} KB`, inline: true }
        )
        .setColor(0x9932CC)
        .setTimestamp();

      const previewButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`restore_execute_${timestamp}`)
            .setLabel('✅ Restaurer')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('restore_cancel')
            .setLabel('❌ Annuler')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('restorer_refresh_0')
            .setLabel('🔙 Retour')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.editReply({
        embeds: [previewEmbed],
        components: [previewButtons]
      });

    } catch (error) {
      console.error('❌ Erreur aperçu:', error);
      await interaction.editReply({
        content: `❌ Erreur lors de l'aperçu: ${error.message}`,
        components: []
      });
    }
  }

  /**
   * Extrait le timestamp d'un chemin de fichier
   */
  getTimestampFromPath(filePath) {
    if (!filePath) return null;
    const match = filePath.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/);
    return match ? match[1] : null;
  }
}

module.exports = BackupCommandsImproved;