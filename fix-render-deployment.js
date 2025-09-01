#!/usr/bin/env node

/**
 * Script de correction rapide pour les problèmes de déploiement Render
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Script de Correction - Déploiement Render\n');

// 1. Vérifier et corriger package.json
function fixPackageJson() {
    console.log('📦 Vérification de package.json...');
    
    const packagePath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    let modified = false;
    
    // Améliorer les scripts Render
    const newScripts = {
        ...pkg.scripts,
        "render-build": "npm ci",
        "render-start": "node src/migrate/render-restore.js && node src/deploy-commands.js && node src/bot.js",
        "deploy:auto": "bash scripts/render-deploy-auto.sh"
    };
    
    if (JSON.stringify(pkg.scripts) !== JSON.stringify(newScripts)) {
        pkg.scripts = newScripts;
        modified = true;
        console.log('✅ Scripts de déploiement améliorés');
    }
    
    // Ajouter des engines plus spécifiques
    if (!pkg.engines || pkg.engines.node !== ">=18.17.0") {
        pkg.engines = { node: ">=18.17.0" };
        modified = true;
        console.log('✅ Version Node.js spécifiée');
    }
    
    if (modified) {
        fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
        console.log('✅ package.json mis à jour');
    } else {
        console.log('✅ package.json OK');
    }
}

// 2. Créer un fichier .env.example
function createEnvExample() {
    console.log('📝 Création de .env.example...');
    
    const envExample = `# Variables d'environnement requises pour le bot Discord BAG
# Copiez ce fichier vers .env et remplissez les valeurs

# Discord Configuration (REQUIS)
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_discord_guild_id_here

# Database (REQUIS pour Render)
DATABASE_URL=postgresql://user:password@host:port/database

# GitHub Backup (REQUIS pour les sauvegardes)
GITHUB_TOKEN=your_github_token_here
GITHUB_REPO=mel805/Bag-bot
GITHUB_BACKUP_BRANCH=backup-data

# Services Optionnels
LOCATIONIQ_TOKEN=your_locationiq_token_here
LEVEL_CARD_LOGO_URL=https://your-logo-url.com/logo.png

# Configuration Render
DATA_DIR=/var/data
`;
    
    const envExamplePath = path.join(process.cwd(), '.env.example');
    if (!fs.existsSync(envExamplePath)) {
        fs.writeFileSync(envExamplePath, envExample);
        console.log('✅ .env.example créé');
    } else {
        console.log('✅ .env.example existe déjà');
    }
}

// 3. Corriger render.yaml pour une meilleure robustesse
function fixRenderYaml() {
    console.log('⚙️ Vérification de render.yaml...');
    
    const renderYamlPath = path.join(process.cwd(), 'render.yaml');
    let content = fs.readFileSync(renderYamlPath, 'utf8');
    
    // Remplacer la commande de build problématique
    const newBuildCommand = 'npm ci';
    if (content.includes('npm run render-build')) {
        content = content.replace('buildCommand: npm run render-build', `buildCommand: ${newBuildCommand}`);
        fs.writeFileSync(renderYamlPath, content);
        console.log('✅ render.yaml - buildCommand simplifié');
    } else {
        console.log('✅ render.yaml OK');
    }
}

// 4. Créer un script de health check
function createHealthCheck() {
    console.log('🏥 Création du health check...');
    
    const healthCheckContent = `const http = require('http');

// Simple health check endpoint pour Render
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            service: 'bag-discord-bot'
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(\`Health check server running on port \${PORT}\`);
});

module.exports = server;
`;
    
    const healthPath = path.join(process.cwd(), 'src', 'health.js');
    if (!fs.existsSync(healthPath)) {
        fs.writeFileSync(healthPath, healthCheckContent);
        console.log('✅ Health check créé');
    } else {
        console.log('✅ Health check existe déjà');
    }
}

// 5. Rendre le script auto-deploy exécutable
function makeScriptsExecutable() {
    console.log('🔧 Configuration des permissions...');
    
    const scripts = [
        'scripts/render-deploy-auto.sh',
        'scripts/deploy-commands.sh',
        'scripts/render-deploy.sh'
    ];
    
    scripts.forEach(script => {
        const scriptPath = path.join(process.cwd(), script);
        if (fs.existsSync(scriptPath)) {
            try {
                fs.chmodSync(scriptPath, '755');
                console.log(`✅ ${script} rendu exécutable`);
            } catch (e) {
                console.log(`⚠️ Impossible de modifier les permissions de ${script}`);
            }
        }
    });
}

// Fonction principale
async function main() {
    try {
        fixPackageJson();
        createEnvExample();
        fixRenderYaml();
        createHealthCheck();
        makeScriptsExecutable();
        
        console.log('\n🎯 Résumé des Corrections:');
        console.log('✅ Scripts de déploiement améliorés');
        console.log('✅ Configuration Render optimisée');
        console.log('✅ Fichier .env.example créé');
        console.log('✅ Health check ajouté');
        console.log('✅ Permissions configurées');
        
        console.log('\n🚀 Prochaines Étapes:');
        console.log('1. Configurez les variables d\'environnement dans Render Dashboard');
        console.log('2. Utilisez: npm run deploy:auto');
        console.log('3. Ou utilisez le déploiement manuel dans Render Dashboard');
        
        console.log('\n📋 Variables CRITIQUES à configurer dans Render:');
        console.log('   - DISCORD_TOKEN');
        console.log('   - CLIENT_ID'); 
        console.log('   - DATABASE_URL');
        console.log('   - GITHUB_TOKEN');
        console.log('   - GITHUB_REPO');
        
    } catch (error) {
        console.error('❌ Erreur lors de la correction:', error.message);
        process.exit(1);
    }
}

main();