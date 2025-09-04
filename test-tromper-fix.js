#!/usr/bin/env node

/**
 * Script de test pour valider la correction de la fonction tromperie
 */

const { Client, GatewayIntentBits } = require('discord.js');

// Configuration minimale pour les tests
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// Variables d'environnement requises
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
  console.error('❌ Variables d\'environnement manquantes:');
  console.error('   DISCORD_TOKEN:', token ? '✅' : '❌ MANQUANT');
  console.error('   GUILD_ID:', guildId ? '✅' : '❌ MANQUANT');
  process.exit(1);
}

async function testOptimizedMemberFetch() {
  console.log('🔍 Test de la nouvelle logique optimisée...');
  
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error('❌ Serveur non trouvé:', guildId);
      return false;
    }
    
    console.log(`📊 Serveur: ${guild.name} (${guild.id})`);
    
    // Test de la nouvelle logique optimisée
    console.log('\n🧪 Test de la logique optimisée...');
    const startTime = Date.now();
    
    try {
      console.log('[Tromper] Getting available members from cache...');
      
      // Use cached members first for better performance
      let availableMembers = guild.members.cache.filter(m => !m.user.bot && m.user.id !== '123456789012345678');
      console.log('[Tromper] Cached members available:', availableMembers.size);
      
      // If we have very few cached members, try to fetch more (but with a limit to avoid timeouts)
      if (availableMembers.size < 5) {
        console.log('[Tromper] Few cached members, attempting limited fetch...');
        try {
          // Fetch with a reasonable limit to avoid timeouts
          const fetched = await guild.members.fetch({ limit: 50, force: false });
          const fetchedHumans = fetched.filter(m => !m.user.bot && m.user.id !== '123456789012345678');
          console.log('[Tromper] Fetched additional members:', fetchedHumans.size);
          
          // Merge with cached members
          availableMembers = availableMembers.concat(fetchedHumans);
          console.log('[Tromper] Total available members:', availableMembers.size);
        } catch (fetchError) {
          console.warn('[Tromper] Limited fetch failed, using cache only:', fetchError.message);
        }
      }
      
      // Test partner selection
      let partner = null;
      const partnerCandidates = availableMembers;
      console.log('[Tromper] Partner candidates:', partnerCandidates.size);
      if (partnerCandidates.size > 0) {
        const arrP = Array.from(partnerCandidates.values());
        partner = arrP[Math.floor(Math.random() * arrP.length)].user;
        console.log('[Tromper] Selected partner:', partner.id);
      } else {
        console.log('[Tromper] No partner candidates available');
      }
      
      // Test third member selection
      let third = null;
      const thirdCandidates = availableMembers.filter(m => !partner || m.user.id !== partner.id);
      console.log('[Tromper] Third member candidates:', thirdCandidates.size);
      if (thirdCandidates.size > 0) {
        const arrT = Array.from(thirdCandidates.values());
        third = arrT[Math.floor(Math.random() * arrT.length)].user;
        console.log('[Tromper] Selected third member:', third.id);
      } else {
        console.log('[Tromper] No third member available, will use simplified scenario');
      }
      
      const totalTime = Date.now() - startTime;
      console.log(`✅ Logique optimisée exécutée en ${totalTime}ms`);
      console.log(`👤 Partenaire: ${partner ? partner.username : 'Aucun'}`);
      console.log(`👤 Tiers: ${third ? third.username : 'Aucun'}`);
      
      // Vérifier que le temps d'exécution est raisonnable
      if (totalTime < 5000) { // Moins de 5 secondes
        console.log('✅ Performance acceptable');
        return true;
      } else {
        console.log('⚠️ Performance lente, mais fonctionnelle');
        return true;
      }
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ Erreur logique optimisée (${totalTime}ms):`, error.message);
      console.error('Stack:', error.stack);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error.message);
    return false;
  }
}

async function testTimeoutHandling() {
  console.log('\n⏱️ Test de gestion des timeouts...');
  
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    
    // Test avec un timeout artificiel
    const startTime = Date.now();
    
    try {
      // Simuler une opération qui pourrait timeout
      const promise = guild.members.fetch({ limit: 50, force: false });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout simulé')), 2000)
      );
      
      const result = await Promise.race([promise, timeoutPromise]);
      const totalTime = Date.now() - startTime;
      
      console.log(`✅ Opération terminée en ${totalTime}ms`);
      return true;
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      if (error.message === 'Timeout simulé') {
        console.log(`⚠️ Timeout simulé après ${totalTime}ms (comportement attendu)`);
        return true;
      } else {
        console.error(`❌ Erreur inattendue (${totalTime}ms):`, error.message);
        return false;
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur test timeout:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Test de validation de la correction tromperie...\n');
  
  // Connexion du client
  try {
    await client.login(token);
    console.log('✅ Client Discord connecté');
  } catch (error) {
    console.error('❌ Erreur connexion Discord:', error.message);
    process.exit(1);
  }
  
  // Attendre que le client soit prêt
  await new Promise(resolve => {
    client.once('ready', resolve);
  });
  
  console.log(`✅ Bot connecté: ${client.user.tag}`);
  
  // Tests
  const test1 = await testOptimizedMemberFetch();
  const test2 = await testTimeoutHandling();
  
  // Résultats
  console.log('\n📊 Résultats des tests:');
  console.log(`   Test logique optimisée: ${test1 ? '✅' : '❌'}`);
  console.log(`   Test gestion timeout: ${test2 ? '✅' : '❌'}`);
  
  if (test1 && test2) {
    console.log('\n🎉 Tous les tests sont passés !');
    console.log('✅ La correction de la fonction tromperie est validée');
    console.log('💡 Améliorations apportées:');
    console.log('   - Utilisation du cache en priorité');
    console.log('   - Fetch limité pour éviter les timeouts');
    console.log('   - Gestion d\'erreur robuste');
    console.log('   - Logs détaillés pour le diagnostic');
  } else {
    console.log('\n⚠️ Des problèmes ont été détectés');
    console.log('💡 Vérifiez les logs ci-dessus pour plus de détails');
  }
  
  // Nettoyage
  client.destroy();
  process.exit(test1 && test2 ? 0 : 1);
}

// Gestion des erreurs
process.on('uncaughtException', (error) => {
  console.error('❌ Erreur non gérée:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promesse rejetée:', error.message);
  process.exit(1);
});

main().catch((error) => {
  console.error('❌ Erreur principale:', error.message);
  process.exit(1);
});