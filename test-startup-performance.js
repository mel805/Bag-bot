#!/usr/bin/env node

/**
 * Script de test de performance pour mesurer l'amélioration du temps de démarrage
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Test de Performance - Démarrage BAG Bot');
console.log('============================================');

async function testStartupMethod(method, description) {
  console.log(`\n📊 Test: ${description}`);
  console.log('⏱️  Démarrage...');
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const process = spawn('npm', ['run', method], {
      stdio: 'pipe',
      cwd: __dirname
    });
    
    let output = '';
    let errorOutput = '';
    let botReady = false;
    let commandsDeployed = false;
    
    process.stdout.on('data', (data) => {
      output += data.toString();
      const text = data.toString().toLowerCase();
      
      // Détecter quand le bot est prêt
      if (text.includes('logged in as') || text.includes('ready')) {
        if (!botReady) {
          botReady = true;
          const readyTime = Date.now() - startTime;
          console.log(`  🤖 Bot prêt: ${readyTime}ms`);
        }
      }
      
      // Détecter quand les commandes sont déployées
      if (text.includes('commands registered') || text.includes('command deployment skipped')) {
        if (!commandsDeployed) {
          commandsDeployed = true;
          const commandsTime = Date.now() - startTime;
          console.log(`  📋 Commandes: ${commandsTime}ms`);
        }
      }
      
      // Afficher les étapes importantes
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.includes('✅') || line.includes('✓') || line.includes('🚀') || line.includes('⚡')) {
          console.log(`    ${line.trim()}`);
        }
      });
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Arrêter le test après 30 secondes maximum
    const timeout = setTimeout(() => {
      console.log(`  ⏰ Timeout atteint (30s)`);
      process.kill('SIGTERM');
    }, 30000);
    
    process.on('close', (code) => {
      clearTimeout(timeout);
      const totalTime = Date.now() - startTime;
      
      console.log(`  🏁 Total: ${totalTime}ms (code ${code})`);
      
      resolve({
        method,
        description,
        totalTime,
        botReady,
        commandsDeployed,
        code,
        success: code === 0 || botReady // Succès si bot prêt même si processus s'arrête
      });
    });
    
    // Arrêter le processus après avoir mesuré le démarrage
    setTimeout(() => {
      if (botReady && commandsDeployed) {
        console.log(`  🛑 Arrêt du test (mesures terminées)`);
        process.kill('SIGTERM');
      }
    }, 10000); // 10 secondes pour laisser le temps au démarrage
  });
}

async function main() {
  try {
    // Vérifier l'environnement
    const missing = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'].filter(v => !process.env[v]);
    if (missing.length) {
      console.error('❌ Variables d\'environnement manquantes pour les tests:', missing.join(', '));
      console.log('ℹ️  Créez un fichier .env avec vos tokens pour tester localement');
      process.exit(1);
    }
    
    const tests = [
      { method: 'render-start-safe', description: 'Démarrage Séquentiel (Ancien)' },
      { method: 'render-start-optimized', description: 'Démarrage Parallèle (Nouveau)' }
    ];
    
    const results = [];
    
    for (const test of tests) {
      try {
        const result = await testStartupMethod(test.method, test.description);
        results.push(result);
        
        // Pause entre les tests
        console.log('⏸️  Pause 5s entre les tests...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`❌ Erreur lors du test ${test.description}:`, error.message);
        results.push({
          method: test.method,
          description: test.description,
          totalTime: -1,
          success: false,
          error: error.message
        });
      }
    }
    
    // Analyser les résultats
    console.log('\n📈 ANALYSE DES RÉSULTATS');
    console.log('========================');
    
    results.forEach(result => {
      console.log(`\n${result.description}:`);
      if (result.success) {
        console.log(`  ⏱️  Temps total: ${result.totalTime}ms`);
        console.log(`  🤖 Bot prêt: ${result.botReady ? '✅' : '❌'}`);
        console.log(`  📋 Commandes: ${result.commandsDeployed ? '✅' : '❌'}`);
      } else {
        console.log(`  ❌ Échec: ${result.error || 'Erreur inconnue'}`);
      }
    });
    
    // Calcul de l'amélioration
    const oldMethod = results.find(r => r.method === 'render-start-safe');
    const newMethod = results.find(r => r.method === 'render-start-optimized');
    
    if (oldMethod?.success && newMethod?.success) {
      const improvement = ((oldMethod.totalTime - newMethod.totalTime) / oldMethod.totalTime) * 100;
      const timeSaved = oldMethod.totalTime - newMethod.totalTime;
      
      console.log('\n🎯 AMÉLIORATION:');
      console.log(`  📊 Gain de temps: ${timeSaved}ms (${improvement.toFixed(1)}%)`);
      
      if (improvement > 30) {
        console.log('  🏆 Excellente optimisation !');
      } else if (improvement > 10) {
        console.log('  👍 Bonne amélioration');
      } else {
        console.log('  ⚠️  Amélioration limitée');
      }
    }
    
    console.log('\n✅ Tests de performance terminés');
    
  } catch (error) {
    console.error('💥 Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécuter les tests si ce script est appelé directement
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testStartupMethod };