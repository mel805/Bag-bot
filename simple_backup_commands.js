const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Système de backup/restore simple et fonctionnel
 */

class SimpleBackupCommands {
  constructor() {
    this.backupDir = './data/backups';
    this.freeboxPath = '/var/data/bot-backups';
    
    // Créer les dossiers si nécessaires
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Génère un timestamp pour les noms de fichiers
   */
  getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}_${hour}h${minute}`;
  }

  /**
   * Gestionnaire de la commande /backup
   */
  async handleBackupCommand(interaction) {
    // Vérifier les permissions
    if (!interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({
        content: '❌ Seuls les administrateurs peuvent créer des sauvegardes.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const timestamp = this.getTimestamp();
      const configPath = path.join(this.backupDir, `bot-config_${timestamp}.json`);
      const userDataPath = path.join(this.backupDir, `user-data_${timestamp}.json`);

      // Lire et séparer les données
      const config = JSON.parse(fs.readFileSync('./data/config.json', 'utf8'));
      
      const botConfig = { guilds: {} };
      const userData = { guilds: {} };

      for (const [guildId, guildData] of Object.entries(config.guilds || {})) {
        // Configuration bot
        botConfig.guilds[guildId] = {};
        if (guildData.economy) {
          botConfig.guilds[guildId].economy = {
            enabled: guildData.economy.enabled,
            currency: guildData.economy.currency,
            actions: guildData.economy.actions,
            settings: guildData.economy.settings,
            booster: guildData.economy.booster,
            grants: guildData.economy.grants
          };
        }
        if (guildData.levels) {
          botConfig.guilds[guildId].levels = {
            enabled: guildData.levels.enabled,
            levelCurve: guildData.levels.levelCurve,
            rewards: guildData.levels.rewards,
            xpPerMessage: guildData.levels.xpPerMessage,
            xpPerVoiceMinute: guildData.levels.xpPerVoiceMinute
          };
        }

        // Données utilisateurs
        userData.guilds[guildId] = {};
        if (guildData.economy?.balances) {
          userData.guilds[guildId].economy = { balances: guildData.economy.balances };
        }
        if (guildData.levels?.users) {
          userData.guilds[guildId].levels = { users: guildData.levels.users };
        }
      }

      // Écrire les fichiers
      fs.writeFileSync(configPath, JSON.stringify(botConfig, null, 2));
      fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));

      // Synchroniser avec Freebox
      try {
        const { execSync } = require('child_process');
        execSync(`mkdir -p ${this.freeboxPath}/config ${this.freeboxPath}/userdata`, { stdio: 'pipe' });
        execSync(`cp "${configPath}" ${this.freeboxPath}/config/`, { stdio: 'pipe' });
        execSync(`cp "${userDataPath}" ${this.freeboxPath}/userdata/`, { stdio: 'pipe' });
      } catch (syncError) {
        console.log('⚠️ Erreur sync Freebox:', syncError.message);
      }

      // Créer les fichiers téléchargeables
      const configBuffer = fs.readFileSync(configPath);
      const userDataBuffer = fs.readFileSync(userDataPath);
      
      const attachments = [
        new AttachmentBuilder(configBuffer, { name: `bot-config_${timestamp}.json` }),
        new AttachmentBuilder(userDataBuffer, { name: `user-data_${timestamp}.json` })
      ];

      const embed = new EmbedBuilder()
        .setTitle('✅ Sauvegarde Créée')
        .setDescription('Nouvelle sauvegarde générée avec succès')
        .addFields(
          { name: '📅 Timestamp', value: `\`${timestamp}\``, inline: true },
          { name: '📋 Configuration', value: `${Math.round(fs.statSync(configPath).size / 1024)} KB`, inline: true },
          { name: '👥 Données Users', value: `${Math.round(fs.statSync(userDataPath).size / 1024)} KB`, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      return await interaction.editReply({
        embeds: [embed],
        files: attachments
      });

    } catch (error) {
      console.error('❌ Erreur backup:', error);
      return await interaction.editReply({
        content: `❌ Erreur: ${error.message}`
      });
    }
  }

  /**
   * Gestionnaire de la commande /restorer
   */
  async handleRestorerCommand(interaction) {
    // Vérifier les permissions
    if (!interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({
        content: '❌ Seuls les administrateurs peuvent restaurer des sauvegardes.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const backups = this.getAllBackups();
      
      if (backups.length === 0) {
        return await interaction.editReply({
          content: '❌ Aucune sauvegarde trouvée. Utilisez `/backup` pour en créer une.'
        });
      }

      return await this.displayBackupSelector(interaction, backups, 0);

    } catch (error) {
      console.error('❌ Erreur restorer:', error);
      return await interaction.editReply({
        content: `❌ Erreur: ${error.message}`
      });
    }
  }

  /**
   * Récupère toutes les sauvegardes
   */
  getAllBackups() {
    const backups = [];
    
    try {
      const files = fs.readdirSync(this.backupDir);
      const configFiles = files.filter(f => f.startsWith('bot-config_')).sort().reverse();
      
      configFiles.forEach(configFile => {
        const timestamp = configFile.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1];
        if (timestamp) {
          const userDataFile = `user-data_${timestamp}.json`;
          
          if (files.includes(userDataFile)) {
            const configPath = path.join(this.backupDir, configFile);
            const userDataPath = path.join(this.backupDir, userDataFile);
            
            const configStats = fs.statSync(configPath);
            const userDataStats = fs.statSync(userDataPath);
            
            backups.push({
              timestamp,
              configFile,
              userDataFile,
              configSize: Math.round(configStats.size / 1024),
              userDataSize: Math.round(userDataStats.size / 1024),
              date: configStats.mtime,
              age: this.getAge(configStats.mtime),
              location: 'local'
            });
          }
        }
      });
    } catch (error) {
      console.log('⚠️ Erreur lecture backups locaux:', error.message);
    }

    // Ajouter les sauvegardes Freebox
    try {
      const { execSync } = require('child_process');
      const freeboxConfigs = execSync(`ls ${this.freeboxPath}/config/bot-config_*.json 2>/dev/null | sort -r || echo ""`, { encoding: 'utf8' }).trim();
      
      if (freeboxConfigs) {
        const configFiles = freeboxConfigs.split('\n').filter(f => f);
        
        configFiles.forEach(configPath => {
          const fileName = path.basename(configPath);
          const timestamp = fileName.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1];
          
          if (timestamp && !backups.find(b => b.timestamp === timestamp)) {
            const userDataPath = `${this.freeboxPath}/userdata/user-data_${timestamp}.json`;
            
            if (fs.existsSync(userDataPath)) {
              const configStats = fs.statSync(configPath);
              const userDataStats = fs.statSync(userDataPath);
              
              backups.push({
                timestamp,
                configFile: fileName,
                userDataFile: `user-data_${timestamp}.json`,
                configSize: Math.round(configStats.size / 1024),
                userDataSize: Math.round(userDataStats.size / 1024),
                date: configStats.mtime,
                age: this.getAge(configStats.mtime),
                location: 'freebox',
                configPath,
                userDataPath
              });
            }
          }
        });
      }
    } catch (error) {
      console.log('⚠️ Erreur lecture backups Freebox:', error.message);
    }

    return backups.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /**
   * Calcule l'âge d'une sauvegarde
   */
  getAge(date) {
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}j ${hours % 24}h`;
    } else {
      return `${hours}h`;
    }
  }

  /**
   * Affiche le sélecteur de sauvegardes
   */
  async displayBackupSelector(interaction, backups, page) {
    const pageSize = 10;
    const maxPage = Math.ceil(backups.length / pageSize) - 1;
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, backups.length);
    const pageBackups = backups.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setTitle('🔄 Sélecteur de Restauration')
      .setDescription(`Page ${page + 1}/${maxPage + 1} • ${backups.length} sauvegardes disponibles`)
      .setColor(0x0099FF);

    // Ajouter les détails
    let description = '';
    pageBackups.forEach((backup, index) => {
      const globalIndex = startIndex + index + 1;
      const icon = backup.location === 'local' ? '🏠' : '☁️';
      description += `**${globalIndex}.** ${icon} \`${backup.timestamp}\`\n`;
      description += `📅 ${backup.date.toLocaleString('fr-FR')} • ⏰ ${backup.age}\n`;
      description += `📊 ${backup.configSize + backup.userDataSize}KB\n\n`;
    });

    embed.addFields({ name: 'Sauvegardes', value: description || 'Aucune', inline: false });

    // Navigation
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`backup_prev_${page}`)
        .setLabel('◀ Précédent')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`backup_refresh_${page}`)
        .setLabel('🔄')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`backup_next_${page}`)
        .setLabel('Suivant ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === maxPage)
    );

    // Sélecteur avec vrais noms
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('backup_select')
      .setPlaceholder('Sélectionner une sauvegarde...')
      .addOptions(
        pageBackups.map(backup => ({
          label: backup.timestamp,
          description: `${backup.date.toLocaleString('fr-FR')} • ${backup.location} • ${backup.configSize + backup.userDataSize}KB`,
          value: backup.timestamp,
          emoji: backup.location === 'local' ? '🏠' : '☁️'
        }))
      );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    return await interaction.editReply({
      embeds: [embed],
      components: [navRow, selectRow]
    });
  }

  /**
   * Gère les interactions
   */
  async handleInteraction(interaction) {
    if (interaction.isButton()) {
      const [action, subAction, page] = interaction.customId.split('_');
      
      if (action === 'backup') {
        const currentPage = parseInt(page) || 0;
        const backups = this.getAllBackups();

        switch (subAction) {
          case 'prev':
            await this.displayBackupSelector(interaction, backups, Math.max(0, currentPage - 1));
            break;
          case 'next':
            const maxPage = Math.ceil(backups.length / 10) - 1;
            await this.displayBackupSelector(interaction, backups, Math.min(maxPage, currentPage + 1));
            break;
          case 'refresh':
            await this.displayBackupSelector(interaction, backups, currentPage);
            break;
        }
      } else if (action === 'restore') {
        const [subAction, timestamp] = [subAction, page];
        
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
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'backup_select') {
      const timestamp = interaction.values[0];
      await this.showRestoreConfirmation(interaction, timestamp);
    }
  }

  /**
   * Affiche la confirmation de restauration
   */
  async showRestoreConfirmation(interaction, timestamp) {
    const backups = this.getAllBackups();
    const backup = backups.find(b => b.timestamp === timestamp);

    if (!backup) {
      return await interaction.update({
        content: `❌ Sauvegarde \`${timestamp}\` introuvable.`,
        embeds: [],
        components: []
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirmation de Restauration')
      .setDescription(`Restaurer la sauvegarde \`${backup.timestamp}\` ?`)
      .addFields(
        { name: '📅 Date', value: backup.date.toLocaleString('fr-FR'), inline: true },
        { name: '📍 Emplacement', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
        { name: '📊 Taille', value: `${backup.configSize + backup.userDataSize} KB`, inline: true }
      )
      .setColor(0xFF9900);

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`restore_confirm_${timestamp}`)
        .setLabel('✅ Confirmer')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('restore_cancel')
        .setLabel('❌ Annuler')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
      embeds: [embed],
      components: [confirmRow]
    });
  }

  /**
   * Exécute la restauration
   */
  async executeRestore(interaction, timestamp) {
    await interaction.deferUpdate();

    try {
      const backups = this.getAllBackups();
      const backup = backups.find(b => b.timestamp === timestamp);

      if (!backup) {
        return await interaction.editReply({
          content: `❌ Sauvegarde \`${timestamp}\` introuvable.`,
          components: []
        });
      }

      // Chemins des fichiers
      let configPath, userDataPath;
      
      if (backup.location === 'local') {
        configPath = path.join(this.backupDir, backup.configFile);
        userDataPath = path.join(this.backupDir, backup.userDataFile);
      } else {
        configPath = backup.configPath;
        userDataPath = backup.userDataPath;
      }

      // Lire et fusionner les données
      const botConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
      
      const mergedConfig = { guilds: {} };
      
      for (const [guildId, guildBotConfig] of Object.entries(botConfig.guilds || {})) {
        mergedConfig.guilds[guildId] = { ...guildBotConfig };
        
        if (userData.guilds?.[guildId]) {
          const guildUserData = userData.guilds[guildId];
          
          if (guildUserData.economy?.balances) {
            if (!mergedConfig.guilds[guildId].economy) mergedConfig.guilds[guildId].economy = {};
            mergedConfig.guilds[guildId].economy.balances = guildUserData.economy.balances;
          }
          
          if (guildUserData.levels?.users) {
            if (!mergedConfig.guilds[guildId].levels) mergedConfig.guilds[guildId].levels = {};
            mergedConfig.guilds[guildId].levels.users = guildUserData.levels.users;
          }
        }
      }

      // Sauvegarder l'ancien config
      const backupOriginal = `./data/config.json.backup-${this.getTimestamp()}`;
      fs.copyFileSync('./data/config.json', backupOriginal);
      
      // Écrire le nouveau config
      fs.writeFileSync('./data/config.json', JSON.stringify(mergedConfig, null, 2));

      const embed = new EmbedBuilder()
        .setTitle('✅ Restauration Réussie')
        .setDescription(`Sauvegarde \`${timestamp}\` restaurée`)
        .addFields(
          { name: '📍 Source', value: backup.location === 'local' ? '🏠 Local' : '☁️ Freebox', inline: true },
          { name: '📊 Taille', value: `${backup.configSize + backup.userDataSize} KB`, inline: true },
          { name: '💾 Ancien config', value: `\`${path.basename(backupOriginal)}\``, inline: true }
        )
        .setColor(0x00FF00);

      return await interaction.editReply({
        content: '⚠️ **Redémarrez le bot** : `pm2 restart bagbot`',
        embeds: [embed],
        components: []
      });

    } catch (error) {
      console.error('❌ Erreur restauration:', error);
      return await interaction.editReply({
        content: `❌ Erreur restauration: ${error.message}`,
        components: []
      });
    }
  }
}

module.exports = SimpleBackupCommands;