#!/usr/bin/env node

const DualBackupSystem = require('./dual_backup_system');
const FreeboxSync = require('./freebox_sync');
const fs = require('fs');
const path = require('path');

/**
 * Script de restauration depuis les sauvegardes duales
 */

class RestoreBackup {
  constructor() {
    this.backupSystem = new DualBackupSystem('./data/config.json', './data/backups');
    this.freeboxSync = new FreeboxSync('./data/backups', '/var/data/bot-backups');
  }

  /**
   * Liste toutes les sauvegardes disponibles
   */
  listAvailableBackups() {
    console.log('\n📋 === SAUVEGARDES DISPONIBLES ===\n');
    
    // Sauvegardes locales
    console.log('🏠 SAUVEGARDES LOCALES:');
    try {
      const localFiles = fs.readdirSync('./data/backups');
      const configFiles = localFiles.filter(f => f.startsWith('bot-config_')).sort().reverse();
      const userDataFiles = localFiles.filter(f => f.startsWith('user-data_')).sort().reverse();
      
      if (configFiles.length === 0) {
        console.log('   Aucune sauvegarde locale trouvée');
      } else {
        console.log('   📋 Configurations:');
        configFiles.slice(0, 10).forEach((file, index) => {
          const stats = fs.statSync(path.join('./data/backups', file));
          const size = Math.round(stats.size / 1024);
          const timestamp = file.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1] || 'unknown';
          console.log(`      ${index + 1}. ${timestamp} (${size} KB)`);
        });
        
        if (configFiles.length > 10) {
          console.log(`      ... et ${configFiles.length - 10} autres`);
        }
      }
    } catch (error) {
      console.log('   ❌ Erreur lecture sauvegardes locales');
    }
    
    // Sauvegardes Freebox
    console.log('\n☁️ SAUVEGARDES FREEBOX:');
    try {
      const { execSync } = require('child_process');
      const freeboxConfigs = execSync('ls /var/data/bot-backups/config/bot-config_*.json 2>/dev/null | sort -r | head -10 || echo "none"', { encoding: 'utf8' }).trim();
      
      if (freeboxConfigs === 'none' || !freeboxConfigs) {
        console.log('   Aucune sauvegarde Freebox trouvée');
      } else {
        console.log('   📋 Configurations:');
        freeboxConfigs.split('\n').forEach((filePath, index) => {
          if (filePath && filePath !== 'none') {
            const fileName = path.basename(filePath);
            const timestamp = fileName.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1] || 'unknown';
            try {
              const stats = fs.statSync(filePath);
              const size = Math.round(stats.size / 1024);
              console.log(`      ${index + 1}. ${timestamp} (${size} KB)`);
            } catch (error) {
              console.log(`      ${index + 1}. ${timestamp} (taille inconnue)`);
            }
          }
        });
      }
    } catch (error) {
      console.log('   ❌ Erreur lecture sauvegardes Freebox');
    }
  }

  /**
   * Restaure depuis un timestamp spécifique
   */
  restoreFromTimestamp(timestamp) {
    console.log(`🔄 Restauration depuis le timestamp: ${timestamp}`);
    
    // Chercher d'abord localement
    const localConfigFile = `./data/backups/bot-config_${timestamp}.json`;
    const localUserDataFile = `./data/backups/user-data_${timestamp}.json`;
    
    if (fs.existsSync(localConfigFile) && fs.existsSync(localUserDataFile)) {
      console.log('📁 Utilisation des sauvegardes locales...');
      return this.backupSystem.restoreFromBackup(localConfigFile, localUserDataFile);
    }
    
    // Sinon chercher sur la Freebox
    const freeboxConfigFile = `/var/data/bot-backups/config/bot-config_${timestamp}.json`;
    const freeboxUserDataFile = `/var/data/bot-backups/userdata/user-data_${timestamp}.json`;
    
    if (fs.existsSync(freeboxConfigFile) && fs.existsSync(freeboxUserDataFile)) {
      console.log('☁️ Utilisation des sauvegardes Freebox...');
      return this.backupSystem.restoreFromBackup(freeboxConfigFile, freeboxUserDataFile);
    }
    
    console.error(`❌ Aucune sauvegarde trouvée pour le timestamp: ${timestamp}`);
    console.log('\n💡 Utilisez --list pour voir les sauvegardes disponibles');
    return false;
  }

  /**
   * Restaure la sauvegarde la plus récente
   */
  restoreLatest() {
    console.log('🔄 Restauration de la sauvegarde la plus récente...');
    
    try {
      // Chercher la plus récente localement
      const localFiles = fs.readdirSync('./data/backups');
      const configFiles = localFiles.filter(f => f.startsWith('bot-config_')).sort().reverse();
      
      if (configFiles.length > 0) {
        const latestTimestamp = configFiles[0].match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1];
        if (latestTimestamp) {
          console.log(`📅 Timestamp le plus récent: ${latestTimestamp}`);
          return this.restoreFromTimestamp(latestTimestamp);
        }
      }
      
      console.error('❌ Aucune sauvegarde trouvée');
      return false;
      
    } catch (error) {
      console.error('❌ Erreur lors de la recherche de sauvegardes:', error.message);
      return false;
    }
  }
}

// Si exécuté directement
if (require.main === module) {
  const restore = new RestoreBackup();
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.length === 0) {
    console.log(`
🔄 Script de Restauration des Sauvegardes Duales

Usage:
  node restore_backup.js --list                    # Lister les sauvegardes disponibles
  node restore_backup.js --latest                  # Restaurer la plus récente
  node restore_backup.js --timestamp YYYY-MM-DD_HHhMM  # Restaurer un timestamp spécifique
  node restore_backup.js --help                    # Afficher cette aide

Exemples:
  node restore_backup.js --timestamp 2025-09-10_17h16
  node restore_backup.js --latest

⚠️ ATTENTION: La restauration remplace le fichier config.json actuel!
   Un backup automatique est créé avant la restauration.
`);
  } else if (args.includes('--list')) {
    restore.listAvailableBackups();
  } else if (args.includes('--latest')) {
    const success = restore.restoreLatest();
    process.exit(success ? 0 : 1);
  } else if (args.includes('--timestamp')) {
    const timestampIndex = args.indexOf('--timestamp') + 1;
    if (timestampIndex < args.length) {
      const timestamp = args[timestampIndex];
      const success = restore.restoreFromTimestamp(timestamp);
      process.exit(success ? 0 : 1);
    } else {
      console.error('❌ Timestamp manquant après --timestamp');
      process.exit(1);
    }
  } else {
    console.error('❌ Arguments invalides. Utilisez --help pour l\'aide.');
    process.exit(1);
  }
}

module.exports = RestoreBackup;