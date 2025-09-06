#!/usr/bin/env node

/**
 * Test de connectivité des nœuds Lavalink
 * Vérifie que les nouveaux nœuds sont accessibles et fonctionnels
 */

const { WebSocket } = require('ws');
const https = require('https');
const http = require('http');

// Configuration des nœuds à tester
const nodes = [
  {
    identifier: 'insouciant-dev',
    host: 'lavalink.insouciant.dev',
    port: 443,
    password: 'insouciant.dev',
    secure: true
  },
  {
    identifier: 'darrennathanael',
    host: 'lavalink.darrennathanael.com',
    port: 443,
    password: 'darrennathanael.com',
    secure: true
  },
  {
    identifier: 'botsuniversity',
    host: 'lavalink.botsuniversity.ml',
    port: 443,
    password: 'botsuniversity.ml',
    secure: true
  },
  {
    identifier: 'ajieblogs-v4-80-backup',
    host: 'lava-v4.ajieblogs.eu.org',
    port: 80,
    password: 'https://dsc.gg/ajidevserver',
    secure: false
  },
  {
    identifier: 'ajieblogs-v3-80-backup',
    host: 'lava-v3.ajieblogs.eu.org',
    port: 80,
    password: 'https://dsc.gg/ajidevserver',
    secure: false
  }
];

async function testNode(node) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const protocol = node.secure ? 'wss' : 'ws';
    const url = `${protocol}://${node.host}:${node.port}/v4/websocket`;
    
    console.log(`[Test] Testing ${node.identifier} (${node.host}:${node.port})...`);
    
    const ws = new WebSocket(url, {
      headers: {
        'Authorization': node.password,
        'User-Id': '123456789',
        'Client-Name': 'Lavalink-Test-Client'
      }
    });
    
    const timeout = setTimeout(() => {
      ws.close();
      resolve({
        node: node.identifier,
        status: 'timeout',
        latency: Date.now() - startTime,
        error: 'Connection timeout after 10 seconds'
      });
    }, 10000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;
      console.log(`[Test] ✅ ${node.identifier} connected (${latency}ms)`);
      ws.close();
      resolve({
        node: node.identifier,
        status: 'connected',
        latency: latency,
        error: null
      });
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;
      console.log(`[Test] ❌ ${node.identifier} failed: ${error.message}`);
      resolve({
        node: node.identifier,
        status: 'error',
        latency: latency,
        error: error.message
      });
    });
    
    ws.on('close', (code, reason) => {
      if (code !== 1000) {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        console.log(`[Test] ❌ ${node.identifier} closed: ${code} ${reason}`);
        resolve({
          node: node.identifier,
          status: 'closed',
          latency: latency,
          error: `Connection closed: ${code} ${reason}`
        });
      }
    });
  });
}

async function testHttpEndpoint(node) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const protocol = node.secure ? https : http;
    const url = `${node.secure ? 'https' : 'http'}://${node.host}:${node.port}/version`;
    
    const req = protocol.get(url, {
      headers: {
        'Authorization': node.password
      },
      timeout: 5000
    }, (res) => {
      const latency = Date.now() - startTime;
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`[HTTP] ✅ ${node.identifier} HTTP OK (${latency}ms) - Version: ${data.trim()}`);
        resolve({
          node: node.identifier,
          status: 'http_ok',
          latency: latency,
          version: data.trim(),
          error: null
        });
      });
    });
    
    req.on('error', (error) => {
      const latency = Date.now() - startTime;
      console.log(`[HTTP] ❌ ${node.identifier} HTTP failed: ${error.message}`);
      resolve({
        node: node.identifier,
        status: 'http_error',
        latency: latency,
        error: error.message
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      const latency = Date.now() - startTime;
      console.log(`[HTTP] ❌ ${node.identifier} HTTP timeout (${latency}ms)`);
      resolve({
        node: node.identifier,
        status: 'http_timeout',
        latency: latency,
        error: 'HTTP request timeout'
      });
    });
  });
}

async function main() {
  console.log('🔍 Testing Lavalink Node Connectivity...\n');
  
  const results = [];
  
  for (const node of nodes) {
    console.log(`\n--- Testing ${node.identifier} ---`);
    
    // Test WebSocket connection
    const wsResult = await testNode(node);
    results.push(wsResult);
    
    // Test HTTP endpoint
    const httpResult = await testHttpEndpoint(node);
    results.push(httpResult);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  
  const connectedNodes = results.filter(r => r.status === 'connected' || r.status === 'http_ok');
  const failedNodes = results.filter(r => r.status !== 'connected' && r.status !== 'http_ok');
  
  console.log(`✅ Working nodes: ${connectedNodes.length}`);
  console.log(`❌ Failed nodes: ${failedNodes.length}`);
  
  if (connectedNodes.length > 0) {
    console.log('\n✅ Working Nodes:');
    connectedNodes.forEach(result => {
      console.log(`  - ${result.node}: ${result.latency}ms (${result.status})`);
    });
  }
  
  if (failedNodes.length > 0) {
    console.log('\n❌ Failed Nodes:');
    failedNodes.forEach(result => {
      console.log(`  - ${result.node}: ${result.error}`);
    });
  }
  
  console.log('\n🎯 Recommendation:');
  if (connectedNodes.length >= 2) {
    console.log('✅ Multiple working nodes found - bot should work reliably');
  } else if (connectedNodes.length === 1) {
    console.log('⚠️  Only one working node - consider adding more backup nodes');
  } else {
    console.log('❌ No working nodes found - check network connectivity or use local Lavalink');
  }
  
  process.exit(connectedNodes.length > 0 ? 0 : 1);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

main().catch(console.error);