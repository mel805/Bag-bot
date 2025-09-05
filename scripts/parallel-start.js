#!/usr/bin/env node

/**
 * Script de démarrage parallèle optimisé pour BAG Bot
 * Objectif: Réduire le temps de démarrage de 60-70%
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Démarrage optimisé du BAG Bot...');
console.log('⚡ Mode parallèle activé');

// Fonction utilitaire pour exécuter une commande
function runCommand(command, args, description) {
  return new Promise((resolve, reject) => {
    console.log(`📋 ${description}...`);
    const startTime = Date.now();
    
    const process = spawn(command, args, { 
      stdio: 'pipe',
      cwd: path.join(__dirname, '..')
    });
    
    let output = '';
    let errorOutput = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
      // Afficher les logs importants en temps réel
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.includes('✓') || line.includes('✅') || line.includes('❌') || line.includes('ERROR')) {
          console.log(`  ${description}: ${line}`);
        }
      });
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`  ${description} [WARN]: ${data.toString().trim()}`);
    });
    
    process.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        console.log(`✅ ${description} terminé (${duration}ms)`);
        resolve({ code, output, duration });
      } else {
        console.error(`❌ ${description} échoué (code ${code}, ${duration}ms)`);
        console.error(`   Erreur: ${errorOutput.slice(0, 200)}...`);
        resolve({ code, output, errorOutput, duration }); // Ne pas rejeter pour permettre le fallback
      }
    });
    
    process.on('error', (error) => {
      console.error(`💥 ${description} erreur système:`, error.message);
      reject(error);
    });
  });
}

async function main() {
  const startTime = Date.now();
  
  try {
    // Vérification rapide de l'environnement
    console.log('🔍 Vérification de l\'environnement...');
    const missing = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'].filter(v => !process.env[v]);
    if (missing.length) {
      console.error('❌ Variables d\'environnement manquantes:', missing.join(', '));
      console.error('📋 Configurez ces variables dans Render Dashboard > Environment');
      process.exit(1);
    }
    console.log('✅ Environnement OK');
    
    // ÉTAPE 1: Démarrer le bot IMMÉDIATEMENT en arrière-plan
    console.log('\n🎯 ÉTAPE 1: Démarrage immédiat du bot...');
    const botProcess = spawn('node', ['src/bot.js'], { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      detached: false 
    });
    
    // Attendre un peu pour laisser le bot s'initialiser
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ÉTAPE 2: Exécuter les tâches non-critiques en parallèle
    console.log('\n🔄 ÉTAPE 2: Tâches de maintenance en parallèle...');
    
    const parallelTasks = [
      // Tâche 1: Restauration/backup (non-critique pour le fonctionnement immédiat)
      runCommand('node', ['src/migrate/render-restore.js'], 'Restauration config'),
      
      // Tâche 2: Déploiement des commandes (peut être fait après démarrage)
      runCommand('node', ['src/deploy-commands.js'], 'Déploiement commandes')
    ];
    
    // Attendre que toutes les tâches se terminent (ou échouent)
    const results = await Promise.allSettled(parallelTasks);
    
    // Analyser les résultats
    console.log('\n📊 RÉSULTATS:');
    results.forEach((result, index) => {
      const taskNames = ['Restauration config', 'Déploiement commandes'];
      const taskName = taskNames[index];
      
      if (result.status === 'fulfilled') {
        const { code, duration } = result.value;
        if (code === 0) {
          console.log(`  ✅ ${taskName}: Succès (${duration}ms)`);
        } else {
          console.log(`  ⚠️  ${taskName}: Terminé avec avertissements (${duration}ms)`);
        }
      } else {
        console.log(`  ❌ ${taskName}: Échec - ${result.reason?.message || 'Erreur inconnue'}`);
      }
    });
    
    const totalTime = Date.now() - startTime;
    console.log(`\n🏁 Démarrage optimisé terminé en ${totalTime}ms`);
    console.log('🎯 Le bot est opérationnel et les tâches de maintenance sont terminées');
    
    // Vérifier si le bot fonctionne toujours
    if (botProcess.killed) {
      console.error('💥 Le bot s\'est arrêté de manière inattendue');
      process.exit(1);
    }
    
    // Gérer l'arrêt propre
    process.on('SIGTERM', () => {
      console.log('🛑 Signal SIGTERM reçu, arrêt du bot...');
      botProcess.kill('SIGTERM');
    });
    
    process.on('SIGINT', () => {
      console.log('🛑 Signal SIGINT reçu, arrêt du bot...');
      botProcess.kill('SIGINT');
    });
    
    // Attendre que le bot se termine
    botProcess.on('close', (code) => {
      console.log(`🏁 Bot terminé avec le code ${code}`);
      process.exit(code);
    });
    
  } catch (error) {
    console.error('💥 Erreur critique lors du démarrage:', error);
    
    // Fallback: démarrage séquentiel classique
    console.log('🔄 Tentative de fallback vers le démarrage séquentiel...');
    try {
      await runCommand('npm', ['run', 'render-start'], 'Fallback séquentiel');
    } catch (fallbackError) {
      console.error('💀 Échec complet du démarrage:', fallbackError);
      process.exit(1);
    }
  }
}

// Exécuter le script principal
main().catch(error => {
  console.error('💀 Erreur fatale:', error);
  process.exit(1);
});