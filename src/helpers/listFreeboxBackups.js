const { listFreeboxBackups: listBackups } = require('../storage/jsonStore');

/**
 * Liste les sauvegardes Freebox disponibles et les formate pour Discord select menu
 * @returns {Array} Array d'options formatées pour StringSelectMenuBuilder
 */
async function listFreeboxBackups() {
  try {
    const backups = await listBackups();
    
    if (!backups || backups.length === 0) {
      return [];
    }
    
    // Formate les sauvegardes pour le menu de sélection Discord
    return backups.map((backup, index) => ({
      label: backup.displayName.length > 100 ? backup.displayName.substring(0, 97) + '...' : backup.displayName,
      description: `Fichier de sauvegarde ${index + 1}`,
      value: backup.filename || `backup_${index}`
    }));
  } catch (error) {
    console.error('[Helper] Erreur lors de la récupération des sauvegardes Freebox:', error.message);
    return [];
  }
}

module.exports = listFreeboxBackups;