#!/usr/bin/env node

/**
 * Script de diagnostic pour les problèmes de blocage sur Render
 * Identifie les différences entre l'environnement local et Render
 */

const fs = require('fs');
const { performance } = require('perf_hooks');

console.log('🔍 Diagnostic des problèmes Render - Commandes bloquées sur "réfléchit"');
console.log('====================================================================\n');

// 1. Analyser l'environnement
console.log('📊 ANALYSE DE L\'ENVIRONNEMENT:');
console.log('------------------------------');

const criticalEnvVars = [
  'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DATABASE_URL',
  'NODE_OPTIONS', 'PORT', 'RENDER', 'NODE_ENV'
];

const envStatus = {};
criticalEnvVars.forEach(varName => {
  const value = process.env[varName];
  envStatus[varName] = {
    present: !!value,
    length: value ? value.length : 0,
    type: typeof value
  };
  
  const status = value ? '✅' : '❌';
  const preview = value ? `(${value.length} chars)` : 'MISSING';
  console.log(`  ${status} ${varName}: ${preview}`);
});

// 2. Vérifier les ressources système
console.log('\n🖥️  RESSOURCES SYSTÈME:');
console.log('----------------------');
console.log(`  - Node.js version: ${process.version}`);
console.log(`  - Platform: ${process.platform}`);
console.log(`  - Architecture: ${process.arch}`);
console.log(`  - Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
console.log(`  - Uptime: ${Math.round(process.uptime())}s`);

// 3. Analyser les timeouts dans le code
console.log('\n⏱️  ANALYSE DES TIMEOUTS:');
console.log('-------------------------');

const botJsPath = '/workspace/src/bot.js';
let botCode = '';
try {
  botCode = fs.readFileSync(botJsPath, 'utf8');
  console.log(`  ✅ Code du bot chargé (${botCode.length} caractères)`);
} catch (error) {
  console.log(`  ❌ Erreur lecture bot.js: ${error.message}`);
  process.exit(1);
}

// Rechercher les patterns de timeout
const timeoutPatterns = [
  { name: 'setTimeout', regex: /setTimeout\([^,]+,\s*(\d+)/g },
  { name: 'AbortController timeout', regex: /setTimeout\([^}]+abort[^}]+,\s*(\d+)/g },
  { name: 'Interaction defer', regex: /deferReply\(\)/g },
  { name: 'Interaction timeout', regex: /(\d+)000.*timeout/gi },
  { name: 'Heavy actions', regex: /heavyActions.*=.*\[([^\]]+)\]/g }
];

timeoutPatterns.forEach(pattern => {
  const matches = [...botCode.matchAll(pattern.regex)];
  console.log(`  - ${pattern.name}: ${matches.length} occurrences`);
  
  if (pattern.name === 'setTimeout' && matches.length > 0) {
    const timeouts = matches.map(m => parseInt(m[1])).filter(t => !isNaN(t));
    if (timeouts.length > 0) {
      const avgTimeout = Math.round(timeouts.reduce((a, b) => a + b, 0) / timeouts.length);
      console.log(`    → Timeout moyen: ${avgTimeout}ms`);
      console.log(`    → Min/Max: ${Math.min(...timeouts)}ms / ${Math.max(...timeouts)}ms`);
    }
  }
  
  if (pattern.name === 'Heavy actions' && matches.length > 0) {
    const actions = matches[0][1].split(',').map(a => a.trim().replace(/'/g, ''));
    console.log(`    → Actions lourdes: ${actions.length} (${actions.join(', ')})`);
  }
});

// 4. Vérifier les configurations Render spécifiques
console.log('\n🚀 CONFIGURATION RENDER:');
console.log('------------------------');

const renderSpecific = {
  'NODE_OPTIONS': process.env.NODE_OPTIONS,
  'PORT': process.env.PORT,
  'RENDER': process.env.RENDER,
  'RENDER_SERVICE_ID': process.env.RENDER_SERVICE_ID,
  'RENDER_EXTERNAL_URL': process.env.RENDER_EXTERNAL_URL
};

Object.entries(renderSpecific).forEach(([key, value]) => {
  const status = value ? '✅' : '❌';
  console.log(`  ${status} ${key}: ${value || 'Non défini'}`);
});

// 5. Tester la performance de base
console.log('\n⚡ TESTS DE PERFORMANCE:');
console.log('------------------------');

async function performanceTests() {
  // Test 1: Temps de réponse JSON
  const start1 = performance.now();
  const testObj = { test: 'data', timestamp: Date.now(), nested: { array: [1,2,3,4,5] } };
  const serialized = JSON.stringify(testObj);
  const parsed = JSON.parse(serialized);
  const jsonTime = performance.now() - start1;
  console.log(`  - JSON serialize/parse: ${jsonTime.toFixed(2)}ms`);
  
  // Test 2: Timeout simulation
  const start2 = performance.now();
  await new Promise(resolve => setTimeout(resolve, 100));
  const timeoutTime = performance.now() - start2;
  console.log(`  - setTimeout(100ms) réel: ${timeoutTime.toFixed(2)}ms`);
  
  // Test 3: Memory allocation
  const start3 = performance.now();
  const bigArray = new Array(10000).fill(0).map((_, i) => ({ id: i, data: `test${i}` }));
  const allocTime = performance.now() - start3;
  console.log(`  - Allocation mémoire (10k objets): ${allocTime.toFixed(2)}ms`);
}

// 6. Diagnostiquer les problèmes spécifiques
console.log('\n🔧 DIAGNOSTIC PROBLÈMES RENDER:');
console.log('-------------------------------');

const commonIssues = [
  {
    name: 'Timeout interactions Discord (3s)',
    check: () => botCode.includes('deferReply') && botCode.includes('3000'),
    solution: 'Déférer les interactions lourdes AVANT tout traitement'
  },
  {
    name: 'Ressources limitées (512MB)',
    check: () => process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('512'),
    solution: 'Optimiser la mémoire et réduire les allocations'
  },
  {
    name: 'Réseau lent sur Render',
    check: () => botCode.includes('fetch') || botCode.includes('AbortController'),
    solution: 'Réduire les timeouts réseau et ajouter des fallbacks'
  },
  {
    name: 'Base de données PostgreSQL lente',
    check: () => process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres'),
    solution: 'Optimiser les requêtes et ajouter un cache'
  },
  {
    name: 'Actions lourdes sans defer',
    check: () => {
      const heavyActionsMatch = botCode.match(/heavyActions.*=.*\[([^\]]+)\]/);
      const deferMatch = botCode.match(/deferReply\(\)/g);
      return heavyActionsMatch && (!deferMatch || deferMatch.length < 3);
    },
    solution: 'Déférer TOUTES les actions lourdes immédiatement'
  }
];

commonIssues.forEach(issue => {
  const hasIssue = issue.check();
  const status = hasIssue ? '⚠️' : '✅';
  console.log(`  ${status} ${issue.name}`);
  if (hasIssue) {
    console.log(`      💡 Solution: ${issue.solution}`);
  }
});

// 7. Recommandations spécifiques
console.log('\n🎯 RECOMMANDATIONS POUR RENDER:');
console.log('-------------------------------');

const recommendations = [
  '1. Déférer IMMÉDIATEMENT toutes les interactions (même les plus rapides)',
  '2. Réduire tous les timeouts réseau à max 2000ms',
  '3. Ajouter des fallbacks pour toutes les opérations externes',
  '4. Optimiser les requêtes base de données avec un pool de connexions',
  '5. Implémenter un système de cache en mémoire pour les données fréquentes',
  '6. Ajouter des logs détaillés pour identifier les blocages spécifiques',
  '7. Utiliser des AbortController pour toutes les opérations async',
  '8. Séparer les tâches lourdes en micro-tâches avec yield'
];

recommendations.forEach(rec => console.log(`  ${rec}`));

// Exécuter les tests de performance
performanceTests().then(() => {
  console.log('\n📋 RÉSUMÉ:');
  console.log('----------');
  
  const issues = commonIssues.filter(issue => issue.check());
  if (issues.length > 0) {
    console.log(`❌ ${issues.length} problème(s) identifié(s) pouvant causer des blocages sur Render`);
    console.log('🔧 Application des correctifs recommandée');
  } else {
    console.log('✅ Aucun problème critique identifié');
    console.log('💡 Le problème pourrait être lié à la latence réseau Render');
  }
  
  console.log('\n📄 Rapport sauvegardé dans render-diagnosis.json');
  
  // Sauvegarder le rapport
  const report = {
    timestamp: new Date().toISOString(),
    environment: envStatus,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptime: Math.round(process.uptime())
    },
    issues: issues.map(issue => ({ name: issue.name, solution: issue.solution })),
    recommendations
  };
  
  fs.writeFileSync('/workspace/render-diagnosis.json', JSON.stringify(report, null, 2));
  
}).catch(console.error);