#!/usr/bin/env node

/**
 * Script de redémarrage du système musique avec nœuds Lavalink V3 uniquement
 * Optimisé pour une performance maximale avec les nœuds V3 vérifiés
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🎵 Redémarrage du système musique avec nœuds Lavalink V3 uniquement');
console.log('================================================================\n');

// Vérifier la configuration V3
const v3ConfigPath = '/workspace/lavalink-nodes-v3-production.json';
let v3Config = [];

try {
  const configData = fs.readFileSync(v3ConfigPath, 'utf8');
  v3Config = JSON.parse(configData);
  console.log('✅ Configuration V3 chargée:', v3Config.length, 'nœud(s)');
  
  v3Config.forEach(node => {
    console.log(`   - ${node.identifier}: ${node.host}:${node.port} (${node.note})`);
  });
} catch (error) {
  console.error('❌ Erreur lors du chargement de la configuration V3:', error.message);
  process.exit(1);
}

// Variables d'environnement pour forcer l'utilisation des nœuds V3
const env = {
  ...process.env,
  ENABLE_MUSIC: 'true',
  LAVALINK_NODES: JSON.stringify(v3Config),
  ENABLE_LOCAL_LAVALINK: 'false', // Désactiver le Lavalink local
  ENABLE_LOCAL_LAVALINK_V3: 'false', // Désactiver le Lavalink V3 local
  MUSIC_V3_ONLY: 'true', // Flag personnalisé pour indiquer V3 uniquement
  NODE_ENV: 'production'
};

console.log('\n🔧 Configuration environnement:');
console.log('   - ENABLE_MUSIC: true');
console.log('   - LAVALINK_NODES: Configuration V3 personnalisée');
console.log('   - ENABLE_LOCAL_LAVALINK: false');
console.log('   - ENABLE_LOCAL_LAVALINK_V3: false');
console.log('   - MUSIC_V3_ONLY: true');

// Fonction pour arrêter les processus existants
function killExistingProcesses() {
  return new Promise((resolve) => {
    console.log('\n🛑 Arrêt des processus existants...');
    
    // Tuer les processus Node.js liés au bot
    const killProcess = spawn('pkill', ['-f', 'bot.js'], { stdio: 'inherit' });
    
    killProcess.on('close', (code) => {
      console.log('   - Processus bot arrêtés');
      
      // Tuer les processus Lavalink locaux
      const killLavalink = spawn('pkill', ['-f', 'Lavalink.jar'], { stdio: 'inherit' });
      
      killLavalink.on('close', (code) => {
        console.log('   - Processus Lavalink locaux arrêtés');
        setTimeout(resolve, 2000); // Attendre 2 secondes
      });
    });
  });
}

// Fonction pour démarrer le bot avec la configuration V3
function startMusicSystem() {
  return new Promise((resolve, reject) => {
    console.log('\n🚀 Démarrage du système musique V3...');
    
    const botProcess = spawn('node', ['/workspace/src/bot.js'], {
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: '/workspace'
    });

    let startupComplete = false;
    let musicSystemReady = false;

    // Surveiller la sortie pour confirmer le démarrage
    botProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[BOT]', output.trim());
      
      // Vérifier les indicateurs de succès
      if (output.includes('Music] ✅ Node connected')) {
        musicSystemReady = true;
        console.log('✅ Système musique V3 connecté avec succès !');
      }
      
      if (output.includes('Bot ready') || output.includes('Logged in as')) {
        startupComplete = true;
        if (musicSystemReady) {
          setTimeout(() => resolve(botProcess), 3000);
        }
      }
    });

    botProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (!output.includes('DeprecationWarning') && !output.includes('ExperimentalWarning')) {
        console.error('[BOT-ERROR]', output.trim());
      }
    });

    botProcess.on('error', (error) => {
      console.error('❌ Erreur lors du démarrage du bot:', error.message);
      reject(error);
    });

    botProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Bot fermé avec le code: ${code}`);
        reject(new Error(`Bot process exited with code ${code}`));
      }
    });

    // Timeout après 60 secondes
    setTimeout(() => {
      if (!startupComplete || !musicSystemReady) {
        console.error('❌ Timeout lors du démarrage du système musique');
        botProcess.kill();
        reject(new Error('Startup timeout'));
      }
    }, 60000);
  });
}

// Fonction principale
async function main() {
  try {
    // Étape 1: Arrêter les processus existants
    await killExistingProcesses();
    
    // Étape 2: Démarrer le système musique avec V3
    const botProcess = await startMusicSystem();
    
    console.log('\n🎉 Système musique V3 démarré avec succès !');
    console.log('🎵 Configuration: Nœuds Lavalink V3 uniquement');
    console.log('✅ Status: Opérationnel à 100%');
    console.log('\n📊 Statistiques:');
    console.log(`   - Nœuds V3 configurés: ${v3Config.length}`);
    console.log('   - Nœuds locaux: Désactivés');
    console.log('   - Mode: Production V3');
    
    console.log('\n💡 Le bot fonctionne maintenant avec uniquement des nœuds Lavalink V3 vérifiés.');
    console.log('   Pour arrêter le bot, utilisez Ctrl+C ou pkill -f bot.js');
    
    // Garder le processus principal vivant
    process.on('SIGINT', () => {
      console.log('\n🛑 Arrêt du système musique V3...');
      botProcess.kill();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('\n❌ Erreur lors du redémarrage:', error.message);
    process.exit(1);
  }
}

// Démarrer le script
main().catch(console.error);