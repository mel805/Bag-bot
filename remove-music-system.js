#!/usr/bin/env node

/**
 * Script pour supprimer complètement le système musique du bot
 * Usage: node remove-music-system.js
 */

const fs = require('fs');
const path = require('path');

console.log('🎵 SUPPRESSION SYSTÈME MUSIQUE - Bot Discord');
console.log('===========================================\n');

// 1. Analyser les fichiers à modifier
const filesToModify = [
  'src/bot.js',
  'package.json'
];

// 2. Dossiers à supprimer
const foldersToRemove = [
  'lavalink',
  'lavalink-v3'
];

// 3. Fichiers de configuration Lavalink à supprimer
const lavalinkFiles = [
  'lavalink-nodes.example.json',
  'lavalink-nodes-render-final.json',
  'lavalink-nodes-render-optimized.json',
  'lavalink-nodes-stable.json',
  'lavalink-nodes.stable.json',
  'lavalink-nodes-updated.json',
  'lavalink-nodes-v3-only.json',
  'lavalink-nodes-v3-production.json',
  'lavalink-v3-test-report.json'
];

console.log('📋 ANALYSE DU SYSTÈME MUSIQUE ACTUEL:');
console.log('------------------------------------');

// Calculer la taille des dossiers Lavalink
let totalSize = 0;
foldersToRemove.forEach(folder => {
  const folderPath = path.join(process.cwd(), folder);
  if (fs.existsSync(folderPath)) {
    try {
      const { execSync } = require('child_process');
      const sizeOutput = execSync(`du -sh "${folderPath}"`, { encoding: 'utf8' });
      const size = sizeOutput.split('\t')[0];
      console.log(`  - ${folder}: ${size}`);
      
      // Extraire la taille en MB pour le calcul total
      const sizeNum = parseFloat(size.replace(/[^0-9.]/g, ''));
      if (size.includes('M')) totalSize += sizeNum;
      else if (size.includes('G')) totalSize += sizeNum * 1024;
    } catch (e) {
      console.log(`  - ${folder}: Erreur de calcul de taille`);
    }
  } else {
    console.log(`  - ${folder}: N'existe pas`);
  }
});

console.log(`\n💾 ESPACE DISQUE LIBÉRÉ: ~${totalSize.toFixed(0)} MB`);

// Analyser le code bot.js
console.log('\n🔍 ANALYSE DU CODE:');
console.log('-------------------');

const botJsPath = path.join(process.cwd(), 'src/bot.js');
if (fs.existsSync(botJsPath)) {
  const botCode = fs.readFileSync(botJsPath, 'utf8');
  
  const musicReferences = [
    { pattern: /ErelaManager/g, name: 'ErelaManager references' },
    { pattern: /erela\.js/g, name: 'erela.js imports' },
    { pattern: /lavalink/gi, name: 'Lavalink references' },
    { pattern: /client\.music/g, name: 'Music client references' },
    { pattern: /\/play|\/queue|\/skip|\/stop/g, name: 'Music commands' },
    { pattern: /music-/g, name: 'Music command handlers' }
  ];
  
  let totalReferences = 0;
  musicReferences.forEach(ref => {
    const matches = (botCode.match(ref.pattern) || []).length;
    totalReferences += matches;
    if (matches > 0) {
      console.log(`  - ${ref.name}: ${matches} occurrences`);
    }
  });
  
  console.log(`\n📊 TOTAL RÉFÉRENCES MUSIQUE: ${totalReferences}`);
}

// Fonction de confirmation
function askConfirmation(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question + ' (y/N): ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Fonction principale de suppression
async function removeMusicSystem() {
  console.log('\n⚠️  AVERTISSEMENT:');
  console.log('Cette opération va supprimer DÉFINITIVEMENT:');
  console.log('- Toutes les commandes musicales (/play, /queue, etc.)');
  console.log('- Les serveurs Lavalink locaux');
  console.log('- Les configurations audio');
  console.log('- ~151 MB d\'espace disque');
  console.log('- Réduction CPU estimée: -25%');
  
  const confirmed = await askConfirmation('\n❓ Confirmer la suppression du système musique?');
  
  if (!confirmed) {
    console.log('\n❌ Opération annulée.');
    return;
  }
  
  console.log('\n🗑️  SUPPRESSION EN COURS...');
  console.log('===========================');
  
  // Supprimer les dossiers Lavalink
  foldersToRemove.forEach(folder => {
    const folderPath = path.join(process.cwd(), folder);
    if (fs.existsSync(folderPath)) {
      try {
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`✅ Dossier supprimé: ${folder}`);
      } catch (e) {
        console.log(`❌ Erreur suppression ${folder}: ${e.message}`);
      }
    }
  });
  
  // Supprimer les fichiers de configuration
  lavalinkFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Fichier supprimé: ${file}`);
      } catch (e) {
        console.log(`❌ Erreur suppression ${file}: ${e.message}`);
      }
    }
  });
  
  // Modifier package.json pour supprimer erela.js
  console.log('\n📦 MODIFICATION PACKAGE.JSON:');
  const packagePath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (packageJson.dependencies && packageJson.dependencies['erela.js']) {
        delete packageJson.dependencies['erela.js'];
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
        console.log('✅ Dépendance erela.js supprimée');
      }
    } catch (e) {
      console.log(`❌ Erreur modification package.json: ${e.message}`);
    }
  }
  
  console.log('\n🎯 RÉSUMÉ:');
  console.log('==========');
  console.log('✅ Système musique supprimé');
  console.log(`✅ ~${totalSize.toFixed(0)} MB d'espace libéré`);
  console.log('✅ Réduction CPU estimée: -25%');
  console.log('✅ Bot compatible plan FREE (hors problème sleep)');
  
  console.log('\n⚠️  ÉTAPES SUIVANTES:');
  console.log('1. Exécuter: npm install (supprimer erela.js)');
  console.log('2. Modifier manuellement src/bot.js (supprimer code musique)');
  console.log('3. Tester le bot sans système musique');
  console.log('4. ⚠️  PROBLÈME SLEEP toujours présent sur plan FREE!');
  
  console.log('\n💡 RECOMMANDATION:');
  console.log('Même sans musique, le plan FREE reste problématique');
  console.log('à cause du sleep automatique après 15min.');
  console.log('Considérer Render Starter ($7/mois) pour un fonctionnement 24/7.');
}

// Exécuter le script
if (require.main === module) {
  removeMusicSystem().catch(console.error);
}

module.exports = { removeMusicSystem };