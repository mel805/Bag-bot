const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const DualBackupSystem = require('./dual_backup_system_7days');
const FreeboxSync = require('./freebox_sync_7days');
const fs = require('fs');
const path = require('path');

/**
 * Commandes Discord avec logs automatiques dans le canal configuré
 * /backup - Forcer une sauvegarde avec embed détaillé et logs
 * /restorer - Restauration avec vrai sélecteur paginé et logs
 */

class BackupCommandsWithLogs {
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
   * Récupère la configuration des logs
   */
  async getLogsConfig(guildId) {
    try {
      const { getLogsConfig } = require('./storage/jsonStore');
      return await getLogsConfig(guildId);
    } catch (error) {
      console.log('⚠️ Impossible de récupérer la config logs:', error.message);
      return null;
    }
  }

  /**
   * Envoie un embed dans le canal de logs configuré
   */
  async sendToLogsChannel(guild, embed, files = []) {
    try {
      const logsConfig = await this.getLogsConfig(guild.id);
      
      if (!logsConfig?.backup?.enabled || !logsConfig?.backup?.channel) {
        console.log('📝 Canal de logs backup non configuré');
        return false;
      }

      const channel = guild.channels.cache.get(logsConfig.backup.channel);
      if (!channel) {
        console.log('❌ Canal de logs backup introuvable:', logsConfig.backup.channel);
        return false;
      }

      await channel.send({ embeds: [embed], files });
      console.log('✅ Embed envoyé dans les logs backup');
      return true;
    } catch (error) {
      console.error('❌ Erreur envoi logs backup:', error.message);
      return false;
    }
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
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Échec de Sauvegarde')
          .setDescription('Impossible de créer la sauvegarde')
          .addFields(
            { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true },
            { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
            { name: '🔍 Cause', value: 'Erreur lors de la création des fichiers', inline: false }
          )
          .setColor(0xFF0000)
          .setTimestamp();

        // Envoyer dans les logs
        await this.sendToLogsChannel(interaction.guild, errorEmbed);

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
      const timestamp = this.getTimestampFromPath(backupResult.configBackupFile);
      const configPath = `./data/backups/bot-config_${timestamp}.json`;
      const userDataPath = `./data/backups/user-data_${timestamp}.json`;
      
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
      
      // Embed détaillé pour l'utilisateur
      const userEmbed = new EmbedBuilder()
        .setTitle('✅ Sauvegarde Forcée Créée')
        .setDescription('Une nouvelle sauvegarde a été créée avec succès')
        .addFields(
          { name: '📅 Timestamp', value: `\`${timestamp || 'Inconnu'}\``, inline: true },
          { name: '⏱️ Durée', value: `${duration}ms`, inline: true },
          { name: '☁️ Synchronisation', value: syncResult ? '✅ Freebox OK' : '⚠️ Freebox échec', inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      // Embed détaillé pour les logs
      const logEmbed = new EmbedBuilder()
        .setTitle('📦 Sauvegarde Forcée Créée')
        .setDescription('Nouvelle sauvegarde générée par commande Discord')
        .addFields(
          { name: '📅 Timestamp', value: `\`${timestamp || 'Inconnu'}\``, inline: true },
          { name: '📋 Fichier Config', value: `\`${path.basename(configPath)}\`\n${Math.round((fs.existsSync(configPath) ? fs.statSync(configPath).size : 0) / 1024)} KB`, inline: true },
          { name: '👥 Fichier Données', value: `\`${path.basename(userDataPath)}\`\n${Math.round((fs.existsSync(userDataPath) ? fs.statSync(userDataPath).size : 0) / 1024)} KB`, inline: true },
          { name: '⏱️ Durée de Création', value: `${duration}ms`, inline: true },
          { name: '☁️ Synchronisation Freebox', value: syncResult ? '✅ Réussie' : '⚠️ Échec', inline: true },
          { name: '🧹 Nettoyage', value: '✅ Anciennes sauvegardes supprimées', inline: true },
          { name: '📁 Emplacement Local', value: '🏠 `./data/backups/`', inline: true },
          { name: '📡 Emplacement Freebox', value: '☁️ `/var/data/bot-backups/`', inline: true },
          { name: '🔄 Créé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: '📊 Rétention', value: '7 jours (168 sauvegardes)', inline: true },
          { name: '🎯 Type', value: 'Sauvegarde manuelle forcée', inline: true },
          { name: '📈 Statut', value: '✅ Opération terminée avec succès', inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: `Sauvegarde Discord • ID: ${interaction.id}` });

      // Envoyer dans les logs avec fichiers
      await this.sendToLogsChannel(interaction.guild, logEmbed, attachments);

      return await interaction.editReply({ 
        embeds: [userEmbed],
        files: attachments
      });

    } catch (error) {
      console.error('❌ Erreur sauvegarde forcée:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erreur de Sauvegarde')
        .setDescription('Une erreur est survenue lors de la création de la sauvegarde')
        .addFields(
          { name: '🔍 Erreur', value: `\`${error.message}\``, inline: false },
          { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
          { name: '📊 Type', value: 'Sauvegarde manuelle forcée', inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp()
        .setFooter({ text: `Erreur Sauvegarde • ID: ${interaction.id}` });

      // Envoyer l'erreur dans les logs
      await this.sendToLogsChannel(interaction.guild, errorEmbed);
        
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

        // Log l'absence de sauvegardes
        const logEmbed = new EmbedBuilder()
          .setTitle('⚠️ Tentative de Restauration Sans Sauvegarde')
          .setDescription('Aucune sauvegarde disponible pour la restauration')
          .addFields(
            { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
            { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
            { name: '📊 Emplacements vérifiés', value: 'Local et Freebox', inline: true }
          )
          .setColor(0xFF9900)
          .setTimestamp()
          .setFooter({ text: `Tentative Restauration • ID: ${interaction.id}` });

        await this.sendToLogsChannel(interaction.guild, logEmbed);
          
        return await interaction.editReply({ embeds: [noBackupEmbed] });
      }

      // Log l'ouverture du sélecteur
      const selectorLogEmbed = new EmbedBuilder()
        .setTitle('🔄 Sélecteur de Restauration Ouvert')
        .setDescription('Interface de sélection de sauvegarde affichée')
        .addFields(
          { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
          { name: '📊 Sauvegardes disponibles', value: `${allBackups.length} sauvegardes`, inline: true },
          { name: '🏠 Locales', value: `${allBackups.filter(b => b.location === 'local').length}`, inline: true },
          { name: '☁️ Freebox', value: `${allBackups.filter(b => b.location === 'freebox').length}`, inline: true },
          { name: '📈 Statut', value: '✅ Sélecteur affiché', inline: true }
        )
        .setColor(0x0099FF)
        .setTimestamp()
        .setFooter({ text: `Sélecteur Restauration • ID: ${interaction.id}` });

      await this.sendToLogsChannel(interaction.guild, selectorLogEmbed);

      // Afficher la première page du sélecteur
      return await this.displayRestorerPage(interaction, allBackups, 0);

    } catch (error) {
      console.error('❌ Erreur sélecteur restauration:', error);
      
      const errorLogEmbed = new EmbedBuilder()
        .setTitle('❌ Erreur du Sélecteur de Restauration')
        .setDescription('Impossible de charger l\'interface de restauration')
        .addFields(
          { name: '🔍 Erreur', value: `\`${error.message}\``, inline: false },
          { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp()
        .setFooter({ text: `Erreur Sélecteur • ID: ${interaction.id}` });

      await this.sendToLogsChannel(interaction.guild, errorLogEmbed);
        
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

        // Log la sauvegarde introuvable
        const logEmbed = new EmbedBuilder()
          .setTitle('⚠️ Sauvegarde Sélectionnée Introuvable')
          .setDescription('Tentative de sélection d\'une sauvegarde inexistante')
          .addFields(
            { name: '📅 Timestamp recherché', value: `\`${timestamp}\``, inline: true },
            { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
            { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
          )
          .setColor(0xFF9900)
          .setTimestamp()
          .setFooter({ text: `Sélection Échouée • ID: ${interaction.id}` });

        await this.sendToLogsChannel(interaction.guild, logEmbed);
          
        return await interaction.editReply({
          embeds: [notFoundEmbed],
          components: []
        });
      }

      // Log la sélection de sauvegarde
      const selectionLogEmbed = new EmbedBuilder()
        .setTitle('🎯 Sauvegarde Sélectionnée pour Restauration')
        .setDescription('Confirmation de restauration demandée')
        .addFields(
          { name: '📅 Sauvegarde', value: `\`${backup.timestamp}\``, inline: true },
          { name: '📍 Emplacement', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
          { name: '📊 Taille', value: `${backup.configSize + backup.userDataSize} KB`, inline: true },
          { name: '⏰ Âge', value: backup.age, inline: true },
          { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: '📈 Statut', value: '⏳ En attente de confirmation', inline: true }
        )
        .setColor(0xFF9900)
        .setTimestamp()
        .setFooter({ text: `Sélection Restauration • ID: ${interaction.id}` });

      await this.sendToLogsChannel(interaction.guild, selectionLogEmbed);

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
   * Exécute la restauration avec embed de résultat détaillé et logs
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

        // Log l'échec
        const logEmbed = new EmbedBuilder()
          .setTitle('❌ Restauration Échouée - Sauvegarde Introuvable')
          .setDescription('Tentative de restauration d\'une sauvegarde inexistante')
          .addFields(
            { name: '📅 Timestamp', value: `\`${timestamp}\``, inline: true },
            { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
            { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
          )
          .setColor(0xFF0000)
          .setTimestamp()
          .setFooter({ text: `Restauration Échouée • ID: ${interaction.id}` });

        await this.sendToLogsChannel(interaction.guild, logEmbed);
          
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

        // Embed pour l'utilisateur
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Restauration Réussie')
          .setDescription('La sauvegarde a été restaurée avec succès')
          .addFields(
            { name: '📅 Sauvegarde Restaurée', value: `\`${backup.timestamp}\``, inline: true },
            { name: '📍 Source', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
            { name: '⏱️ Durée', value: `${duration}ms`, inline: true },
            { name: '⚠️ Action Requise', value: '**Redémarrez le bot** pour appliquer les changements:\n`pm2 restart bagbot`', inline: false }
          )
          .setColor(0x00FF00)
          .setTimestamp();

        // Embed détaillé pour les logs
        const logEmbed = new EmbedBuilder()
          .setTitle('✅ Restauration Effectuée avec Succès')
          .setDescription('Sauvegarde restaurée via interface Discord')
          .addFields(
            { name: '📅 Sauvegarde Restaurée', value: `\`${backup.timestamp}\``, inline: true },
            { name: '📍 Source', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
            { name: '⏱️ Durée de Restauration', value: `${duration}ms`, inline: true },
            { name: '📋 Config Restauré', value: `\`${backup.configFile}\`\n${backup.configSize} KB`, inline: true },
            { name: '👥 Données Restaurées', value: `\`${backup.userDataFile}\`\n${backup.userDataSize} KB`, inline: true },
            { name: '💾 Sauvegarde Automatique', value: '✅ Ancien config sauvegardé', inline: true },
            { name: '📅 Date Originale Backup', value: backup.date.toLocaleString('fr-FR'), inline: true },
            { name: '⏰ Âge du Backup', value: backup.age, inline: true },
            { name: '📊 Taille Totale', value: `${backup.configSize + backup.userDataSize} KB`, inline: true },
            { name: '🔄 Restauré par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
            { name: '🎯 Type', value: 'Restauration manuelle Discord', inline: true },
            { name: '📈 Statut', value: '✅ Restauration terminée', inline: true },
            { name: '⚠️ Action Requise', value: '🔄 Redémarrage du bot nécessaire', inline: false }
          )
          .setColor(0x00FF00)
          .setTimestamp()
          .setFooter({ text: `Restauration Réussie • ID: ${interaction.id}` });

        // Envoyer dans les logs avec fichiers
        await this.sendToLogsChannel(interaction.guild, logEmbed, attachments);

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
        // Embed d'échec pour les logs
        const failLogEmbed = new EmbedBuilder()
          .setTitle('❌ Restauration Échouée')
          .setDescription('La restauration a échoué lors de l\'exécution')
          .addFields(
            { name: '📅 Sauvegarde Tentée', value: `\`${timestamp}\``, inline: true },
            { name: '📍 Source', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
            { name: '⏱️ Durée Tentative', value: `${duration}ms`, inline: true },
            { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
            { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
            { name: '🔍 Cause Possible', value: 'Erreur lors de la lecture/écriture des fichiers', inline: true }
          )
          .setColor(0xFF0000)
          .setTimestamp()
          .setFooter({ text: `Restauration Échouée • ID: ${interaction.id}` });

        await this.sendToLogsChannel(interaction.guild, failLogEmbed);

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

      // Log l'erreur
      const errorLogEmbed = new EmbedBuilder()
        .setTitle('❌ Erreur Critique de Restauration')
        .setDescription('Exception lors de l\'exécution de la restauration')
        .addFields(
          { name: '🔍 Erreur', value: `\`${error.message}\``, inline: false },
          { name: '📅 Timestamp', value: timestamp, inline: true },
          { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
          { name: '📊 Stack Trace', value: `\`\`\`${error.stack?.substring(0, 500) || 'Non disponible'}\`\`\``, inline: false }
        )
        .setColor(0xFF0000)
        .setTimestamp()
        .setFooter({ text: `Erreur Critique • ID: ${interaction.id}` });

      await this.sendToLogsChannel(interaction.guild, errorLogEmbed);
      
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
    // Log l'annulation
    const cancelLogEmbed = new EmbedBuilder()
      .setTitle('❌ Restauration Annulée')
      .setDescription('L\'utilisateur a annulé la restauration')
      .addFields(
        { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
        { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true },
        { name: '📈 Statut', value: 'Annulé par l\'utilisateur', inline: true }
      )
      .setColor(0xFF9900)
      .setTimestamp()
      .setFooter({ text: `Restauration Annulée • ID: ${interaction.id}` });

    await this.sendToLogsChannel(interaction.guild, cancelLogEmbed);

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
        { name: '🔧 Fichiers', value: '• **Config** : Configuration du bot\n• **Données** : Données utilisateurs\n• **Téléchargement** : Fichiers joints aux embeds', inline: false },
        { name: '📝 Logs', value: '• Toutes les actions sont loggées\n• Embeds détaillés dans le canal configuré\n• Historique complet des opérations', inline: false }
      )
      .setColor(0x0099FF)
      .setTimestamp()
      .setFooter({ text: 'Système de restauration avancé avec logs' });

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

      // Log l'aperçu
      const previewLogEmbed = new EmbedBuilder()
        .setTitle('👁️ Aperçu de Sauvegarde Demandé')
        .setDescription('Prévisualisation d\'une sauvegarde avant restauration')
        .addFields(
          { name: '📅 Sauvegarde', value: `\`${timestamp}\``, inline: true },
          { name: '🔄 Demandé par', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
        )
        .setColor(0x9932CC)
        .setTimestamp()
        .setFooter({ text: `Aperçu Sauvegarde • ID: ${interaction.id}` });

      await this.sendToLogsChannel(interaction.guild, previewLogEmbed);

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

module.exports = BackupCommandsWithLogs;