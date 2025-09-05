#!/usr/bin/env node

/**
 * Test simple de connectivité Lavalink sans dépendances externes
 * Optimisé pour les limites Render et Discord
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🎵 Test de connectivité Lavalink (Render optimisé)...\n');

// Charger la configuration des nœuds
const nodesPath = path.join(__dirname, 'lavalink-nodes-render-optimized.json');
let nodes = [];

try {
  nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
  console.log(`📋 ${nodes.length} nœuds chargés depuis la configuration`);
} catch (error) {
  console.error('❌ Erreur lors du chargement de la configuration:', error.message);
  process.exit(1);
}

// Fonction de test HTTP simple
function testNodeHttp(node) {
  return new Promise((resolve) => {
    const client = node.secure ? https : http;
    const timeout = node.timeout || 2000;
    
    const options = {
      hostname: node.host,
      port: node.port,
      path: '/version',
      method: 'GET',
      timeout: timeout,
      headers: {
        'Authorization': node.password,
        'User-Agent': 'BagBot-LavalinkTest/1.0'
      }
    };
    
    const startTime = Date.now();
    
    const req = client.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          success: true,
          status: res.statusCode,
          responseTime,
          data: data.slice(0, 100) // Limiter pour éviter trop d'output
        });
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'TIMEOUT',
        responseTime: timeout
      });
    });
    
    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.code || error.message,
        responseTime: Date.now() - startTime
      });
    });
    
    req.end();
  });
}

// Test tous les nœuds
async function testAllNodes() {
  console.log('🔍 Test de connectivité des nœuds...\n');
  
  const results = [];
  
  for (const node of nodes) {
    console.log(`📡 Test ${node.identifier} (${node.host}:${node.port})...`);
    
    const result = await testNodeHttp(node);
    result.node = node;
    results.push(result);
    
    if (result.success) {
      console.log(`   ✅ Connecté - ${result.responseTime}ms (Status: ${result.status})`);
      if (result.data) {
        console.log(`   📊 Réponse: ${result.data.replace(/\n/g, ' ').trim()}`);
      }
    } else {
      console.log(`   ❌ Échec - ${result.error} (${result.responseTime}ms)`);
    }
    console.log('');
  }
  
  return results;
}

// Analyse des résultats et recommandations
function analyzeResults(results) {
  console.log('📊 === ANALYSE DES RÉSULTATS ===\n');
  
  const working = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Nœuds fonctionnels: ${working.length}/${results.length}`);
  console.log(`❌ Nœuds en échec: ${failed.length}/${results.length}`);
  
  if (working.length > 0) {
    console.log('\n🎯 Nœuds recommandés pour Render:');
    working
      .sort((a, b) => a.responseTime - b.responseTime)
      .forEach((result, index) => {
        const priority = index === 0 ? 'PRIMAIRE' : index === 1 ? 'SECONDAIRE' : 'BACKUP';
        console.log(`   ${index + 1}. ${result.node.identifier} - ${result.responseTime}ms (${priority})`);
      });
    
    // Configuration optimisée pour Render
    const renderConfig = working.slice(0, 3).map((result, index) => ({
      identifier: result.node.identifier,
      host: result.node.host,
      port: result.node.port,
      password: result.node.password,
      secure: result.node.secure,
      retryAmount: 2, // Réduit pour Render
      retryDelay: 3000 + (index * 1000), // Échelonné
      priority: index + 1,
      timeout: Math.min(result.responseTime * 3, 3000), // Basé sur la performance
      note: `Render optimized - ${result.responseTime}ms avg`
    }));
    
    console.log('\n⚙️ Configuration recommandée pour RENDER:');
    console.log(JSON.stringify(renderConfig, null, 2));
    
    // Sauvegarder la configuration optimisée
    fs.writeFileSync(
      path.join(__dirname, 'lavalink-nodes-render-final.json'),
      JSON.stringify(renderConfig, null, 2)
    );
    console.log('\n💾 Configuration sauvegardée dans lavalink-nodes-render-final.json');
    
  } else {
    console.log('\n❌ Aucun nœud fonctionnel détecté');
    console.log('🔧 Vérifiez votre connexion réseau et réessayez');
  }
  
  // Limites Render et recommandations
  console.log('\n📋 === LIMITES RENDER À RESPECTER ===');
  console.log('   💾 RAM: Max 512MB (Node.js)');
  console.log('   ⏱️ Timeout: Max 30s par requête');
  console.log('   🌐 Connexions: Max 100 simultanées');
  console.log('   📊 CPU: Limité (plan gratuit)');
  console.log('   🔄 Redémarrages: Après 15min d\'inactivité');
  
  console.log('\n💡 Recommandations pour la musique:');
  console.log('   1. Utiliser maximum 2-3 nœuds simultanés');
  console.log('   2. Timeout < 3000ms par nœud');
  console.log('   3. RetryAmount <= 2 pour éviter les blocages');
  console.log('   4. Privilégier les nœuds avec SSL (port 443)');
  console.log('   5. Implémenter un fallback gracieux');
  
  return working.length > 0;
}

// Exécution principale
async function main() {
  try {
    const results = await testAllNodes();
    const hasWorking = analyzeResults(results);
    
    console.log('\n' + '='.repeat(60));
    if (hasWorking) {
      console.log('🎉 ✅ NŒUDS LAVALINK PRÊTS POUR RENDER');
      console.log('🚀 Vous pouvez maintenant activer le système musique');
    } else {
      console.log('⚠️ ❌ AUCUN NŒUD DISPONIBLE');
      console.log('🔧 Vérifiez la connectivité réseau');
    }
    
    process.exit(hasWorking ? 0 : 1);
  } catch (error) {
    console.error('💥 Erreur critique:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testAllNodes, analyzeResults };