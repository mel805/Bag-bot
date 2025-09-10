#!/usr/bin/env node

const DualBackupSystem = require('./dual_backup_system_7days');
const FreeboxSync = require('./freebox_sync_7days');

/**
 * Script principal de sauvegarde horaire - Version 7 jours
 * Combine la création de sauvegardes duales et la synchronisation Freebox
 * Rétention: 7 jours (168 sauvegardes horaires)
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
    console.log(`📦 Rétention configurée: 7 jours (168 sauvegardes)`);
    
    try {
      // 1. Créer les sauvegardes duales
      console.log('\n📦 Étape 1: Création des sauvegardes duales...');
      const backupResult = this.backupSystem.createBackup();
      
      if (!backupResult) {
        console.error('❌ Échec de la création des sauvegardes');
        return false;
      }

      // 2. Nettoyer les anciennes sauvegardes locales (7 jours)
      console.log('\n🧹 Étape 2: Nettoyage des anciennes sauvegardes locales...');
      this.backupSystem.cleanOldBackups();

      // 3. Synchroniser avec la Freebox
      console.log('\n☁️ Étape 3: Synchronisation vers Freebox...');
      const syncResult = this.freeboxSync.syncToFreebox();
      
      if (!syncResult) {
        console.error('⚠️ Synchronisation Freebox échouée, mais sauvegardes locales créées');
      }

      // 4. Nettoyer les anciennes sauvegardes Freebox (7 jours)
      console.log('\n🧹 Étape 4: Nettoyage des anciennes sauvegardes Freebox...');
      this.freeboxSync.cleanFreeboxBackups();

      // 5. Vérification d'intégrité optionnelle
      console.log('\n🔍 Étape 5: Vérification d\'intégrité...');
      const integrityOk = this.freeboxSync.checkIntegrity();
      
      if (!integrityOk) {
        console.log('⚠️ Problèmes d\'intégrité détectés (voir détails ci-dessus)');
      }

      console.log(`\n✅ === SAUVEGARDE HORAIRE TERMINÉE ${new Date().toISOString()} ===`);
      console.log(`📊 Rétention: 7 jours | Intégrité: ${integrityOk ? 'OK' : 'Problèmes'}`)
      return true;

    } catch (error) {
      console.error('❌ Erreur durant la sauvegarde horaire:', error.message);
      return false;
    }
  }

  /**
   * Affiche le statut des sauvegardes avec détails étendus
   */
  showStatus() {
    console.log('\n📊 === STATUT DES SAUVEGARDES (7 JOURS) ===');
    
    // Sauvegardes locales
    try {
      const backups = this.backupSystem.getAllBackups();
      
      console.log(`📋 Sauvegardes locales complètes: ${backups.length}/168 max`);
      
      if (backups.length > 0) {
        const latest = backups[0];
        const oldest = backups[backups.length - 1];
        
        console.log(`   📅 Plus récente: ${latest.timestamp} (${latest.age})`);
        console.log(`   📅 Plus ancienne: ${oldest.timestamp} (${oldest.age})`);
        
        // Statistiques par jour
        const today = new Date().toDateString();
        const todayBackups = backups.filter(b => b.date.toDateString() === today);
        console.log(`   📈 Sauvegardes aujourd'hui: ${todayBackups.length}/24`);
        
        // Taille totale
        const totalSize = backups.reduce((sum, b) => sum + b.configSize + b.userDataSize, 0);
        console.log(`   💾 Espace utilisé: ${Math.round(totalSize / 1024)} MB`);
      }
      
    } catch (error) {
      console.log('❌ Impossible de lire les sauvegardes locales');
    }

    // Sauvegardes Freebox
    this.freeboxSync.listFreeboxBackups();
  }

  /**
   * Affiche les statistiques détaillées
   */
  showDetailedStats() {
    console.log('\n📈 === STATISTIQUES DÉTAILLÉES ===');
    
    try {
      const backups = this.backupSystem.getAllBackups();
      
      if (backups.length === 0) {
        console.log('❌ Aucune sauvegarde trouvée');
        return;
      }
      
      // Grouper par jour
      const byDay = {};
      backups.forEach(backup => {
        const day = backup.date.toISOString().split('T')[0];
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(backup);
      });
      
      console.log('\n📅 Sauvegardes par jour:');
      Object.keys(byDay).sort().reverse().forEach(day => {
        const dayBackups = byDay[day];
        const avgConfigSize = Math.round(dayBackups.reduce((sum, b) => sum + b.configSize, 0) / dayBackups.length);
        const avgUserDataSize = Math.round(dayBackups.reduce((sum, b) => sum + b.userDataSize, 0) / dayBackups.length);
        
        console.log(`   ${day}: ${dayBackups.length} sauvegardes (Config: ${avgConfigSize}KB, Données: ${avgUserDataSize}KB)`);
      });
      
      // Tendances de taille
      const recentBackups = backups.slice(0, 24); // Dernières 24h
      if (recentBackups.length > 1) {
        const firstSize = recentBackups[recentBackups.length - 1].configSize + recentBackups[recentBackups.length - 1].userDataSize;
        const lastSize = recentBackups[0].configSize + recentBackups[0].userDataSize;
        const trend = lastSize - firstSize;
        
        console.log(`\n📊 Tendance taille (24h): ${trend > 0 ? '+' : ''}${trend}KB`);
      }
      
    } catch (error) {
      console.error('❌ Erreur calcul statistiques:', error.message);
    }
  }
}

// Si exécuté directement
if (require.main === module) {
  const backup = new HourlyBackup();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--status')) {
    backup.showStatus();
  } else if (args.includes('--stats')) {
    backup.showDetailedStats();
  } else if (args.includes('--help')) {
    console.log(`
🔄 Système de Sauvegarde Horaire du Bot Discord - Version 7 jours

Usage:
  node hourly_backup_7days.js              # Exécuter une sauvegarde complète
  node hourly_backup_7days.js --status     # Afficher le statut des sauvegardes
  node hourly_backup_7days.js --stats      # Afficher les statistiques détaillées
  node hourly_backup_7days.js --help       # Afficher cette aide

Fonctionnalités:
  📋 Sauvegarde séparée de la configuration du bot
  👥 Sauvegarde séparée des données utilisateurs
  ☁️ Synchronisation automatique vers Freebox
  🧹 Nettoyage automatique (rétention 7 jours)
  🕐 Horodatage des fichiers de sauvegarde
  🔍 Vérification d'intégrité automatique

Rétention:
  🏠 Local: 168 sauvegardes (7 jours × 24 heures)
  ☁️ Freebox: 168 sauvegardes (7 jours × 24 heures)

Fichiers créés:
  bot-config_YYYY-MM-DD_HHhMM.json   # Configuration du bot
  user-data_YYYY-MM-DD_HHhMM.json    # Données utilisateurs

Scripts de restauration:
  node restore_with_selector.js       # Interface interactive avec pagination
  node restore_backup.js --list       # Ancien système (simple)
`);
  } else {
    // Exécution normale
    backup.runBackup().then(success => {
      process.exit(success ? 0 : 1);
    });
  }
}

module.exports = HourlyBackup;