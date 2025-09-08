const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * Module de gestion des sauvegardes Freebox pour le bot BAG
 * Permet de lister et restaurer des fichiers de sauvegarde depuis le système de fichiers
 */

class FreeboxBackup {
  constructor() {
    // Chemins possibles pour les sauvegardes sur Freebox
    this.backupPaths = [
      '/var/data/backups',
      '/media/Freebox/Disque dur/BAG-Backups',
      '/media/Disque dur/BAG-Backups', 
      '/mnt/freebox/BAG-Backups',
      '/home/freebox/BAG-Backups',
      '/workspace/data/backups',
      process.env.FREEBOX_BACKUP_PATH || '/var/data/backups'
    ];
    
    this.validBackupPath = null;
  }

  /**
   * Trouve et valide le chemin de sauvegarde disponible
   */
  async findBackupPath() {
    if (this.validBackupPath) {
      return this.validBackupPath;
    }

    for (const backupPath of this.backupPaths) {
      try {
        await fsp.access(backupPath, fs.constants.R_OK);
        console.log(`[FreeboxBackup] Chemin de sauvegarde trouvé: ${backupPath}`);
        this.validBackupPath = backupPath;
        return backupPath;
      } catch (error) {
        // Continuer avec le chemin suivant
        continue;
      }
    }

    throw new Error('Aucun chemin de sauvegarde Freebox accessible trouvé');
  }

  /**
   * Liste tous les fichiers de sauvegarde disponibles
   */
  async listBackupFiles() {
    try {
      const backupPath = await this.findBackupPath();
      const files = await fsp.readdir(backupPath);
      
      // Filtrer uniquement les fichiers JSON de sauvegarde
      const backupFiles = files
        .filter(file => file.endsWith('.json') && (
          file.startsWith('backup-') || 
          file.startsWith('config-') ||
          file.includes('bot-data')
        ))
        .map(async (file) => {
          const filePath = path.join(backupPath, file);
          const stats = await fsp.stat(filePath);
          
          // Essayer de lire les métadonnées du fichier
          let metadata = null;
          try {
            const content = await fsp.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            
            // Vérifier si c'est une sauvegarde avec métadonnées
            if (data.metadata) {
              metadata = data.metadata;
            } else if (data.guilds) {
              // Sauvegarde directe sans métadonnées
              metadata = {
                timestamp: stats.mtime.toISOString(),
                backup_type: 'direct',
                data_size: content.length,
                guilds_count: Object.keys(data.guilds || {}).length
              };
            }
          } catch (error) {
            // Fichier corrompu ou format non reconnu
            console.warn(`[FreeboxBackup] Impossible de lire les métadonnées de ${file}:`, error.message);
          }

          return {
            filename: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            created: stats.birthtime.toISOString(),
            metadata: metadata,
            displayName: this.generateDisplayName(file, metadata, stats)
          };
        });

      // Résoudre toutes les promesses et trier par date de modification (plus récent en premier)
      const resolvedFiles = await Promise.all(backupFiles);
      return resolvedFiles
        .filter(file => file.metadata !== null) // Garder seulement les fichiers valides
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    } catch (error) {
      console.error('[FreeboxBackup] Erreur lors de la liste des fichiers:', error.message);
      return [];
    }
  }

  /**
   * Génère un nom d'affichage pour un fichier de sauvegarde
   */
  generateDisplayName(filename, metadata, stats) {
    if (metadata && metadata.timestamp) {
      const date = new Date(metadata.timestamp);
      const dateStr = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      let displayName = `📅 ${dateStr}`;
      
      if (metadata.guilds_count) {
        displayName += ` (${metadata.guilds_count} serveur${metadata.guilds_count > 1 ? 's' : ''})`;
      }
      
      if (metadata.backup_type) {
        const typeEmoji = metadata.backup_type === 'github' ? '🐙' : 
                         metadata.backup_type === 'complete' ? '💾' : '📄';
        displayName += ` ${typeEmoji}`;
      }
      
      return displayName;
    } else {
      // Fallback sur les stats du fichier
      const date = new Date(stats.mtime);
      const dateStr = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return `📄 ${dateStr} - ${filename}`;
    }
  }

  /**
   * Restaure les données depuis un fichier spécifique
   */
  async restoreFromFile(filename) {
    try {
      const backupPath = await this.findBackupPath();
      const filePath = path.join(backupPath, filename);
      
      // Vérifier que le fichier existe
      await fsp.access(filePath, fs.constants.R_OK);
      
      // Lire et parser le contenu
      const content = await fsp.readFile(filePath, 'utf8');
      const backupData = JSON.parse(content);
      
      let configData = null;
      let metadata = null;
      
      // Détecter le format de sauvegarde
      if (backupData.data && backupData.metadata) {
        // Format avec métadonnées (GitHub style)
        configData = backupData.data;
        metadata = backupData.metadata;
      } else if (backupData.guilds) {
        // Format direct (sauvegarde locale)
        configData = backupData;
        metadata = {
          timestamp: new Date().toISOString(),
          backup_type: 'local_file',
          source_file: filename
        };
      } else {
        throw new Error('Format de sauvegarde non reconnu');
      }
      
      // Validation basique des données
      if (!configData || typeof configData !== 'object') {
        throw new Error('Données de configuration invalides');
      }
      
      if (!configData.guilds || typeof configData.guilds !== 'object') {
        throw new Error('Structure de données invalide: guilds manquant');
      }
      
      console.log(`[FreeboxBackup] Restauration depuis: ${filename} (${Object.keys(configData.guilds).length} serveurs)`);
      
      return {
        success: true,
        data: configData,
        metadata: metadata,
        source: 'freebox_file',
        filename: filename
      };
      
    } catch (error) {
      console.error(`[FreeboxBackup] Erreur restauration depuis ${filename}:`, error.message);
      throw new Error(`Échec restauration depuis ${filename}: ${error.message}`);
    }
  }

  /**
   * Crée une sauvegarde JSON sur le disque Freebox (BAG-Backups)
   * @param {object} configData Données complètes du bot ({ guilds: { ... } })
   * @returns {Promise<{ success: boolean, path?: string, filename?: string, metadata?: object }>}
   */
  async saveBackupFile(configData) {
    try {
      if (!configData || typeof configData !== 'object') {
        throw new Error('Données invalides (objet requis)');
      }

      const backupPath = await this.findBackupPath();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `bot-data-${timestamp}.json`;
      const dest = path.join(backupPath, filename);

      const metadata = {
        timestamp: new Date().toISOString(),
        backup_type: 'complete',
        source: 'freebox',
        data_size: JSON.stringify(configData).length,
        guilds_count: Object.keys(configData.guilds || {}).length,
      };

      const payload = {
        metadata,
        data: configData,
      };

      await fsp.writeFile(dest, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[FreeboxBackup] Sauvegarde écrite: ${dest}`);

      return { success: true, path: dest, filename, metadata };
    } catch (error) {
      console.error('[FreeboxBackup] Échec écriture sauvegarde:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie la disponibilité des sauvegardes Freebox
   */
  async isAvailable() {
    try {
      await this.findBackupPath();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtient des informations sur le système de sauvegarde
   */
  async getInfo() {
    try {
      const backupPath = await this.findBackupPath();
      const files = await this.listBackupFiles();
      
      return {
        available: true,
        path: backupPath,
        files_count: files.length,
        latest_backup: files.length > 0 ? files[0] : null
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }
}

module.exports = FreeboxBackup;