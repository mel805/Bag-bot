#!/usr/bin/env node

// Script de vérification pour Render - donne des messages d'erreur clairs
require('dotenv').config();

console.log('🔍 Vérification de l\'environnement Render...');
console.log('===========================================');

// Variables critiques requises
const criticalVars = [
    { name: 'DISCORD_TOKEN', description: 'Token du bot Discord' },
    { name: 'CLIENT_ID', description: 'ID de l\'application Discord' },
    { name: 'GUILD_ID', description: 'ID du serveur Discord' }
];

// Variables optionnelles
const optionalVars = [
    { name: 'DATABASE_URL', description: 'URL PostgreSQL (auto-configurée par Render)' },
    { name: 'LOCATIONIQ_TOKEN', description: 'Token LocationIQ pour géolocalisation' },
    { name: 'LEVEL_CARD_LOGO_URL', description: 'URL du logo pour les cartes de niveau' }
];

let missingCritical = [];
let missingOptional = [];

// Vérifier les variables critiques
console.log('\n📋 Variables CRITIQUES :');
criticalVars.forEach(variable => {
    if (process.env[variable.name]) {
        console.log(`✅ ${variable.name}: DÉFINI`);
    } else {
        console.log(`❌ ${variable.name}: MANQUANT - ${variable.description}`);
        missingCritical.push(variable);
    }
});

// Vérifier les variables optionnelles
console.log('\n📋 Variables OPTIONNELLES :');
optionalVars.forEach(variable => {
    if (process.env[variable.name]) {
        console.log(`✅ ${variable.name}: DÉFINI`);
    } else {
        console.log(`⚠️  ${variable.name}: MANQUANT - ${variable.description}`);
        missingOptional.push(variable);
    }
});

// Résumé
console.log('\n📊 RÉSUMÉ :');
console.log('===========');

if (missingCritical.length === 0) {
    console.log('✅ Toutes les variables critiques sont configurées !');
    console.log('🚀 Le bot peut démarrer correctement.');
    
    if (missingOptional.length > 0) {
        console.log(`⚠️  ${missingOptional.length} variable(s) optionnelle(s) manquante(s) - fonctionnalités limitées`);
    }
    
    process.exit(0);
} else {
    console.log(`❌ ${missingCritical.length} variable(s) critique(s) manquante(s) !`);
    console.log('🚫 Le déploiement ÉCHOUERA jusqu\'à ce qu\'elles soient configurées.');
    
    console.log('\n🔧 ACTIONS REQUISES :');
    console.log('=====================');
    console.log('1. Allez sur https://dashboard.render.com');
    console.log('2. Sélectionnez votre service "bag-discord-bot"');
    console.log('3. Onglet "Environment"');
    console.log('4. Ajoutez les variables manquantes :');
    
    missingCritical.forEach(variable => {
        console.log(`   - ${variable.name} = <${variable.description.toLowerCase()}>`);
    });
    
    console.log('5. Redéployez manuellement');
    
    console.log('\n📚 Ressources :');
    console.log('- Discord Developer Portal: https://discord.com/developers/applications');
    console.log('- Guide complet: voir RENDER_FIX_GUIDE.md');
    
    process.exit(1);
}