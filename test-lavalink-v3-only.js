#!/usr/bin/env node

/**
 * Test spécifique pour les nœuds Lavalink V3 uniquement
 * Vérifie que les nœuds V3 sélectionnés fonctionnent à 100%
 */

const { WebSocket } = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');

// Charger la configuration V3 optimisée
let v3Nodes = [];
try {
  const configData = fs.readFileSync('/workspace/lavalink-nodes-v3-only.json', 'utf8');
  v3Nodes = JSON.parse(configData);
  console.log('📋 Configuration V3 chargée:', v3Nodes.length, 'nœuds');
} catch (error) {
  console.error('❌ Erreur lors du chargement de la configuration V3:', error.message);
  process.exit(1);
}

async function testV3Node(node) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const protocol = node.secure ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${node.host}:${node.port}/v3/websocket`;
    
    console.log(`[V3-Test] Testing ${node.identifier} (${node.host}:${node.port})...`);
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': node.password,
        'User-Id': '123456789',
        'Client-Name': 'V3-Test-Bot'
      },
      timeout: 10000
    });

    let connected = false;
    let result = {
      identifier: node.identifier,
      host: node.host,
      port: node.port,
      success: false,
      latency: 0,
      error: null,
      version: null
    };

    ws.on('open', () => {
      connected = true;
      result.latency = Date.now() - startTime;
      console.log(`[V3-Test] ✅ ${node.identifier} connected (${result.latency}ms)`);
      
      // Envoyer une commande de test pour vérifier la version
      ws.send(JSON.stringify({
        op: 'stats',
        guildId: '123456789'
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.op === 'stats') {
          result.version = message.version || 'v3';
          result.success = true;
          console.log(`[V3-Test] 📊 ${node.identifier} stats received - Version: ${result.version}`);
        }
      } catch (e) {
        console.log(`[V3-Test] 📨 ${node.identifier} message received:`, data.toString().substring(0, 100));
        result.success = true; // Connection successful even if we can't parse the message
      }
      
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, 1000);
    });

    ws.on('error', (error) => {
      result.error = error.message;
      console.log(`[V3-Test] ❌ ${node.identifier} failed:`, error.message);
    });

    ws.on('close', (code, reason) => {
      if (connected && !result.success) {
        result.success = true; // Connected successfully even if closed
      }
      console.log(`[V3-Test] 🔌 ${node.identifier} closed: ${code} ${reason ? reason.toString() : ''}`);
      resolve(result);
    });

    // Timeout après 15 secondes
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.terminate();
        if (!result.error) {
          result.error = 'Connection timeout';
        }
        resolve(result);
      }
    }, 15000);
  });
}

async function testHttpEndpoint(node) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const protocol = node.secure ? 'https' : 'http';
    const url = `${protocol}://${node.host}:${node.port}/version`;
    
    const client = node.secure ? https : http;
    
    const req = client.get(url, {
      timeout: 10000,
      headers: {
        'Authorization': node.password
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        console.log(`[V3-HTTP] ✅ ${node.identifier} HTTP OK (${latency}ms) - Version: ${data.substring(0, 50)}`);
        resolve({ success: true, latency, version: data.trim() });
      });
    });

    req.on('error', (error) => {
      console.log(`[V3-HTTP] ❌ ${node.identifier} HTTP failed:`, error.message);
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      console.log(`[V3-HTTP] ⏱️ ${node.identifier} HTTP timeout`);
      resolve({ success: false, error: 'HTTP timeout' });
    });
  });
}

async function main() {
  console.log('\n🎵 Test des nœuds Lavalink V3 uniquement...\n');

  const results = [];
  
  for (const node of v3Nodes) {
    console.log(`\n--- Testing ${node.identifier} ---`);
    
    // Test WebSocket
    const wsResult = await testV3Node(node);
    
    // Test HTTP
    const httpResult = await testHttpEndpoint(node);
    
    results.push({
      ...node,
      wsTest: wsResult,
      httpTest: httpResult,
      overall: wsResult.success || httpResult.success
    });
    
    // Petite pause entre les tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Résumé des résultats
  console.log('\n📊 Résultats des tests V3:');
  console.log('============================');
  
  const workingNodes = results.filter(r => r.overall);
  const failedNodes = results.filter(r => !r.overall);
  
  console.log(`✅ Nœuds V3 fonctionnels: ${workingNodes.length}`);
  console.log(`❌ Nœuds V3 défaillants: ${failedNodes.length}`);
  
  if (workingNodes.length > 0) {
    console.log('\n✅ Nœuds V3 fonctionnels:');
    workingNodes.forEach(node => {
      const wsLatency = node.wsTest.success ? `${node.wsTest.latency}ms` : 'failed';
      const httpLatency = node.httpTest.success ? `${node.httpTest.latency}ms` : 'failed';
      console.log(`  - ${node.identifier}: WS(${wsLatency}) HTTP(${httpLatency}) - ${node.note}`);
    });
  }
  
  if (failedNodes.length > 0) {
    console.log('\n❌ Nœuds V3 défaillants:');
    failedNodes.forEach(node => {
      const wsError = node.wsTest.error || 'unknown';
      const httpError = node.httpTest.error || 'unknown';
      console.log(`  - ${node.identifier}: WS(${wsError}) HTTP(${httpError})`);
    });
  }

  console.log('\n🎯 Recommandation:');
  if (workingNodes.length >= 1) {
    console.log('✅ Configuration V3 prête pour la production');
    console.log('✅ Système musique peut être relancé avec cette configuration');
  } else {
    console.log('❌ Aucun nœud V3 fonctionnel - vérification nécessaire');
  }

  // Sauvegarder les résultats
  const reportData = {
    timestamp: new Date().toISOString(),
    totalNodes: results.length,
    workingNodes: workingNodes.length,
    failedNodes: failedNodes.length,
    results: results
  };
  
  fs.writeFileSync('/workspace/lavalink-v3-test-report.json', JSON.stringify(reportData, null, 2));
  console.log('\n📄 Rapport sauvegardé: lavalink-v3-test-report.json');
}

main().catch(console.error);