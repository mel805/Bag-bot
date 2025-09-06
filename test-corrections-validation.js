#!/usr/bin/env node

/**
 * Script de validation des corrections anti-blocage
 * Version améliorée avec patterns de recherche plus précis
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validation des corrections anti-blocage...\n');

function validateCorrections() {
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  if (!fs.existsSync(botJsPath)) {
    console.error('❌ Fichier bot.js non trouvé');
    return false;
  }
  
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  const corrections = [
    {
      name: 'Timeout optimisé (800ms)',
      pattern: /timeoutMs = 800/,
      status: false
    },
    {
      name: 'AbortController implémenté',
      pattern: /controller\.abort\(\)/,
      status: false
    },
    {
      name: 'Éviter double defer',
      pattern: /!hasDeferred.*tromper.*orgie/,
      status: false
    },
    {
      name: 'Fallback d\'urgence Tromper',
      pattern: /emergency.*fallback.*Tromper/,
      status: false
    },
    {
      name: 'Fallback d\'urgence Orgie',
      pattern: /emergency.*fallback.*Orgie/,
      status: false
    },
    {
      name: 'Clear fallback timer amélioré',
      pattern: /clearFallbackTimer.*tous.*timers/,
      status: false
    },
    {
      name: 'Multiple tentatives de réponse',
      pattern: /Attempting.*direct reply|Attempting.*editReply|Attempting.*followUp/,
      status: false
    },
    {
      name: 'Timeout strict pour orgie (700ms)',
      pattern: /setTimeout.*abort.*700/,
      status: false
    },
    {
      name: 'Limite réduite fetch (15-20)',
      pattern: /limit.*1[5-9]|limit.*20/,
      status: false
    },
    {
      name: 'Gestion d\'erreur avec stack trace',
      pattern: /Stack trace.*error/,
      status: false
    }
  ];
  
  // Vérifier chaque correction
  corrections.forEach(correction => {
    correction.status = correction.pattern.test(content);
  });
  
  console.log('📋 État des corrections:');
  corrections.forEach(correction => {
    const status = correction.status ? '✅' : '❌';
    console.log(`   ${status} ${correction.name}`);
  });
  
  const passedCount = corrections.filter(c => c.status).length;
  const totalCount = corrections.length;
  const percentage = Math.round((passedCount / totalCount) * 100);
  
  console.log(`\n📊 Score: ${passedCount}/${totalCount} (${percentage}%)\n`);
  
  return { corrections, passedCount, totalCount, percentage };
}

function analyzePerformance() {
  console.log('⚡ Analyse des améliorations de performance...');
  
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  const improvements = [
    {
      name: 'Cache prioritaire',
      pattern: /cache.*filter.*bot.*user\.id/,
      description: 'Utilisation du cache Discord en priorité'
    },
    {
      name: 'Fetch limité',
      pattern: /limit.*1[5-9]|limit.*20/,
      description: 'Limites réduites pour les requêtes'
    },
    {
      name: 'Timeouts stricts',
      pattern: /timeout.*[6-8]00/,
      description: 'Timeouts courts pour éviter les blocages'
    },
    {
      name: 'Early defer',
      pattern: /Early defer.*heavy action/,
      description: 'Defer immédiat pour actions lourdes'
    }
  ];
  
  improvements.forEach(improvement => {
    const found = improvement.pattern.test(content);
    const status = found ? '✅' : '❌';
    console.log(`   ${status} ${improvement.name}: ${improvement.description}`);
  });
  
  console.log();
}

function checkCriticalFixes() {
  console.log('🚨 Vérification des corrections critiques...');
  
  const botJsPath = path.join(__dirname, 'src', 'bot.js');
  const content = fs.readFileSync(botJsPath, 'utf8');
  
  const criticalFixes = [
    {
      name: 'Fonction fetchMembersWithTimeout optimisée',
      check: () => {
        return content.includes('fetchMembersWithTimeout') && 
               content.includes('controller.abort()') &&
               content.includes('timeoutMs = 800');
      }
    },
    {
      name: 'Gestion d\'erreur robuste pour tromper',
      check: () => {
        return content.includes('[Tromper] Using emergency fallback') &&
               content.includes('respondAndUntrack({ content: emergencyMsg })');
      }
    },
    {
      name: 'Gestion d\'erreur robuste pour orgie',
      check: () => {
        return content.includes('[Orgie] Using emergency fallback') &&
               content.includes('setTimeout(() => controller.abort(), 700)');
      }
    },
    {
      name: 'Multiple tentatives de réponse finale',
      check: () => {
        return content.includes('Attempting direct reply') &&
               content.includes('Attempting editReply') &&
               content.includes('Attempting followUp');
      }
    },
    {
      name: 'Éviter double defer',
      check: () => {
        return content.includes('!hasDeferred') &&
               content.includes('tromper') &&
               content.includes('orgie');
      }
    }
  ];
  
  let criticalScore = 0;
  
  criticalFixes.forEach(fix => {
    const passed = fix.check();
    const status = passed ? '✅' : '❌';
    console.log(`   ${status} ${fix.name}`);
    if (passed) criticalScore++;
  });
  
  console.log(`\n🎯 Corrections critiques: ${criticalScore}/${criticalFixes.length}\n`);
  
  return criticalScore === criticalFixes.length;
}

function generateReport() {
  console.log('📄 === RAPPORT DE VALIDATION ===\n');
  
  const { corrections, passedCount, totalCount, percentage } = validateCorrections();
  analyzePerformance();
  const criticalOK = checkCriticalFixes();
  
  console.log('🎯 === RÉSUMÉ FINAL ===');
  
  if (criticalOK && percentage >= 80) {
    console.log('🎉 SUCCÈS: Toutes les corrections critiques sont appliquées !');
    console.log('✅ Le problème "bag bot réfléchit" devrait être résolu.');
    console.log('💡 Recommandations:');
    console.log('   - Testez /tromper et /orgie en conditions réelles');
    console.log('   - Surveillez les logs [Tromper] et [Orgie]');
    console.log('   - Vérifiez les temps de réponse < 3 secondes');
    return true;
  } else if (percentage >= 60) {
    console.log('⚠️ PARTIEL: La plupart des corrections sont appliquées.');
    console.log('🔧 Quelques optimisations supplémentaires recommandées.');
    return false;
  } else {
    console.log('❌ ÉCHEC: Corrections insuffisantes.');
    console.log('🚨 Le problème de blocage persiste probablement.');
    return false;
  }
}

// Exécution
if (require.main === module) {
  const success = generateReport();
  process.exit(success ? 0 : 1);
}

module.exports = { generateReport };