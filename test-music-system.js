#!/usr/bin/env node
// Script de test pour le système musique
console.log('🎵 Test du système musique');
console.log('============================');

// Vérifier les dépendances
console.log('\n1. Vérification des dépendances...');
try {
  const WebSocket = require('ws');
  console.log('✅ WebSocket (ws) module: OK');
} catch (e) {
  console.log('❌ WebSocket (ws) module: MANQUANT');
  console.log('   Erreur:', e.message);
  process.exit(1);
}

try {
  const { Manager } = require('erela.js');
  console.log('✅ Erela.js module: OK');
} catch (e) {
  console.log('❌ Erela.js module: MANQUANT');
  console.log('   Erreur:', e.message);
  process.exit(1);
}

// Vérifier les variables d'environnement
console.log('\n2. Vérification des variables d\'environnement...');
const musicEnabled = String(process.env.ENABLE_MUSIC || 'false').toLowerCase() === 'true';
console.log('ENABLE_MUSIC:', process.env.ENABLE_MUSIC || 'non définie', musicEnabled ? '✅' : '❌');

const localLavalink = String(process.env.ENABLE_LOCAL_LAVALINK || 'false').toLowerCase() === 'true';
console.log('ENABLE_LOCAL_LAVALINK:', process.env.ENABLE_LOCAL_LAVALINK || 'non définie', localLavalink ? '✅' : '❌');

const lavalinkNodes = process.env.LAVALINK_NODES;
console.log('LAVALINK_NODES:', lavalinkNodes ? '✅ définie' : '❌ non définie');

// Tester le proxy WebSocket
console.log('\n3. Test du proxy WebSocket...');
const fs = require('fs');
const path = require('path');

const proxyPath = '/workspace/lavalink/ws-proxy.js';
if (fs.existsSync(proxyPath)) {
  console.log('✅ ws-proxy.js: TROUVÉ');
  
  // Test basique de syntaxe
  try {
    require(proxyPath);
    console.log('❌ ws-proxy.js: Le module s\'est exécuté (il ne devrait pas en mode test)');
  } catch (e) {
    if (e.message.includes('listen EADDRINUSE') || e.message.includes('ECONNREFUSED')) {
      console.log('✅ ws-proxy.js: Syntaxe OK (erreur de connexion attendue)');
    } else {
      console.log('❌ ws-proxy.js: Erreur de syntaxe -', e.message);
    }
  }
} else {
  console.log('❌ ws-proxy.js: MANQUANT');
}

// Recommandations
console.log('\n4. Recommandations...');
if (!musicEnabled) {
  console.log('🔧 Pour activer le système musique:');
  console.log('   export ENABLE_MUSIC=true');
}

if (!lavalinkNodes && !localLavalink) {
  console.log('🔧 Configuration Lavalink manquante. Choisissez une option:');
  console.log('   Option A - Lavalink distant:');
  console.log('   export LAVALINK_NODES=\'[{"identifier":"public-node","host":"lava-v3.ajieblogs.eu.org","port":80,"password":"https://dsc.gg/ajidevserver","secure":false}]\'');
  console.log('   Option B - Lavalink local:');
  console.log('   export ENABLE_LOCAL_LAVALINK=true');
  console.log('   export LAVALINK_PASSWORD=youshallnotpass');
}

console.log('\n✅ Test terminé');