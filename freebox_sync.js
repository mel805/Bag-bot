const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Système de synchronisation avec la Freebox
 * Synchronise les sauvegardes vers un répertoire persistant sur la Freebox
 */

class FreeboxSync {
  constructor(localBackupDir = './data/backups', freeboxPath = '/var/data/bot-backups') {
    this.localBackupDir = localBackupDir;
    this.freeboxPath = freeboxPath;
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
      fs.writeFileSync(metadataPath, `Dernière synchronisation: ${timestamp}\nSource: ${process.cwd()}\n`);

      console.log(`✅ Synchronisation Freebox terminée: ${timestamp}`);
      return true;

    } catch (error) {
      console.error('❌ Erreur synchronisation Freebox:', error.message);
      return false;
    }
  }

  /**
   * Liste les sauvegardes disponibles sur la Freebox
   */
  listFreeboxBackups() {
    try {
      console.log('\n📋 === SAUVEGARDES CONFIG SUR FREEBOX ===');
      try {
        const configFiles = execSync(`ls -la ${this.freeboxPath}/config/bot-config_*.json 2>/dev/null || echo "Aucun fichier"`, { encoding: 'utf8' });
        console.log(configFiles);
      } catch (error) {
        console.log('Aucun fichier de configuration trouvé');
      }

      console.log('\n👥 === SAUVEGARDES DONNÉES USERS SUR FREEBOX ===');
      try {
        const userDataFiles = execSync(`ls -la ${this.freeboxPath}/userdata/user-data_*.json 2>/dev/null || echo "Aucun fichier"`, { encoding: 'utf8' });
        console.log(userDataFiles);
      } catch (error) {
        console.log('Aucun fichier de données utilisateur trouvé');
      }

      // Afficher les métadonnées de synchronisation
      const metadataPath = path.join(this.freeboxPath, 'last_sync.txt');
      if (fs.existsSync(metadataPath)) {
        console.log('\n📅 === DERNIÈRE SYNCHRONISATION ===');
        console.log(fs.readFileSync(metadataPath, 'utf8'));
      }

    } catch (error) {
      console.error('❌ Erreur listage sauvegardes Freebox:', error.message);
    }
  }

  /**
   * Nettoie les anciennes sauvegardes sur la Freebox (garde 7 jours = 168 fichiers)
   */
  cleanFreeboxBackups() {
    try {
      const keepCount = 168; // 7 jours * 24 heures

      // Nettoyer les configs
      try {
        const configFiles = execSync(`ls ${this.freeboxPath}/config/bot-config_*.json 2>/dev/null | sort`, { encoding: 'utf8' }).trim().split('\n').filter(f => f);
        if (configFiles.length > keepCount) {
          const toDelete = configFiles.slice(0, configFiles.length - keepCount);
          toDelete.forEach(file => {
            execSync(`rm "${file}"`, { stdio: 'pipe' });
            console.log(`🗑️ Freebox: Supprimé ${path.basename(file)}`);
          });
        }
      } catch (error) {
        // Pas de fichiers à nettoyer
      }

      // Nettoyer les données utilisateurs
      try {
        const userDataFiles = execSync(`ls ${this.freeboxPath}/userdata/user-data_*.json 2>/dev/null | sort`, { encoding: 'utf8' }).trim().split('\n').filter(f => f);
        if (userDataFiles.length > keepCount) {
          const toDelete = userDataFiles.slice(0, userDataFiles.length - keepCount);
          toDelete.forEach(file => {
            execSync(`rm "${file}"`, { stdio: 'pipe' });
            console.log(`🗑️ Freebox: Supprimé ${path.basename(file)}`);
          });
        }
      } catch (error) {
        // Pas de fichiers à nettoyer
      }

      console.log('✅ Nettoyage Freebox terminé');

    } catch (error) {
      console.error('❌ Erreur nettoyage Freebox:', error.message);
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
  } else {
    // Synchronisation normale
    sync.syncToFreebox();
  }
}