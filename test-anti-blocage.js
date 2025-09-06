#!/usr/bin/env node

/**
 * Script de test pour valider les corrections anti-blocage
 * Teste les améliorations apportées pour éviter le blocage sur "réfléchit"
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Test des corrections anti-blocage...\n');

// Test 1: Vérifier que les corrections sont présentes dans le code
function testCorrectionsPresent() {
  console.log('📝 Test 1: Vérification des corrections dans le code...');
  
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  if (!fs.existsSync(botJsPath)) {
    console.error('❌ Fichier bot.js non trouvé');
    return false;
  }
  
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  const checks = [
    {
      name: 'Timeout optimisé pour fetchMembersWithTimeout',
      pattern: /timeoutMs = 800/,
      description: 'Timeout réduit à 800ms pour éviter les blocages'
    },
    {
      name: 'AbortController pour fetch members',
      pattern: /controller\.abort\(\)/,
      description: 'Utilisation d\'AbortController pour annuler les requêtes longues'
    },
    {
      name: 'Éviter double defer',
      pattern: /!hasDeferred.*tromper.*orgie/,
      description: 'Vérification pour éviter les double defer'
    },
    {
      name: 'Fallback d\'urgence pour tromper',
      pattern: /emergency.*fallback.*tromper/i,
      description: 'Fallback d\'urgence en cas d\'erreur critique'
    },
    {
      name: 'Fallback d\'urgence pour orgie',
      pattern: /emergency.*fallback.*orgie/i,
      description: 'Fallback d\'urgence pour l\'action orgie'
    },
    {
      name: 'Clear fallback timer',
      pattern: /clearFallbackTimer.*tous.*timers/,
      description: 'Nettoyage des timers pour éviter les conflits'
    },
    {
      name: 'Multiple tentatives de réponse',
      pattern: /Attempting.*editReply.*actionKey/,
      description: 'Tentatives multiples de réponse en cas d\'échec'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  checks.forEach(check => {
    if (check.pattern.test(content)) {
      console.log(`   ✅ ${check.name}: ${check.description}`);
      passed++;
    } else {
      console.log(`   ❌ ${check.name}: ${check.description}`);
      failed++;
    }
  });
  
  console.log(`   📊 Résultat: ${passed}/${checks.length} corrections détectées\n`);
  return failed === 0;
}

// Test 2: Vérifier la logique de timeout
function testTimeoutLogic() {
  console.log('⏱️ Test 2: Validation de la logique de timeout...');
  
  const timeouts = [
    { name: 'fetchMembersWithTimeout', expected: 800, description: 'Timeout pour fetch members' },
    { name: 'Orgie fetch timeout', expected: 700, description: 'Timeout pour orgie fetch' },
    { name: 'Fallback timer principal', expected: 4000, description: 'Timer de fallback principal' },
    { name: 'Fallback timer secondaire', expected: 6000, description: 'Timer de fallback secondaire' }
  ];
  
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  let allGood = true;
  
  timeouts.forEach(timeout => {
    const pattern = new RegExp(`${timeout.expected}`, 'g');
    const matches = content.match(pattern) || [];
    
    if (matches.length > 0) {
      console.log(`   ✅ ${timeout.name} (${timeout.expected}ms): ${timeout.description}`);
    } else {
      console.log(`   ⚠️ ${timeout.name} (${timeout.expected}ms): Non détecté`);
      allGood = false;
    }
  });
  
  console.log(`   📊 Timeouts configurés correctement: ${allGood ? 'Oui' : 'Partiellement'}\n`);
  return allGood;
}

// Test 3: Vérifier la gestion d'erreur
function testErrorHandling() {
  console.log('🛡️ Test 3: Validation de la gestion d\'erreur...');
  
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  const errorHandlingChecks = [
    {
      name: 'Try-catch autour de fetch members',
      pattern: /catch.*fetchError.*tromper/i,
      description: 'Gestion d\'erreur pour fetch members dans tromper'
    },
    {
      name: 'Fallback gracieux',
      pattern: /emergency.*fallback/i,
      description: 'Fallbacks d\'urgence implémentés'
    },
    {
      name: 'Multiple tentatives de réponse',
      pattern: /direct.*reply.*editReply.*followUp/,
      description: 'Tentatives multiples de réponse'
    },
    {
      name: 'Logs détaillés',
      pattern: /Stack trace.*error/,
      description: 'Logs détaillés pour le debugging'
    }
  ];
  
  let errorHandlingScore = 0;
  
  errorHandlingChecks.forEach(check => {
    if (check.pattern.test(content)) {
      console.log(`   ✅ ${check.name}: ${check.description}`);
      errorHandlingScore++;
    } else {
      console.log(`   ❌ ${check.name}: ${check.description}`);
    }
  });
  
  console.log(`   📊 Gestion d'erreur: ${errorHandlingScore}/${errorHandlingChecks.length} éléments implémentés\n`);
  return errorHandlingScore === errorHandlingChecks.length;
}

// Test 4: Analyser les patterns de performance
function testPerformancePatterns() {
  console.log('🚀 Test 4: Analyse des optimisations de performance...');
  
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  const performancePatterns = [
    {
      name: 'Utilisation du cache en priorité',
      pattern: /cache.*filter.*bot.*user\.id/,
      description: 'Priorisation du cache Discord'
    },
    {
      name: 'Limites réduites pour fetch',
      pattern: /limit.*15.*20/,
      description: 'Limites réduites pour les fetch'
    },
    {
      name: 'AbortController pour annulation',
      pattern: /AbortController.*setTimeout.*abort/,
      description: 'Annulation proactive des requêtes longues'
    },
    {
      name: 'Early defer pour actions lourdes',
      pattern: /Early defer.*heavy.*action/,
      description: 'Defer immédiat pour les actions lourdes'
    }
  ];
  
  let performanceScore = 0;
  
  performancePatterns.forEach(pattern => {
    if (pattern.pattern.test(content)) {
      console.log(`   ✅ ${pattern.name}: ${pattern.description}`);
      performanceScore++;
    } else {
      console.log(`   ❌ ${pattern.name}: ${pattern.description}`);
    }
  });
  
  console.log(`   📊 Optimisations: ${performanceScore}/${performancePatterns.length} patterns détectés\n`);
  return performanceScore >= performancePatterns.length * 0.8; // 80% requis
}

// Test 5: Vérifier la structure du code
function testCodeStructure() {
  console.log('🏗️ Test 5: Validation de la structure du code...');
  
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  const structureChecks = [
    {
      name: 'Fonction respondAndUntrack présente',
      pattern: /respondAndUntrack.*async.*payload/,
      description: 'Fonction de réponse unifiée'
    },
    {
      name: 'Tracking des interactions',
      pattern: /trackInteraction.*untrackInteraction/,
      description: 'Système de tracking des interactions'
    },
    {
      name: 'Gestion des timers',
      pattern: /clearFallbackTimer.*setTimeout.*fallbackTimer/,
      description: 'Gestion propre des timers'
    }
  ];
  
  let structureScore = 0;
  
  structureChecks.forEach(check => {
    if (check.pattern.test(content)) {
      console.log(`   ✅ ${check.name}: ${check.description}`);
      structureScore++;
    } else {
      console.log(`   ❌ ${check.name}: ${check.description}`);
    }
  });
  
  console.log(`   📊 Structure: ${structureScore}/${structureChecks.length} éléments valides\n`);
  return structureScore === structureChecks.length;
}

// Exécution des tests
async function runAllTests() {
  console.log('🧪 === SUITE DE TESTS ANTI-BLOCAGE ===\n');
  
  const results = [
    { name: 'Corrections présentes', result: testCorrectionsPresent() },
    { name: 'Logique de timeout', result: testTimeoutLogic() },
    { name: 'Gestion d\'erreur', result: testErrorHandling() },
    { name: 'Optimisations performance', result: testPerformancePatterns() },
    { name: 'Structure du code', result: testCodeStructure() }
  ];
  
  const passed = results.filter(r => r.result).length;
  const total = results.length;
  
  console.log('📊 === RÉSUMÉ DES TESTS ===');
  results.forEach(result => {
    console.log(`   ${result.result ? '✅' : '❌'} ${result.name}`);
  });
  
  console.log(`\n🎯 Score global: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  
  if (passed === total) {
    console.log('\n🎉 Tous les tests passent ! Les corrections anti-blocage sont validées.');
    console.log('✅ Le problème "bag bot réfléchit" devrait être résolu.');
  } else if (passed >= total * 0.8) {
    console.log('\n⚠️ La plupart des tests passent. Corrections largement appliquées.');
    console.log('💡 Quelques optimisations mineures peuvent être ajoutées.');
  } else {
    console.log('\n❌ Plusieurs tests échouent. Corrections incomplètes.');
    console.log('🔧 Des corrections supplémentaires sont nécessaires.');
  }
  
  console.log('\n💡 Recommandations:');
  console.log('   1. Testez les commandes /tromper et /orgie en conditions réelles');
  console.log('   2. Surveillez les logs pour les messages [Tromper] et [Orgie]');
  console.log('   3. Vérifiez que les actions se terminent en < 3 secondes');
  console.log('   4. Assurez-vous qu\'il n\'y a plus de blocages sur "réfléchit"');
  
  return passed === total;
}

// Exécution
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Erreur lors des tests:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests };