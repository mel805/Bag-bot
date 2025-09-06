#!/usr/bin/env node

/**
 * 🧪 Script de Test Configuration PM2 - BAG Discord Bot
 * Ce script valide la configuration PM2 et teste les fonctionnalités
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

// Couleurs pour l'affichage
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    purple: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Fonctions d'affichage
const log = (message) => console.log(`${colors.blue}[${new Date().toISOString()}]${colors.reset} ${message}`);
const success = (message) => console.log(`${colors.green}✅ ${message}${colors.reset}`);
const warning = (message) => console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
const error = (message) => console.log(`${colors.red}❌ ${message}${colors.reset}`);
const info = (message) => console.log(`${colors.purple}ℹ️  ${message}${colors.reset}`);

// Configuration
const config = {
    botUser: 'botuser',
    botDir: '/home/botuser/bag-discord-bot',
    appName: 'bagbot',
    ecosystemFile: 'ecosystem.config.js'
};

// Résultats des tests
let testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
};

// Fonction pour exécuter des commandes
function execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

// Test de base
async function testBasicSetup() {
    log('🔍 Test de la configuration de base...');
    
    const tests = [
        {
            name: 'Vérification de Node.js',
            test: async () => {
                const result = await execCommand('node --version');
                const version = result.stdout.trim();
                if (version.startsWith('v18.')) {
                    return { success: true, message: `Node.js ${version} détecté` };
                } else {
                    return { success: false, message: `Version Node.js incorrecte: ${version}` };
                }
            }
        },
        {
            name: 'Vérification de PM2',
            test: async () => {
                try {
                    const result = await execCommand('pm2 --version');
                    const version = result.stdout.trim();
                    return { success: true, message: `PM2 v${version} installé` };
                } catch (err) {
                    return { success: false, message: 'PM2 non installé' };
                }
            }
        },
        {
            name: 'Vérification de l\'utilisateur botuser',
            test: async () => {
                try {
                    await execCommand(`id ${config.botUser}`);
                    return { success: true, message: 'Utilisateur botuser existe' };
                } catch (err) {
                    return { success: false, message: 'Utilisateur botuser non trouvé' };
                }
            }
        },
        {
            name: 'Vérification du répertoire du bot',
            test: async () => {
                if (fs.existsSync(config.botDir)) {
                    return { success: true, message: 'Répertoire du bot trouvé' };
                } else {
                    return { success: false, message: 'Répertoire du bot non trouvé' };
                }
            }
        }
    ];
    
    for (const test of tests) {
        try {
            const result = await test.test();
            if (result.success) {
                success(`${test.name}: ${result.message}`);
                testResults.passed++;
            } else {
                error(`${test.name}: ${result.message}`);
                testResults.failed++;
            }
            testResults.tests.push({ name: test.name, ...result });
        } catch (err) {
            error(`${test.name}: Erreur lors du test`);
            testResults.failed++;
            testResults.tests.push({ name: test.name, success: false, message: err.message });
        }
    }
}

// Test de la configuration ecosystem
async function testEcosystemConfig() {
    log('🔍 Test de la configuration ecosystem.config.js...');
    
    const ecosystemPath = path.join(config.botDir, config.ecosystemFile);
    
    if (!fs.existsSync(ecosystemPath)) {
        error('Fichier ecosystem.config.js non trouvé');
        testResults.failed++;
        return;
    }
    
    try {
        // Charger la configuration
        const ecosystemConfig = require(ecosystemPath);
        
        const tests = [
            {
                name: 'Structure de base',
                test: () => {
                    if (ecosystemConfig.apps && Array.isArray(ecosystemConfig.apps)) {
                        return { success: true, message: 'Structure apps[] trouvée' };
                    }
                    return { success: false, message: 'Structure apps[] manquante' };
                }
            },
            {
                name: 'Configuration de l\'application',
                test: () => {
                    const app = ecosystemConfig.apps[0];
                    if (app && app.name === config.appName) {
                        return { success: true, message: `Application ${config.appName} configurée` };
                    }
                    return { success: false, message: 'Configuration de l\'application incorrecte' };
                }
            },
            {
                name: 'Script principal',
                test: () => {
                    const app = ecosystemConfig.apps[0];
                    if (app && app.script) {
                        const scriptPath = path.join(config.botDir, app.script);
                        if (fs.existsSync(scriptPath)) {
                            return { success: true, message: `Script ${app.script} trouvé` };
                        }
                        return { success: false, message: `Script ${app.script} non trouvé` };
                    }
                    return { success: false, message: 'Script non configuré' };
                }
            },
            {
                name: 'Configuration des logs',
                test: () => {
                    const app = ecosystemConfig.apps[0];
                    if (app && (app.log_file || app.out_file || app.error_file)) {
                        return { success: true, message: 'Configuration des logs présente' };
                    }
                    return { success: false, message: 'Configuration des logs manquante', warning: true };
                }
            },
            {
                name: 'Limite mémoire',
                test: () => {
                    const app = ecosystemConfig.apps[0];
                    if (app && app.max_memory_restart) {
                        return { success: true, message: `Limite mémoire: ${app.max_memory_restart}` };
                    }
                    return { success: false, message: 'Limite mémoire non configurée', warning: true };
                }
            }
        ];
        
        for (const test of tests) {
            const result = test.test();
            if (result.success) {
                success(`${test.name}: ${result.message}`);
                testResults.passed++;
            } else if (result.warning) {
                warning(`${test.name}: ${result.message}`);
                testResults.warnings++;
            } else {
                error(`${test.name}: ${result.message}`);
                testResults.failed++;
            }
            testResults.tests.push({ name: test.name, ...result });
        }
        
    } catch (err) {
        error(`Erreur lors du chargement de ecosystem.config.js: ${err.message}`);
        testResults.failed++;
    }
}

// Test des dépendances
async function testDependencies() {
    log('🔍 Test des dépendances...');
    
    const packageJsonPath = path.join(config.botDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
        error('Fichier package.json non trouvé');
        testResults.failed++;
        return;
    }
    
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const nodeModulesPath = path.join(config.botDir, 'node_modules');
        
        if (fs.existsSync(nodeModulesPath)) {
            success('Répertoire node_modules trouvé');
            testResults.passed++;
        } else {
            error('Répertoire node_modules non trouvé');
            testResults.failed++;
        }
        
        // Vérifier les dépendances critiques
        const criticalDeps = ['discord.js', 'dotenv'];
        for (const dep of criticalDeps) {
            const depPath = path.join(nodeModulesPath, dep);
            if (fs.existsSync(depPath)) {
                success(`Dépendance ${dep} installée`);
                testResults.passed++;
            } else {
                error(`Dépendance ${dep} manquante`);
                testResults.failed++;
            }
        }
        
    } catch (err) {
        error(`Erreur lors de la vérification des dépendances: ${err.message}`);
        testResults.failed++;
    }
}

// Test de PM2
async function testPM2Status() {
    log('🔍 Test du statut PM2...');
    
    try {
        // Vérifier si l'application est dans PM2
        const result = await execCommand(`sudo -u ${config.botUser} pm2 list`);
        
        if (result.stdout.includes(config.appName)) {
            success('Application trouvée dans PM2');
            testResults.passed++;
            
            // Vérifier le statut
            if (result.stdout.includes('online')) {
                success('Application en ligne');
                testResults.passed++;
            } else if (result.stdout.includes('stopped')) {
                warning('Application arrêtée');
                testResults.warnings++;
            } else {
                error('Statut de l\'application inconnu');
                testResults.failed++;
            }
        } else {
            warning('Application non trouvée dans PM2');
            testResults.warnings++;
        }
        
    } catch (err) {
        error(`Erreur lors de la vérification PM2: ${err.message}`);
        testResults.failed++;
    }
}

// Test des logs
async function testLogs() {
    log('🔍 Test de la configuration des logs...');
    
    const logDirs = [
        path.join(config.botDir, 'logs'),
        `/home/${config.botUser}/.pm2/logs`
    ];
    
    for (const logDir of logDirs) {
        if (fs.existsSync(logDir)) {
            success(`Répertoire de logs trouvé: ${logDir}`);
            testResults.passed++;
            
            // Vérifier les fichiers de logs
            const logFiles = fs.readdirSync(logDir).filter(file => file.endsWith('.log'));
            if (logFiles.length > 0) {
                success(`${logFiles.length} fichier(s) de log trouvé(s)`);
                testResults.passed++;
            } else {
                warning('Aucun fichier de log trouvé');
                testResults.warnings++;
            }
        } else {
            warning(`Répertoire de logs non trouvé: ${logDir}`);
            testResults.warnings++;
        }
    }
}

// Test de connectivité
async function testConnectivity() {
    log('🔍 Test de connectivité...');
    
    try {
        await execCommand('ping -c 1 discord.com');
        success('Connectivité Discord OK');
        testResults.passed++;
    } catch (err) {
        error('Connectivité Discord échouée');
        testResults.failed++;
    }
    
    try {
        await execCommand('ping -c 1 8.8.8.8');
        success('Connectivité Internet OK');
        testResults.passed++;
    } catch (err) {
        error('Connectivité Internet échouée');
        testResults.failed++;
    }
}

// Affichage du résumé
function displaySummary() {
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.cyan}📊 RÉSUMÉ DES TESTS${colors.reset}`);
    console.log('='.repeat(60));
    
    success(`Tests réussis: ${testResults.passed}`);
    if (testResults.warnings > 0) {
        warning(`Avertissements: ${testResults.warnings}`);
    }
    if (testResults.failed > 0) {
        error(`Tests échoués: ${testResults.failed}`);
    }
    
    const total = testResults.passed + testResults.failed + testResults.warnings;
    const successRate = Math.round((testResults.passed / total) * 100);
    
    console.log(`\n📈 Taux de réussite: ${successRate}%`);
    
    if (testResults.failed === 0) {
        success('✨ Configuration PM2 prête pour la production!');
    } else if (testResults.failed <= 2) {
        warning('⚠️  Configuration PM2 nécessite quelques ajustements');
    } else {
        error('🚨 Configuration PM2 nécessite des corrections importantes');
    }
    
    console.log('\n' + '='.repeat(60));
}

// Fonction principale
async function main() {
    console.log(`${colors.cyan}🧪 Test de Configuration PM2 - BAG Discord Bot${colors.reset}`);
    console.log('='.repeat(60));
    
    try {
        await testBasicSetup();
        console.log();
        
        await testEcosystemConfig();
        console.log();
        
        await testDependencies();
        console.log();
        
        await testPM2Status();
        console.log();
        
        await testLogs();
        console.log();
        
        await testConnectivity();
        
        displaySummary();
        
        // Code de sortie basé sur les résultats
        if (testResults.failed > 0) {
            process.exit(1);
        } else if (testResults.warnings > 0) {
            process.exit(2);
        } else {
            process.exit(0);
        }
        
    } catch (err) {
        error(`Erreur critique lors des tests: ${err.message}`);
        process.exit(1);
    }
}

// Gestion des arguments
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Usage: node test-pm2-config.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h    Afficher cette aide');
        console.log('');
        console.log('Codes de sortie:');
        console.log('  0    Tous les tests réussis');
        console.log('  1    Tests échoués');
        console.log('  2    Avertissements seulement');
        console.log('');
        process.exit(0);
    }
    
    main();
}

module.exports = {
    testBasicSetup,
    testEcosystemConfig,
    testDependencies,
    testPM2Status,
    testLogs,
    testConnectivity
};