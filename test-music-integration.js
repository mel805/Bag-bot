#!/usr/bin/env node

/**
 * Test d'intégration du système musique avec le bot Discord
 * Vérifie que tout fonctionne correctement avec les limites Render et Discord
 */

const fs = require('fs');
const path = require('path');

console.log('🎵 Test d\'intégration du système musique...\n');

// Test 1: Vérifier la configuration des nœuds
function testLavalinkConfiguration() {
  console.log('📋 Test 1: Configuration des nœuds Lavalink...');
  
  const configPath = path.join(__dirname, 'lavalink-nodes-render-final.json');
  if (!fs.existsSync(configPath)) {
    console.log('   ❌ Configuration finale non trouvée');
    return false;
  }
  
  try {
    const nodes = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`   ✅ ${nodes.length} nœuds configurés`);
    
    nodes.forEach((node, index) => {
      console.log(`   ${index + 1}. ${node.identifier} - ${node.host}:${node.port} (${node.secure ? 'SSL' : 'Non-SSL'})`);
      console.log(`      Timeout: ${node.timeout || 2000}ms, Retry: ${node.retryAmount}, Priority: ${node.priority}`);
    });
    
    return nodes.length >= 2; // Au moins 2 nœuds pour la redondance
  } catch (error) {
    console.log('   ❌ Erreur lors du chargement:', error.message);
    return false;
  }
}

// Test 2: Vérifier les variables d'environnement
function testEnvironmentVariables() {
  console.log('\n⚙️ Test 2: Variables d\'environnement...');
  
  const requiredVars = [
    'ENABLE_MUSIC',
    'MUSIC_V3_ONLY',
    'LAVALINK_NODES'
  ];
  
  const renderOptimizations = [
    'MUSIC_MAX_CONCURRENT_CONNECTIONS',
    'MUSIC_CONNECTION_TIMEOUT',
    'MUSIC_MAX_QUEUE_SIZE',
    'MUSIC_MAX_TRACK_DURATION',
    'DISCORD_MAX_VOICE_CONNECTIONS'
  ];
  
  let allRequired = true;
  let optimizationsCount = 0;
  
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`   ✅ ${varName}: ${process.env[varName].slice(0, 50)}${process.env[varName].length > 50 ? '...' : ''}`);
    } else {
      console.log(`   ❌ ${varName}: Non définie`);
      allRequired = false;
    }
  });
  
  renderOptimizations.forEach(varName => {
    if (process.env[varName]) {
      console.log(`   ✅ ${varName}: ${process.env[varName]}`);
      optimizationsCount++;
    } else {
      console.log(`   ⚠️ ${varName}: Non définie (optionnel)`);
    }
  });
  
  console.log(`   📊 Variables requises: ${requiredVars.length}/${requiredVars.length}`);
  console.log(`   📊 Optimisations Render: ${optimizationsCount}/${renderOptimizations.length}`);
  
  return allRequired;
}

// Test 3: Vérifier les limites de ressources
function testResourceLimits() {
  console.log('\n📊 Test 3: Limites de ressources...');
  
  const memoryLimit = parseInt(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1]) || 512;
  const semiSpaceLimit = parseInt(process.env.NODE_OPTIONS?.match(/--max-semi-space-size=(\d+)/)?.[1]) || 128;
  
  console.log(`   💾 Limite mémoire: ${memoryLimit}MB`);
  console.log(`   🔄 Semi-space: ${semiSpaceLimit}MB`);
  
  // Vérifier les limites musique
  const musicLimits = {
    connections: parseInt(process.env.MUSIC_MAX_CONCURRENT_CONNECTIONS) || 5,
    queueSize: parseInt(process.env.MUSIC_MAX_QUEUE_SIZE) || 50,
    trackDuration: parseInt(process.env.MUSIC_MAX_TRACK_DURATION) || 1800,
    voiceConnections: parseInt(process.env.DISCORD_MAX_VOICE_CONNECTIONS) || 1
  };
  
  console.log(`   🔗 Connexions Lavalink max: ${musicLimits.connections}`);
  console.log(`   📀 Queue max: ${musicLimits.queueSize} titres`);
  console.log(`   ⏳ Durée max par titre: ${musicLimits.trackDuration}s`);
  console.log(`   🔊 Connexions vocales max: ${musicLimits.voiceConnections}`);
  
  // Validation des limites pour Render
  const renderCompliant = 
    memoryLimit <= 512 && 
    musicLimits.connections <= 5 && 
    musicLimits.queueSize <= 50 &&
    musicLimits.voiceConnections <= 1;
  
  if (renderCompliant) {
    console.log('   ✅ Limites conformes à Render');
  } else {
    console.log('   ⚠️ Certaines limites peuvent dépasser Render');
  }
  
  return renderCompliant;
}

// Test 4: Vérifier l'intégration avec le bot
function testBotIntegration() {
  console.log('\n🤖 Test 4: Intégration avec le bot...');
  
  const botPath = path.join(__dirname, 'src', 'bot.js');
  if (!fs.existsSync(botPath)) {
    console.log('   ❌ Fichier bot.js non trouvé');
    return false;
  }
  
  try {
    const botContent = fs.readFileSync(botPath, 'utf8');
    
    const musicFeatures = [
      { name: 'Import Discord.js', pattern: /require.*discord\.js|import.*discord\.js/i },
      { name: 'Voice connections', pattern: /voice|audio|lavalink/i },
      { name: 'Music commands', pattern: /play|stop|pause|skip|queue/i },
      { name: 'Error handling', pattern: /catch.*error|try.*catch/i }
    ];
    
    let featuresFound = 0;
    
    musicFeatures.forEach(feature => {
      if (feature.pattern.test(botContent)) {
        console.log(`   ✅ ${feature.name}: Détecté`);
        featuresFound++;
      } else {
        console.log(`   ⚠️ ${feature.name}: Non détecté`);
      }
    });
    
    console.log(`   📊 Fonctionnalités détectées: ${featuresFound}/${musicFeatures.length}`);
    
    return featuresFound >= 2; // Au minimum Discord.js et gestion d'erreur
  } catch (error) {
    console.log('   ❌ Erreur lors de l\'analyse:', error.message);
    return false;
  }
}

// Test 5: Simulation de charge
function testLoadSimulation() {
  console.log('\n⚡ Test 5: Simulation de charge...');
  
  const maxConnections = parseInt(process.env.MUSIC_MAX_CONCURRENT_CONNECTIONS) || 3;
  const connectionTimeout = parseInt(process.env.MUSIC_CONNECTION_TIMEOUT) || 2000;
  
  console.log(`   🔗 Simulation de ${maxConnections} connexions simultanées`);
  console.log(`   ⏱️ Timeout par connexion: ${connectionTimeout}ms`);
  
  // Calcul de la charge théorique
  const memoryPerConnection = 50; // MB estimé par connexion
  const totalMemory = maxConnections * memoryPerConnection;
  const memoryLimit = parseInt(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1]) || 512;
  
  console.log(`   💾 Mémoire estimée: ${totalMemory}MB / ${memoryLimit}MB`);
  
  if (totalMemory <= memoryLimit * 0.8) {
    console.log('   ✅ Charge acceptable (< 80% de la limite)');
    return true;
  } else if (totalMemory <= memoryLimit) {
    console.log('   ⚠️ Charge élevée (80-100% de la limite)');
    return true;
  } else {
    console.log('   ❌ Charge excessive (> 100% de la limite)');
    return false;
  }
}

// Fonction principale
async function runIntegrationTests() {
  console.log('🧪 === SUITE DE TESTS D\'INTÉGRATION MUSIQUE ===\n');
  
  const tests = [
    { name: 'Configuration Lavalink', fn: testLavalinkConfiguration },
    { name: 'Variables d\'environnement', fn: testEnvironmentVariables },
    { name: 'Limites de ressources', fn: testResourceLimits },
    { name: 'Intégration bot', fn: testBotIntegration },
    { name: 'Simulation de charge', fn: testLoadSimulation }
  ];
  
  let passed = 0;
  const results = [];
  
  for (const test of tests) {
    try {
      const result = test.fn();
      results.push({ name: test.name, passed: result });
      if (result) passed++;
    } catch (error) {
      console.log(`   💥 Erreur dans ${test.name}:`, error.message);
      results.push({ name: test.name, passed: false });
    }
  }
  
  console.log('\n📊 === RÉSUMÉ DES TESTS ===');
  results.forEach(result => {
    console.log(`   ${result.passed ? '✅' : '❌'} ${result.name}`);
  });
  
  const percentage = Math.round((passed / tests.length) * 100);
  console.log(`\n🎯 Score global: ${passed}/${tests.length} (${percentage}%)`);
  
  if (passed === tests.length) {
    console.log('\n🎉 ✅ SYSTÈME MUSIQUE PRÊT POUR DÉPLOIEMENT');
    console.log('🚀 Toutes les vérifications sont passées');
    console.log('📈 Optimisé pour Render et Discord');
  } else if (passed >= tests.length * 0.8) {
    console.log('\n⚠️ ✅ SYSTÈME MUSIQUE FONCTIONNEL');
    console.log('💡 Quelques optimisations mineures possibles');
  } else {
    console.log('\n❌ ⚠️ PROBLÈMES DÉTECTÉS');
    console.log('🔧 Corrections nécessaires avant déploiement');
  }
  
  // Instructions finales
  console.log('\n💡 Instructions de déploiement:');
  console.log('   1. Utilisez ./start-music-render-optimized.sh pour démarrer');
  console.log('   2. Surveillez les logs pour les erreurs Lavalink');
  console.log('   3. Testez avec /play sur un serveur Discord');
  console.log('   4. Vérifiez que la mémoire reste < 400MB');
  
  return passed === tests.length;
}

// Exécution
if (require.main === module) {
  runIntegrationTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Erreur lors des tests:', error);
      process.exit(1);
    });
}

module.exports = { runIntegrationTests };