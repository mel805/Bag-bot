const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Système de synchronisation avec la Freebox - Version 7 jours
 * Synchronise les sauvegardes vers un répertoire persistant sur la Freebox
 * Rétention: 7 jours (168 sauvegardes horaires)
 */

class FreeboxSync {
  constructor(localBackupDir = './data/backups', freeboxPath = '/var/data/bot-backups') {
    this.localBackupDir = localBackupDir;
    this.freeboxPath = freeboxPath;
    this.retentionHours = 168; // 7 jours * 24 heures
  }

  /**
   * Crée le répertoire de destination sur la Freebox si nécessaire
   */
  ensureFreeboxDirectory() {
    try {
      // Créer le répertoire de destination s'il n'existe pas
      execSync(`mkdir -p ${this.freeboxPath}`, { stdio: 'pipe' });
      
      // Créer les sous-dossiers pour organiser
      execSync(`mkdir -p ${this.freeboxPath}/config`, { stdio: 'pipe' });
      execSync(`mkdir -p ${this.freeboxPath}/userdata`, { stdio: 'pipe' });
      
      console.log(`✅ Répertoires Freebox créés: ${this.freeboxPath}`);
      return true;
    } catch (error) {
      console.error('❌ Erreur création répertoires Freebox:', error.message);
      return false;
    }
  }

  /**
   * Synchronise les sauvegardes vers la Freebox
   */
  syncToFreebox() {
    try {
      if (!this.ensureFreeboxDirectory()) {
        return false;
      }

      // Synchroniser les fichiers de configuration
      const configPattern = path.join(this.localBackupDir, 'bot-config_*.json');
      const userDataPattern = path.join(this.localBackupDir, 'user-data_*.json');

      // Copier les fichiers de configuration
      try {
        execSync(`cp ${configPattern} ${this.freeboxPath}/config/ 2>/dev/null || true`, { stdio: 'pipe' });
        console.log('📋 Configurations synchronisées vers Freebox');
      } catch (error) {
        console.log('⚠️ Aucun fichier de config à synchroniser');
      }

      // Copier les fichiers de données utilisateurs
      try {
        execSync(`cp ${userDataPattern} ${this.freeboxPath}/userdata/ 2>/dev/null || true`, { stdio: 'pipe' });
        console.log('👥 Données utilisateurs synchronisées vers Freebox');
      } catch (error) {
        console.log('⚠️ Aucun fichier de données utilisateur à synchroniser');
      }

      // Créer un fichier de métadonnées avec l'horodatage
      const metadataPath = path.join(this.freeboxPath, 'last_sync.txt');
      const timestamp = new Date().toISOString();
      const configCount = this.countFiles(`${this.freeboxPath}/config/bot-config_*.json`);
      const userDataCount = this.countFiles(`${this.freeboxPath}/userdata/user-data_*.json`);
      
      fs.writeFileSync(metadataPath, 
        `Dernière synchronisation: ${timestamp}\n` +
        `Source: ${process.cwd()}\n` +
        `Rétention: ${this.retentionHours} heures (7 jours)\n` +
        `Sauvegardes config: ${configCount}\n` +
        `Sauvegardes données: ${userDataCount}\n`
      );

      console.log(`✅ Synchronisation Freebox terminée: ${timestamp}`);
      console.log(`📊 Sauvegardes synchronisées: ${Math.min(configCount, userDataCount)} complètes`);
      return true;

    } catch (error) {
      console.error('❌ Erreur synchronisation Freebox:', error.message);
      return false;
    }
  }

  /**
   * Compte les fichiers correspondant à un pattern
   */
  countFiles(pattern) {
    try {
      const result = execSync(`ls ${pattern} 2>/dev/null | wc -l`, { encoding: 'utf8' });
      return parseInt(result.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Liste les sauvegardes disponibles sur la Freebox
   */
  listFreeboxBackups() {
    try {
      console.log('\n📋 === SAUVEGARDES CONFIG SUR FREEBOX ===');
      try {
        const configFiles = execSync(`ls -la ${this.freeboxPath}/config/bot-config_*.json 2>/dev/null | tail -20 || echo "Aucun fichier"`, { encoding: 'utf8' });
        console.log(configFiles);
      } catch (error) {
        console.log('Aucun fichier de configuration trouvé');
      }

      console.log('\n👥 === SAUVEGARDES DONNÉES USERS SUR FREEBOX ===');
      try {
        const userDataFiles = execSync(`ls -la ${this.freeboxPath}/userdata/user-data_*.json 2>/dev/null | tail -20 || echo "Aucun fichier"`, { encoding: 'utf8' });
        console.log(userDataFiles);
      } catch (error) {
        console.log('Aucun fichier de données utilisateur trouvé');
      }

      // Afficher les métadonnées de synchronisation
      const metadataPath = path.join(this.freeboxPath, 'last_sync.txt');
      if (fs.existsSync(metadataPath)) {
        console.log('\n📅 === INFORMATIONS DE SYNCHRONISATION ===');
        console.log(fs.readFileSync(metadataPath, 'utf8'));
      }

      // Statistiques générales
      const configCount = this.countFiles(`${this.freeboxPath}/config/bot-config_*.json`);
      const userDataCount = this.countFiles(`${this.freeboxPath}/userdata/user-data_*.json`);
      const completePairs = Math.min(configCount, userDataCount);
      
      console.log('\n📊 === STATISTIQUES ===');
      console.log(`📋 Fichiers config: ${configCount}`);
      console.log(`👥 Fichiers données: ${userDataCount}`);
      console.log(`✅ Sauvegardes complètes: ${completePairs}`);
      console.log(`📦 Rétention configurée: ${this.retentionHours}h (7 jours)`);

    } catch (error) {
      console.error('❌ Erreur listage sauvegardes Freebox:', error.message);
    }
  }

  /**
   * Nettoie les anciennes sauvegardes sur la Freebox (garde 7 jours = 168 fichiers)
   */
  cleanFreeboxBackups() {
    try {
      console.log(`🧹 Nettoyage Freebox (rétention: ${this.retentionHours}h)...`);
      
      // Nettoyer les configs
      try {
        const configFiles = execSync(`ls ${this.freeboxPath}/config/bot-config_*.json 2>/dev/null | sort`, { encoding: 'utf8' }).trim().split('\n').filter(f => f);
        console.log(`📋 Configs trouvés: ${configFiles.length}`);
        
        if (configFiles.length > this.retentionHours) {
          const toDelete = configFiles.slice(0, configFiles.length - this.retentionHours);
          let deletedCount = 0;
          
          toDelete.forEach(file => {
            try {
              execSync(`rm "${file}"`, { stdio: 'pipe' });
              deletedCount++;
            } catch (error) {
              console.log(`⚠️ Impossible de supprimer: ${path.basename(file)}`);
            }
          });
          
          console.log(`🗑️ Configs supprimés: ${deletedCount}/${toDelete.length}`);
        }
      } catch (error) {
        console.log('📋 Aucun config à nettoyer');
      }

      // Nettoyer les données utilisateurs
      try {
        const userDataFiles = execSync(`ls ${this.freeboxPath}/userdata/user-data_*.json 2>/dev/null | sort`, { encoding: 'utf8' }).trim().split('\n').filter(f => f);
        console.log(`👥 Données trouvées: ${userDataFiles.length}`);
        
        if (userDataFiles.length > this.retentionHours) {
          const toDelete = userDataFiles.slice(0, userDataFiles.length - this.retentionHours);
          let deletedCount = 0;
          
          toDelete.forEach(file => {
            try {
              execSync(`rm "${file}"`, { stdio: 'pipe' });
              deletedCount++;
            } catch (error) {
              console.log(`⚠️ Impossible de supprimer: ${path.basename(file)}`);
            }
          });
          
          console.log(`🗑️ Données supprimées: ${deletedCount}/${toDelete.length}`);
        }
      } catch (error) {
        console.log('👥 Aucune donnée à nettoyer');
      }

      console.log('✅ Nettoyage Freebox terminé');

    } catch (error) {
      console.error('❌ Erreur nettoyage Freebox:', error.message);
    }
  }

  /**
   * Vérifie l'intégrité des sauvegardes
   */
  checkIntegrity() {
    try {
      console.log('\n🔍 === VÉRIFICATION D\'INTÉGRITÉ ===');
      
      const configFiles = execSync(`ls ${this.freeboxPath}/config/bot-config_*.json 2>/dev/null | sort`, { encoding: 'utf8' }).trim().split('\n').filter(f => f);
      const userDataFiles = execSync(`ls ${this.freeboxPath}/userdata/user-data_*.json 2>/dev/null | sort`, { encoding: 'utf8' }).trim().split('\n').filter(f => f);
      
      let integrityIssues = 0;
      let validPairs = 0;
      
      configFiles.forEach(configFile => {
        const fileName = path.basename(configFile);
        const timestamp = fileName.match(/(\d{4}-\d{2}-\d{2}_\d{2}h\d{2})/)?.[1];
        
        if (timestamp) {
          const expectedUserDataFile = `${this.freeboxPath}/userdata/user-data_${timestamp}.json`;
          
          if (fs.existsSync(expectedUserDataFile)) {
            try {
              // Vérifier que les fichiers sont des JSON valides
              JSON.parse(fs.readFileSync(configFile, 'utf8'));
              JSON.parse(fs.readFileSync(expectedUserDataFile, 'utf8'));
              validPairs++;
            } catch (error) {
              console.log(`❌ Fichiers corrompus: ${timestamp}`);
              integrityIssues++;
            }
          } else {
            console.log(`⚠️ Données manquantes pour: ${timestamp}`);
            integrityIssues++;
          }
        }
      });
      
      console.log(`✅ Sauvegardes valides: ${validPairs}`);
      console.log(`⚠️ Problèmes d'intégrité: ${integrityIssues}`);
      
      return integrityIssues === 0;
      
    } catch (error) {
      console.error('❌ Erreur vérification intégrité:', error.message);
      return false;
    }
  }
}

// Export pour utilisation en tant que module
module.exports = FreeboxSync;

// Si exécuté directement
if (require.main === module) {
  const sync = new FreeboxSync();
  
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    sync.listFreeboxBackups();
  } else if (args.includes('--clean')) {
    sync.cleanFreeboxBackups();
  } else if (args.includes('--check')) {
    sync.checkIntegrity();
  } else {
    // Synchronisation normale
    sync.syncToFreebox();
  }
}