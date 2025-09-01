const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * Module de sauvegarde GitHub pour le bot BAG
 * Permet de sauvegarder et restaurer toutes les données du bot sur GitHub
 */

class GitHubBackup {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.repo = process.env.GITHUB_REPO; // format: "owner/repo"
    this.branch = process.env.GITHUB_BACKUP_BRANCH || 'backup-data';
    this.backupPath = 'backup/bot-data.json';
  }

  /**
   * Vérifie si GitHub est configuré
   */
  isConfigured() {
    return !!(this.token && this.repo);
  }

  /**
   * Effectue une requête à l'API GitHub
   */
  async githubRequest(endpoint, method = 'GET', body = null) {
    if (!this.isConfigured()) {
      throw new Error('GitHub non configuré. Variables GITHUB_TOKEN et GITHUB_REPO requises.');
    }

    const url = `https://api.github.com/repos/${this.repo}/${endpoint}`;
    const headers = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'BAG-Discord-Bot',
      'Content-Type': 'application/json'
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API Error ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      throw new Error(`Erreur requête GitHub: ${error.message}`);
    }
  }

  /**
   * Obtient le SHA du dernier commit sur la branche de backup
   */
  async getBranchSHA() {
    try {
      const branch = await this.githubRequest(`branches/${this.branch}`);
      return branch.commit.sha;
    } catch (error) {
      if (error.message.includes('404')) {
        // La branche n'existe pas encore, on va la créer
        return null;
      }
      throw error;
    }
  }

  /**
   * Obtient le SHA du fichier de backup existant
   */
  async getBackupFileSHA() {
    try {
      const file = await this.githubRequest(`contents/${this.backupPath}?ref=${this.branch}`);
      return file.sha;
    } catch (error) {
      if (error.message.includes('404')) {
        return null; // Le fichier n'existe pas encore
      }
      throw error;
    }
  }

  /**
   * Crée ou met à jour la branche de backup
   */
  async ensureBackupBranch() {
    const branchSHA = await this.getBranchSHA();
    
    if (!branchSHA) {
      // Créer la branche depuis main/master
      try {
        const mainBranch = await this.githubRequest('branches/main');
        await this.githubRequest('git/refs', 'POST', {
          ref: `refs/heads/${this.branch}`,
          sha: mainBranch.commit.sha
        });
        console.log(`[GitHub] Branche ${this.branch} créée`);
      } catch (error) {
        // Essayer avec master si main n'existe pas
        const masterBranch = await this.githubRequest('branches/master');
        await this.githubRequest('git/refs', 'POST', {
          ref: `refs/heads/${this.branch}`,
          sha: masterBranch.commit.sha
        });
        console.log(`[GitHub] Branche ${this.branch} créée depuis master`);
      }
    }
  }

  /**
   * Sauvegarde les données complètes du bot sur GitHub
   */
  async backup(configData) {
    if (!this.isConfigured()) {
      throw new Error('GitHub non configuré pour la sauvegarde');
    }

    try {
      // S'assurer que la branche existe
      await this.ensureBackupBranch();

      // Préparer les données de sauvegarde avec métadonnées
      const backupData = {
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          bot_version: require('../../package.json').version,
          backup_type: 'complete'
        },
        data: configData
      };

      // Encoder en base64 pour GitHub
      const content = Buffer.from(JSON.stringify(backupData, null, 2), 'utf8').toString('base64');

      // Obtenir le SHA du fichier existant (pour la mise à jour)
      const existingFileSHA = await this.getBackupFileSHA();

      // Créer le commit
      const commitData = {
        message: `🔄 Sauvegarde automatique - ${new Date().toLocaleString('fr-FR')}`,
        content: content,
        branch: this.branch
      };

      if (existingFileSHA) {
        commitData.sha = existingFileSHA;
      }

      const result = await this.githubRequest(`contents/${this.backupPath}`, 'PUT', commitData);
      
      console.log(`[GitHub] Sauvegarde réussie: ${result.commit.sha}`);
      
      return {
        success: true,
        commit_sha: result.commit.sha,
        commit_url: result.commit.html_url,
        file_url: result.content.html_url,
        timestamp: backupData.metadata.timestamp
      };

    } catch (error) {
      console.error('[GitHub] Erreur sauvegarde:', error.message);
      throw new Error(`Échec sauvegarde GitHub: ${error.message}`);
    }
  }

  /**
   * Restaure les données depuis GitHub
   */
  async restore() {
    if (!this.isConfigured()) {
      throw new Error('GitHub non configuré pour la restauration');
    }

    try {
      // Obtenir le fichier de backup depuis GitHub
      const file = await this.githubRequest(`contents/${this.backupPath}?ref=${this.branch}`);
      
      if (!file.content) {
        throw new Error('Aucune donnée de sauvegarde trouvée');
      }

      // Décoder le contenu base64
      const content = Buffer.from(file.content, 'base64').toString('utf8');
      const backupData = JSON.parse(content);

      // Vérifier la structure des données
      if (!backupData.data || !backupData.metadata) {
        throw new Error('Structure de sauvegarde invalide');
      }

      console.log(`[GitHub] Restauration depuis: ${backupData.metadata.timestamp}`);
      
      return {
        success: true,
        data: backupData.data,
        metadata: backupData.metadata,
        restored_from: file.sha
      };

    } catch (error) {
      console.error('[GitHub] Erreur restauration:', error.message);
      throw new Error(`Échec restauration GitHub: ${error.message}`);
    }
  }

  /**
   * Liste les sauvegardes disponibles (commits sur la branche backup)
   */
  async listBackups(limit = 10) {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const commits = await this.githubRequest(`commits?sha=${this.branch}&per_page=${limit}`);
      
      return commits.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        date: commit.commit.author.date,
        url: commit.html_url
      }));

    } catch (error) {
      console.error('[GitHub] Erreur liste sauvegardes:', error.message);
      return [];
    }
  }

  /**
   * Vérifie la connectivité GitHub
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, error: 'GitHub non configuré' };
    }

    try {
      const repo = await this.githubRequest('');
      return { 
        success: true, 
        repo: repo.full_name,
        permissions: {
          push: repo.permissions?.push || false,
          admin: repo.permissions?.admin || false
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = GitHubBackup;