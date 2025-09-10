const fs = require('fs');
const path = require('path');

/**
 * Système de sauvegarde dual pour le bot Discord - Version 7 jours
 * - Fichier 1: Configuration du bot (actions, levels, settings, rewards, etc.)
 * - Fichier 2: Données utilisateurs (balances, cooldowns, XP, stats, etc.)
 * - Rétention: 7 jours (168 sauvegardes horaires)
 */

class DualBackupSystem {
  constructor(configPath = './data/config.json', backupDir = './data/backups') {
    this.configPath = configPath;
    this.backupDir = backupDir;
    this.retentionHours = 168; // 7 jours * 24 heures
    
    // Créer le dossier de sauvegarde s'il n'existe pas
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
   * Sépare les données de configuration des données utilisateurs
   */
  separateData(config) {
    const botConfig = {};
    const userData = {};

    for (const [guildId, guildData] of Object.entries(config.guilds || {})) {
      // === CONFIGURATION BOT ===
      botConfig[guildId] = {};
      
      // Économie - Configuration seulement
      if (guildData.economy) {
        botConfig[guildId].economy = {
          enabled: guildData.economy.enabled,
          currency: guildData.economy.currency,
          actions: guildData.economy.actions,
          settings: guildData.economy.settings,
          booster: guildData.economy.booster,
          grants: guildData.economy.grants
        };
      }

      // Levels - Configuration seulement
      if (guildData.levels) {
        botConfig[guildId].levels = {
          enabled: guildData.levels.enabled,
          levelCurve: guildData.levels.levelCurve,
          rewards: guildData.levels.rewards,
          xpPerMessage: guildData.levels.xpPerMessage,
          xpPerVoiceMinute: guildData.levels.xpPerVoiceMinute,
          announcements: guildData.levels.announcements
        };
      }

      // Autres configurations
      if (guildData.automod) botConfig[guildId].automod = guildData.automod;
      if (guildData.verification) botConfig[guildId].verification = guildData.verification;
      if (guildData.welcome) botConfig[guildId].welcome = guildData.welcome;
      if (guildData.logging) botConfig[guildId].logging = guildData.logging;

      // === DONNÉES UTILISATEURS ===
      userData[guildId] = {};

      // Économie - Données utilisateurs seulement
      if (guildData.economy && guildData.economy.balances) {
        userData[guildId].economy = {
          balances: guildData.economy.balances
        };
      }

      // Levels - Données utilisateurs seulement
      if (guildData.levels && guildData.levels.users) {
        userData[guildId].levels = {
          users: guildData.levels.users
        };
      }

      // Autres données utilisateurs
      if (guildData.warnings) userData[guildId].warnings = guildData.warnings;
      if (guildData.mutes) userData[guildId].mutes = guildData.mutes;
      if (guildData.userStats) userData[guildId].userStats = guildData.userStats;
    }

    return { botConfig: { guilds: botConfig }, userData: { guilds: userData } };
  }

  /**
   * Crée les sauvegardes séparées
   */
  createBackup() {
    try {
      // Lire le fichier de configuration principal
      if (!fs.existsSync(this.configPath)) {
        console.error('❌ Fichier config.json introuvable:', this.configPath);
        return false;
      }

      const rawConfig = fs.readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(rawConfig);
      
      // Séparer les données
      const { botConfig, userData } = this.separateData(config);
      
      // Générer le timestamp
      const timestamp = this.getTimestamp();
      
      // Noms des fichiers de sauvegarde
      const configBackupFile = path.join(this.backupDir, `bot-config_${timestamp}.json`);
      const userDataBackupFile = path.join(this.backupDir, `user-data_${timestamp}.json`);
      
      // Écrire les sauvegardes
      fs.writeFileSync(configBackupFile, JSON.stringify(botConfig, null, 2));
      fs.writeFileSync(userDataBackupFile, JSON.stringify(userData, null, 2));
      
      // Statistiques des fichiers
      const configStats = fs.statSync(configBackupFile);
      const userDataStats = fs.statSync(userDataBackupFile);
      
      console.log(`✅ Sauvegarde créée avec succès:`);
      console.log(`   📋 Configuration: ${configBackupFile} (${Math.round(configStats.size / 1024)} KB)`);
      console.log(`   👥 Données users: ${userDataBackupFile} (${Math.round(userDataStats.size / 1024)} KB)`);
      
      return { configBackupFile, userDataBackupFile };
      
    } catch (error) {
      console.error('❌ Erreur lors de la création de sauvegarde:', error.message);
      return false;
    }
  }

  /**
   * Restaure depuis les sauvegardes séparées
   */
  restoreFromBackup(configBackupFile, userDataBackupFile) {
    try {
      // Lire les sauvegardes
      const botConfig = JSON.parse(fs.readFileSync(configBackupFile, 'utf8'));
      const userData = JSON.parse(fs.readFileSync(userDataBackupFile, 'utf8'));
      
      // Fusionner les données
      const mergedConfig = { guilds: {} };
      
      for (const [guildId, guildBotConfig] of Object.entries(botConfig.guilds || {})) {
        mergedConfig.guilds[guildId] = { ...guildBotConfig };
        
        // Ajouter les données utilisateurs
        if (userData.guilds && userData.guilds[guildId]) {
          const guildUserData = userData.guilds[guildId];
          
          // Fusionner economy
          if (guildUserData.economy && guildUserData.economy.balances) {
            if (!mergedConfig.guilds[guildId].economy) {
              mergedConfig.guilds[guildId].economy = {};
            }
            mergedConfig.guilds[guildId].economy.balances = guildUserData.economy.balances;
          }
          
          // Fusionner levels
          if (guildUserData.levels && guildUserData.levels.users) {
            if (!mergedConfig.guilds[guildId].levels) {
              mergedConfig.guilds[guildId].levels = {};
            }
            mergedConfig.guilds[guildId].levels.users = guildUserData.levels.users;
          }
          
          // Autres données utilisateurs
          if (guildUserData.warnings) mergedConfig.guilds[guildId].warnings = guildUserData.warnings;
          if (guildUserData.mutes) mergedConfig.guilds[guildId].mutes = guildUserData.mutes;
          if (guildUserData.userStats) mergedConfig.guilds[guildId].userStats = guildUserData.userStats;
        }
      }
      
      // Sauvegarder l'ancien fichier
      const backupOriginal = `${this.configPath}.backup-${this.getTimestamp()}`;
      fs.copyFileSync(this.configPath, backupOriginal);
      
      // Écrire le fichier restauré
      fs.writeFileSync(this.configPath, JSON.stringify(mergedConfig, null, 2));
      
      console.log(`✅ Restauration réussie depuis:`);
      console.log(`   📋 ${configBackupFile}`);
      console.log(`   👥 ${userDataBackupFile}`);
      console.log(`   💾 Ancien config sauvé: ${backupOriginal}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Erreur lors de la restauration:', error.message);
      return false;
    }
  }

  /**
   * Nettoie les anciennes sauvegardes (garde 7 jours = 168 sauvegardes)
   */
  cleanOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const configFiles = files.filter(f => f.startsWith('bot-config_')).sort();
      const userDataFiles = files.filter(f => f.startsWith('user-data_')).sort();
      
      console.log(`🧹 Nettoyage: ${configFiles.length} configs, ${userDataFiles.length} données users (limite: ${this.retentionHours})`);
      
      // Supprimer les anciens fichiers de config
      if (configFiles.length > this.retentionHours) {
        const toDelete = configFiles.slice(0, configFiles.length - this.retentionHours);
        toDelete.forEach(file => {
          fs.unlinkSync(path.join(this.backupDir, file));
          console.log(`🗑️ Supprimé config: ${file}`);
        });
      }
      
      // Supprimer les anciens fichiers de données utilisateurs
      if (userDataFiles.length > this.retentionHours) {
        const toDelete = userDataFiles.slice(0, userDataFiles.length - this.retentionHours);
        toDelete.forEach(file => {
          fs.unlinkSync(path.join(this.backupDir, file));
          console.log(`🗑️ Supprimé données: ${file}`);
        });
      }
      
      console.log(`✅ Nettoyage terminé (rétention: 7 jours)`);
      
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error.message);
    }
  }

  /**
   * Liste toutes les sauvegardes disponibles avec détails
   */
  getAllBackups() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const configFiles = files.filter(f => f.startsWith('bot-config_')).sort().reverse();
      const userDataFiles = files.filter(f => f.startsWith('user-data_')).sort().reverse();
      
      const backups = [];
      
      // Créer une liste des sauvegardes complètes (config + données)
      configFiles.forEach(configFile => {
        const timestamp = configFile.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1];
        if (timestamp) {
          const userDataFile = `user-data_${timestamp}.json`;
          
          if (userDataFiles.includes(userDataFile)) {
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
              age: this.getAge(configStats.mtime)
            });
          }
        }
      });
      
      return backups;
      
    } catch (error) {
      console.error('❌ Erreur lors de la liste des sauvegardes:', error.message);
      return [];
    }
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
}

// Export pour utilisation en tant que module
module.exports = DualBackupSystem;

// Si exécuté directement, faire une sauvegarde
if (require.main === module) {
  const backup = new DualBackupSystem();
  const result = backup.createBackup();
  if (result) {
    backup.cleanOldBackups();
  }
}