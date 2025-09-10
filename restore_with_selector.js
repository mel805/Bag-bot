#!/usr/bin/env node

const DualBackupSystem = require('./dual_backup_system_7days');
const FreeboxSync = require('./freebox_sync');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Script de restauration avec sélecteur paginé
 */

class RestoreWithSelector {
  constructor() {
    this.backupSystem = new DualBackupSystem('./data/config.json', './data/backups');
    this.freeboxSync = new FreeboxSync('./data/backups', '/var/data/bot-backups');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.pageSize = 10; // Nombre de sauvegardes par page
  }

  /**
   * Récupère toutes les sauvegardes (locales + Freebox)
   */
  getAllAvailableBackups() {
    const allBackups = [];
    
    // Sauvegardes locales
    const localBackups = this.backupSystem.getAllBackups();
    localBackups.forEach(backup => {
      backup.location = 'local';
      backup.locationIcon = '🏠';
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
                    locationIcon: '☁️',
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
   * Affiche une page de sauvegardes
   */
  displayPage(backups, page) {
    const startIndex = page * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, backups.length);
    const pageBackups = backups.slice(startIndex, endIndex);
    
    console.clear();
    console.log('🔄 === SÉLECTEUR DE SAUVEGARDE ===\n');
    
    if (backups.length === 0) {
      console.log('❌ Aucune sauvegarde trouvée');
      return;
    }
    
    console.log(`📄 Page ${page + 1}/${Math.ceil(backups.length / this.pageSize)} (${backups.length} sauvegardes total)\n`);
    
    pageBackups.forEach((backup, index) => {
      const globalIndex = startIndex + index + 1;
      const dateStr = backup.date.toLocaleString('fr-FR');
      
      console.log(`${globalIndex.toString().padStart(3)}. ${backup.locationIcon} ${backup.timestamp}`);
      console.log(`     📅 ${dateStr} (il y a ${backup.age})`);
      console.log(`     📋 Config: ${backup.configSize} KB | 👥 Données: ${backup.userDataSize} KB`);
      console.log('');
    });
    
    console.log('📋 === COMMANDES ===');
    console.log('  [numéro]  - Sélectionner une sauvegarde');
    console.log('  n         - Page suivante');
    console.log('  p         - Page précédente');
    console.log('  r         - Rafraîchir');
    console.log('  q         - Quitter');
    console.log('');
  }

  /**
   * Demande une saisie utilisateur
   */
  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Interface interactive de sélection
   */
  async runInteractiveSelector() {
    let currentPage = 0;
    
    while (true) {
      const backups = this.getAllAvailableBackups();
      const maxPage = Math.ceil(backups.length / this.pageSize) - 1;
      
      this.displayPage(backups, currentPage);
      
      const input = await this.prompt('Votre choix: ');
      
      if (input === 'q') {
        console.log('👋 Au revoir !');
        break;
      } else if (input === 'n') {
        if (currentPage < maxPage) {
          currentPage++;
        } else {
          console.log('⚠️ Déjà sur la dernière page');
          await this.prompt('Appuyez sur Entrée pour continuer...');
        }
      } else if (input === 'p') {
        if (currentPage > 0) {
          currentPage--;
        } else {
          console.log('⚠️ Déjà sur la première page');
          await this.prompt('Appuyez sur Entrée pour continuer...');
        }
      } else if (input === 'r') {
        // Rafraîchir (ne fait rien, la boucle va recharger)
        continue;
      } else if (/^\d+$/.test(input)) {
        const selectedIndex = parseInt(input) - 1;
        
        if (selectedIndex >= 0 && selectedIndex < backups.length) {
          const selectedBackup = backups[selectedIndex];
          
          console.log(`\n🎯 Sauvegarde sélectionnée: ${selectedBackup.timestamp}`);
          console.log(`📍 Emplacement: ${selectedBackup.location === 'local' ? 'Local' : 'Freebox'}`);
          console.log(`📅 Date: ${selectedBackup.date.toLocaleString('fr-FR')}`);
          
          const confirm = await this.prompt('\n⚠️ Confirmer la restauration ? (oui/non): ');
          
          if (confirm.toLowerCase() === 'oui' || confirm.toLowerCase() === 'o') {
            console.log('\n🔄 Restauration en cours...');
            
            let success = false;
            
            if (selectedBackup.location === 'local') {
              const configPath = path.join('./data/backups', selectedBackup.configFile);
              const userDataPath = path.join('./data/backups', selectedBackup.userDataFile);
              success = this.backupSystem.restoreFromBackup(configPath, userDataPath);
            } else {
              success = this.backupSystem.restoreFromBackup(selectedBackup.configPath, selectedBackup.userDataPath);
            }
            
            if (success) {
              console.log('\n✅ Restauration réussie !');
              console.log('🔄 N\'oubliez pas de redémarrer le bot: pm2 restart bagbot');
            } else {
              console.log('\n❌ Échec de la restauration');
            }
            
            await this.prompt('\nAppuyez sur Entrée pour continuer...');
          }
        } else {
          console.log('❌ Numéro invalide');
          await this.prompt('Appuyez sur Entrée pour continuer...');
        }
      } else {
        console.log('❌ Commande inconnue');
        await this.prompt('Appuyez sur Entrée pour continuer...');
      }
    }
    
    this.rl.close();
  }

  /**
   * Mode non-interactif pour les scripts
   */
  async listBackups() {
    const backups = this.getAllAvailableBackups();
    
    console.log('\n📋 === TOUTES LES SAUVEGARDES DISPONIBLES ===\n');
    
    if (backups.length === 0) {
      console.log('❌ Aucune sauvegarde trouvée');
      return;
    }
    
    backups.forEach((backup, index) => {
      const dateStr = backup.date.toLocaleString('fr-FR');
      
      console.log(`${(index + 1).toString().padStart(3)}. ${backup.locationIcon} ${backup.timestamp}`);
      console.log(`     📅 ${dateStr} (il y a ${backup.age})`);
      console.log(`     📋 Config: ${backup.configSize} KB | 👥 Données: ${backup.userDataSize} KB`);
      console.log('');
    });
    
    console.log(`📊 Total: ${backups.length} sauvegardes disponibles`);
  }

  /**
   * Restaure par timestamp (mode non-interactif)
   */
  async restoreByTimestamp(timestamp) {
    const backups = this.getAllAvailableBackups();
    const backup = backups.find(b => b.timestamp === timestamp);
    
    if (!backup) {
      console.error(`❌ Sauvegarde introuvable: ${timestamp}`);
      return false;
    }
    
    console.log(`🔄 Restauration de ${backup.timestamp} depuis ${backup.location}...`);
    
    let success = false;
    
    if (backup.location === 'local') {
      const configPath = path.join('./data/backups', backup.configFile);
      const userDataPath = path.join('./data/backups', backup.userDataFile);
      success = this.backupSystem.restoreFromBackup(configPath, userDataPath);
    } else {
      success = this.backupSystem.restoreFromBackup(backup.configPath, backup.userDataPath);
    }
    
    if (success) {
      console.log('✅ Restauration réussie !');
      console.log('🔄 N\'oubliez pas de redémarrer le bot: pm2 restart bagbot');
    }
    
    return success;
  }
}

// Si exécuté directement
if (require.main === module) {
  const restore = new RestoreWithSelector();
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || (args.length === 0 && process.stdin.isTTY)) {
    console.log(`
🔄 Restauration Interactive avec Sélecteur Paginé

Usage:
  node restore_with_selector.js                    # Mode interactif avec sélecteur
  node restore_with_selector.js --list             # Lister toutes les sauvegardes
  node restore_with_selector.js --timestamp YYYY-MM-DD_HHhMM  # Restaurer directement
  node restore_with_selector.js --help             # Afficher cette aide

Mode interactif:
  - Navigation avec n/p (suivant/précédent)
  - Sélection par numéro
  - Confirmation avant restauration
  - Support local + Freebox

Exemples:
  node restore_with_selector.js                    # Interface interactive
  node restore_with_selector.js --timestamp 2025-09-10_17h16
`);
  } else if (args.includes('--list')) {
    restore.listBackups().then(() => process.exit(0));
  } else if (args.includes('--timestamp')) {
    const timestampIndex = args.indexOf('--timestamp') + 1;
    if (timestampIndex < args.length) {
      const timestamp = args[timestampIndex];
      restore.restoreByTimestamp(timestamp).then(success => {
        process.exit(success ? 0 : 1);
      });
    } else {
      console.error('❌ Timestamp manquant après --timestamp');
      process.exit(1);
    }
  } else {
    // Mode interactif par défaut
    restore.runInteractiveSelector().then(() => process.exit(0));
  }
}

module.exports = RestoreWithSelector;