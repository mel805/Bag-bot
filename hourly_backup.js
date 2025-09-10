#!/usr/bin/env node

const DualBackupSystem = require('./dual_backup_system');
const FreeboxSync = require('./freebox_sync');

/**
 * Script principal de sauvegarde horaire
 * Combine la création de sauvegardes duales et la synchronisation Freebox
 */

class HourlyBackup {
  constructor() {
    this.backupSystem = new DualBackupSystem('./data/config.json', './data/backups');
    this.freeboxSync = new FreeboxSync('./data/backups', '/var/data/bot-backups');
  }

  /**
   * Exécute une sauvegarde complète
   */
  async runBackup() {
    console.log(`🔄 === SAUVEGARDE HORAIRE DÉMARRÉE ${new Date().toISOString()} ===`);
    
    try {
      // 1. Créer les sauvegardes duales
      console.log('\n📦 Étape 1: Création des sauvegardes duales...');
      const backupResult = this.backupSystem.createBackup();
      
      if (!backupResult) {
        console.error('❌ Échec de la création des sauvegardes');
        return false;
      }

      // 2. Nettoyer les anciennes sauvegardes locales
      console.log('\n🧹 Étape 2: Nettoyage des anciennes sauvegardes locales...');
      this.backupSystem.cleanOldBackups();

      // 3. Synchroniser avec la Freebox
      console.log('\n☁️ Étape 3: Synchronisation vers Freebox...');
      const syncResult = this.freeboxSync.syncToFreebox();
      
      if (!syncResult) {
        console.error('⚠️ Synchronisation Freebox échouée, mais sauvegardes locales créées');
      }

      // 4. Nettoyer les anciennes sauvegardes Freebox
      console.log('\n🧹 Étape 4: Nettoyage des anciennes sauvegardes Freebox...');
      this.freeboxSync.cleanFreeboxBackups();

      console.log(`\n✅ === SAUVEGARDE HORAIRE TERMINÉE ${new Date().toISOString()} ===`);
      return true;

    } catch (error) {
      console.error('❌ Erreur durant la sauvegarde horaire:', error.message);
      return false;
    }
  }

  /**
   * Affiche le statut des sauvegardes
   */
  showStatus() {
    console.log('\n📊 === STATUT DES SAUVEGARDES ===');
    
    // Sauvegardes locales
    try {
      const fs = require('fs');
      const files = fs.readdirSync('./data/backups');
      const configFiles = files.filter(f => f.startsWith('bot-config_')).length;
      const userDataFiles = files.filter(f => f.startsWith('user-data_')).length;
      
      console.log(`📋 Sauvegardes config locales: ${configFiles}`);
      console.log(`👥 Sauvegardes données users locales: ${userDataFiles}`);
      
      if (configFiles > 0) {
        const latestConfig = files.filter(f => f.startsWith('bot-config_')).sort().pop();
        console.log(`   Dernière config: ${latestConfig}`);
      }
      
      if (userDataFiles > 0) {
        const latestUserData = files.filter(f => f.startsWith('user-data_')).sort().pop();
        console.log(`   Dernières données: ${latestUserData}`);
      }
      
    } catch (error) {
      console.log('❌ Impossible de lire les sauvegardes locales');
    }

    // Sauvegardes Freebox
    this.freeboxSync.listFreeboxBackups();
  }
}

// Si exécuté directement
if (require.main === module) {
  const backup = new HourlyBackup();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--status')) {
    backup.showStatus();
  } else if (args.includes('--help')) {
    console.log(`
🔄 Système de Sauvegarde Horaire du Bot Discord

Usage:
  node hourly_backup.js              # Exécuter une sauvegarde complète
  node hourly_backup.js --status     # Afficher le statut des sauvegardes
  node hourly_backup.js --help       # Afficher cette aide

Fonctionnalités:
  📋 Sauvegarde séparée de la configuration du bot
  👥 Sauvegarde séparée des données utilisateurs
  ☁️ Synchronisation automatique vers Freebox
  🧹 Nettoyage automatique des anciennes sauvegardes
  🕐 Horodatage des fichiers de sauvegarde

Fichiers créés:
  bot-config_YYYY-MM-DD_HHhMM.json   # Configuration du bot
  user-data_YYYY-MM-DD_HHhMM.json    # Données utilisateurs
`);
  } else {
    // Exécution normale
    backup.runBackup().then(success => {
      process.exit(success ? 0 : 1);
    });
  }
}

module.exports = HourlyBackup;