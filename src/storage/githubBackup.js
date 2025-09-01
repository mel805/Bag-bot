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
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'BAG-Discord-Bot/1.0',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    
    // Ajouter Content-Type seulement pour les requêtes avec body
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      console.log(`[GitHub] ${method} ${url}`);
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GitHub] API Error ${response.status}:`, errorText);
        
        // Messages d'erreur plus spécifiques
        if (response.status === 401) {
          throw new Error(`Authentification échouée. Vérifiez votre GITHUB_TOKEN.`);
        } else if (response.status === 403) {
          throw new Error(`Permissions insuffisantes. Le token doit avoir les permissions 'repo' et 'contents:write'.`);
        } else if (response.status === 404) {
          throw new Error(`Dépôt '${this.repo}' introuvable ou branche '${this.branch}' inexistante.`);
        } else {
          throw new Error(`GitHub API Error ${response.status}: ${errorText}`);
        }
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      if (error.message.startsWith('GitHub API Error') || error.message.includes('Authentification') || error.message.includes('Permissions')) {
        throw error; // Re-lancer les erreurs GitHub spécifiques
      }
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
        console.log(`[GitHub] Tentative de création de branche ${this.branch} depuis main`);
        const mainBranch = await this.githubRequest('branches/main');
        await this.githubRequest('git/refs', 'POST', {
          ref: `refs/heads/${this.branch}`,
          sha: mainBranch.commit.sha
        });
        console.log(`[GitHub] Branche ${this.branch} créée depuis main`);
      } catch (error) {
        try {
          // Essayer avec master si main n'existe pas
          console.log(`[GitHub] Tentative de création de branche ${this.branch} depuis master`);
          const masterBranch = await this.githubRequest('branches/master');
          await this.githubRequest('git/refs', 'POST', {
            ref: `refs/heads/${this.branch}`,
            sha: masterBranch.commit.sha
          });
          console.log(`[GitHub] Branche ${this.branch} créée depuis master`);
        } catch (masterError) {
          // Si ni main ni master n'existent, le dépôt est probablement vide
          console.log(`[GitHub] Dépôt vide détecté, création d'un commit initial`);
          
          // Créer un commit initial avec un fichier README
          const initialContent = Buffer.from('# Sauvegarde Bot BAG\n\nCe dépôt contient les sauvegardes automatiques du bot Discord BAG.', 'utf8').toString('base64');
          
          await this.githubRequest('contents/README.md', 'PUT', {
            message: '🚀 Initialisation du dépôt de sauvegarde',
            content: initialContent,
            branch: this.branch
          });
          
          console.log(`[GitHub] Dépôt initialisé avec branche ${this.branch}`);
        }
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

    if (!configData || typeof configData !== 'object') {
      throw new Error('Données de configuration invalides');
    }

    try {
      // S'assurer que la branche existe
      await this.ensureBackupBranch();

      // Préparer les données de sauvegarde avec métadonnées
      const backupData = {
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          bot_version: require('../../package.json').version || '1.0.0',
          backup_type: 'complete',
          data_size: JSON.stringify(configData).length
        },
        data: configData
      };

      const jsonContent = JSON.stringify(backupData, null, 2);
      
      // Vérifier la taille (GitHub limite à 100MB, mais on limite à 50MB pour être sûr)
      if (jsonContent.length > 50 * 1024 * 1024) {
        throw new Error(`Données trop volumineuses (${Math.round(jsonContent.length / 1024 / 1024)}MB). Limite: 50MB`);
      }

      // Encoder en base64 pour GitHub
      const content = Buffer.from(jsonContent, 'utf8').toString('base64');
      
      console.log(`[GitHub] Sauvegarde de ${Math.round(jsonContent.length / 1024)}KB de données`);

      // Obtenir le SHA du fichier existant (pour la mise à jour)
      const existingFileSHA = await this.getBackupFileSHA();

      // Créer le commit
      const commitData = {
        message: `🔄 Sauvegarde automatique - ${new Date().toLocaleString('fr-FR')}\n\n📊 Taille: ${Math.round(jsonContent.length / 1024)}KB\n🏰 Serveurs: ${Object.keys(configData.guilds || {}).length}`,
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
      // Utiliser l'endpoint sans slash final pour éviter l'erreur 404
      const url = `https://api.github.com/repos/${this.repo}`;
      const headers = {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'BAG-Discord-Bot/1.0',
        'X-GitHub-Api-Version': '2022-11-28'
      };

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API Error ${response.status}: ${errorText}`);
      }

      const repo = await response.json();
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