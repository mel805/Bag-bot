#!/usr/bin/env node

/**
 * 🔧 Script de Correction GitHub - BAG Discord Bot
 * Ce script teste et corrige la configuration GitHub pour les sauvegardes
 */

const fs = require('fs');
const path = require('path');

// Couleurs pour l'affichage
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'blue') {
    const timestamp = new Date().toLocaleString('fr-FR');
    console.log(`${colors[color]}[${timestamp}]${colors.reset} ${message}`);
}

function success(message) {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function error(message) {
    console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function warning(message) {
    console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function info(message) {
    console.log(`${colors.magenta}ℹ️  ${message}${colors.reset}`);
}

// Configuration
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

function checkEnvFile() {
    log('Vérification du fichier .env...');
    
    if (!fs.existsSync(envPath)) {
        warning('Fichier .env non trouvé');
        
        if (fs.existsSync(envExamplePath)) {
            log('Copie du fichier .env.example vers .env...');
            fs.copyFileSync(envExamplePath, envPath);
            success('Fichier .env créé depuis .env.example');
        } else {
            error('Ni .env ni .env.example trouvés');
            return false;
        }
    } else {
        success('Fichier .env trouvé');
    }
    
    return true;
}

function readEnvFile() {
    log('Lecture de la configuration actuelle...');
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const config = {};
    
    // Parser le fichier .env
    envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                let value = valueParts.join('=').trim();
                // Supprimer les guillemets
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                config[key] = value;
            }
        }
    });
    
    return config;
}

function updateEnvFile(config) {
    log('Mise à jour du fichier .env...');
    
    // Créer une sauvegarde
    const backupPath = `${envPath}.backup.${Date.now()}`;
    fs.copyFileSync(envPath, backupPath);
    success(`Sauvegarde créée: ${path.basename(backupPath)}`);
    
    // Construire le nouveau contenu
    const lines = [
        '# Configuration Discord',
        `DISCORD_TOKEN=${config.DISCORD_TOKEN || 'votre_token_discord_ici'}`,
        `CLIENT_ID=${config.CLIENT_ID || 'votre_client_id_ici'}`,
        `GUILD_ID=${config.GUILD_ID || 'votre_guild_id_ici'}`,
        '',
        '# Configuration GitHub pour sauvegardes',
        `GITHUB_TOKEN=${config.GITHUB_TOKEN || 'votre_token_github_ici'}`,
        `GITHUB_REPO=${config.GITHUB_REPO || 'mel805/Bag-bot'}`,
        `GITHUB_BACKUP_BRANCH=${config.GITHUB_BACKUP_BRANCH || 'backup-data'}`,
        '',
        '# Configuration optionnelle',
        `NODE_ENV=${config.NODE_ENV || 'production'}`,
        `BOT_PREFIX=${config.BOT_PREFIX || '!'}`,
    ];
    
    // Ajouter les variables optionnelles si elles existent
    if (config.LOCATIONIQ_TOKEN) {
        lines.push(`LOCATIONIQ_TOKEN=${config.LOCATIONIQ_TOKEN}`);
    }
    if (config.LEVEL_CARD_LOGO_URL) {
        lines.push(`LEVEL_CARD_LOGO_URL=${config.LEVEL_CARD_LOGO_URL}`);
    }
    
    fs.writeFileSync(envPath, lines.join('\n') + '\n');
    success('Fichier .env mis à jour');
}

function testGitHubConfig() {
    log('Test de la configuration GitHub...');
    
    // Charger les variables d'environnement
    require('dotenv').config();
    
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;
    const githubBranch = process.env.GITHUB_BACKUP_BRANCH || 'backup-data';
    
    console.log('\n📋 Configuration GitHub actuelle:');
    console.log(`   • Token: ${githubToken ? `${githubToken.substring(0, 8)}...` : '❌ Manquant'}`);
    console.log(`   • Dépôt: ${githubRepo || '❌ Manquant'}`);
    console.log(`   • Branche: ${githubBranch}`);
    
    // Vérifications
    let hasErrors = false;
    
    if (!githubToken || githubToken === 'votre_token_github_ici') {
        error('Token GitHub manquant ou non configuré');
        hasErrors = true;
    }
    
    if (!githubRepo || githubRepo === 'votre_repo_github_ici') {
        error('Dépôt GitHub manquant ou non configuré');
        hasErrors = true;
    }
    
    if (githubBranch === 'backu') {
        error('Nom de branche incorrect: "backu" au lieu de "backup-data"');
        hasErrors = true;
    } else if (githubBranch === 'backup-data') {
        success('Nom de branche correct: backup-data');
    }
    
    return !hasErrors;
}

async function testGitHubConnection() {
    log('Test de connectivité GitHub...');
    
    try {
        // Tenter de charger le module GitHubBackup
        const GitHubBackup = require('./src/storage/githubBackup.js');
        const github = new GitHubBackup();
        
        if (!github.isConfigured()) {
            error('Configuration GitHub incomplète');
            return false;
        }
        
        // Test de connectivité
        const result = await github.testConnection();
        
        if (result.success) {
            success('Connectivité GitHub OK');
            console.log(`   📁 Dépôt: ${result.repo}`);
            console.log(`   🔐 Push: ${result.permissions.push ? '✅' : '❌'}`);
            console.log(`   👑 Admin: ${result.permissions.admin ? '✅' : '❌'}`);
            return true;
        } else {
            error(`Connectivité GitHub échouée: ${result.error}`);
            return false;
        }
    } catch (err) {
        error(`Erreur test GitHub: ${err.message}`);
        return false;
    }
}

async function testBackup() {
    log('Test de sauvegarde GitHub...');
    
    try {
        const GitHubBackup = require('./src/storage/githubBackup.js');
        const github = new GitHubBackup();
        
        // Données de test
        const testData = {
            test: true,
            timestamp: new Date().toISOString(),
            message: 'Test de sauvegarde depuis correction automatique',
            source: 'fix-github-config.js'
        };
        
        const result = await github.backup({ test_correction: testData });
        
        if (result.success) {
            success('Test de sauvegarde réussi !');
            console.log(`   📝 Commit: ${result.commit_sha.substring(0, 8)}`);
            console.log(`   🔗 URL: ${result.commit_url}`);
            return true;
        } else {
            error('Test de sauvegarde échoué');
            return false;
        }
    } catch (err) {
        error(`Erreur test sauvegarde: ${err.message}`);
        return false;
    }
}

function displaySummary(config) {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 RÉSUMÉ DE LA CORRECTION');
    console.log('='.repeat(60));
    
    console.log('\n📋 Configuration finale:');
    console.log(`   • Token GitHub: ${config.GITHUB_TOKEN ? `${config.GITHUB_TOKEN.substring(0, 8)}...` : '❌ À configurer'}`);
    console.log(`   • Dépôt: ${config.GITHUB_REPO || '❌ À configurer'}`);
    console.log(`   • Branche: ${config.GITHUB_BACKUP_BRANCH || 'backup-data'}`);
    
    console.log('\n📝 Prochaines étapes:');
    if (!config.GITHUB_TOKEN || config.GITHUB_TOKEN === 'votre_token_github_ici') {
        console.log('   1. Obtenez un token GitHub sur https://github.com/settings/tokens');
        console.log('   2. Donnez-lui les permissions "repo" et "contents:write"');
        console.log('   3. Remplacez "votre_token_github_ici" dans le fichier .env');
    }
    
    if (!config.DISCORD_TOKEN || config.DISCORD_TOKEN === 'votre_token_discord_ici') {
        console.log('   4. Configurez votre DISCORD_TOKEN dans le fichier .env');
        console.log('   5. Configurez votre CLIENT_ID dans le fichier .env');
    }
    
    console.log('\n🚀 Une fois configuré, votre bot pourra sauvegarder automatiquement sur GitHub !');
}

// Fonction principale
async function main() {
    console.log('🔧 Correction de la Configuration GitHub - BAG Discord Bot');
    console.log('='.repeat(60));
    console.log();
    
    try {
        // 1. Vérifier/créer le fichier .env
        if (!checkEnvFile()) {
            process.exit(1);
        }
        
        // 2. Lire la configuration actuelle
        let config = readEnvFile();
        
        // 3. Corriger la branche si nécessaire
        if (config.GITHUB_BACKUP_BRANCH === 'backu') {
            warning('Correction de la branche: backu → backup-data');
            config.GITHUB_BACKUP_BRANCH = 'backup-data';
            updateEnvFile(config);
            config = readEnvFile(); // Relire après mise à jour
        } else if (!config.GITHUB_BACKUP_BRANCH) {
            info('Ajout de la branche par défaut: backup-data');
            config.GITHUB_BACKUP_BRANCH = 'backup-data';
            updateEnvFile(config);
            config = readEnvFile();
        }
        
        // 4. Tester la configuration
        const configOk = testGitHubConfig();
        
        // 5. Tester la connectivité si la config est OK
        if (configOk) {
            const connectionOk = await testGitHubConnection();
            
            // 6. Tester une sauvegarde si la connectivité est OK
            if (connectionOk) {
                await testBackup();
            }
        }
        
        // 7. Afficher le résumé
        displaySummary(config);
        
        success('Correction terminée !');
        
    } catch (err) {
        error(`Erreur: ${err.message}`);
        process.exit(1);
    }
}

// Exécution
if (require.main === module) {
    main().catch(err => {
        error(`Erreur fatale: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { main };