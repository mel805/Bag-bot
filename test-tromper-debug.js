#!/usr/bin/env node

/**
 * Script de test pour diagnostiquer le problème de la fonction tromperie
 * qui reste bloquée sur "bag bot réfléchit"
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

async function testMemberFetch() {
  console.log('🔍 Test de récupération des membres...');
  
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error('❌ Serveur non trouvé:', guildId);
      return false;
    }
    
    console.log(`📊 Serveur: ${guild.name} (${guild.id})`);
    console.log(`👥 Membres en cache: ${guild.members.cache.size}`);
    
    // Test 1: Récupération complète des membres
    console.log('\n🧪 Test 1: Récupération complète des membres...');
    const startTime = Date.now();
    
    try {
      const allMembers = await guild.members.fetch();
      const fetchTime = Date.now() - startTime;
      
      console.log(`✅ Récupération réussie en ${fetchTime}ms`);
      console.log(`👥 Total membres récupérés: ${allMembers.size}`);
      
      // Analyser les membres
      const bots = allMembers.filter(m => m.user.bot);
      const humans = allMembers.filter(m => !m.user.bot);
      
      console.log(`🤖 Bots: ${bots.size}`);
      console.log(`👤 Humains: ${humans.size}`);
      
      // Test de filtrage (logique tromperie)
      console.log('\n🧪 Test 2: Logique de filtrage tromperie...');
      const testUserId = '123456789012345678'; // ID fictif pour test
      
      const partnerCandidates = allMembers.filter(m => !m.user.bot && m.user.id !== testUserId);
      console.log(`🎯 Candidats partenaires: ${partnerCandidates.size}`);
      
      const thirdCandidates = allMembers.filter(m => !m.user.bot && m.user.id !== testUserId);
      console.log(`🎯 Candidats tiers: ${thirdCandidates.size}`);
      
      return true;
      
    } catch (error) {
      const fetchTime = Date.now() - startTime;
      console.error(`❌ Erreur récupération membres (${fetchTime}ms):`, error.message);
      console.error('Stack:', error.stack);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error.message);
    return false;
  }
}

async function testTromperLogic() {
  console.log('\n🎭 Test de la logique tromperie...');
  
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    
    // Simuler la logique tromperie
    console.log('📋 Simulation de la logique tromperie...');
    
    const startTime = Date.now();
    let partner = null;
    let third = null;
    
    try {
      console.log('[Tromper] Fetching guild members...');
      const all = await guild.members.fetch();
      console.log('[Tromper] Fetched', all.size, 'members');
      
      // Si pas de partenaire fourni, en choisir un aléatoire
      if (!partner) {
        const partnerCandidates = all.filter(m => !m.user.bot && m.user.id !== '123456789012345678');
        console.log('[Tromper] Partner candidates:', partnerCandidates.size);
        if (partnerCandidates.size > 0) {
          const arrP = Array.from(partnerCandidates.values());
          partner = arrP[Math.floor(Math.random() * arrP.length)].user;
          console.log('[Tromper] Selected partner:', partner.id);
        } else {
          console.log('[Tromper] No partner candidates available');
        }
      }
      
      // Choisir un tiers
      const thirdCandidates = all.filter(m => !m.user.bot && m.user.id !== '123456789012345678' && (!partner || m.user.id !== partner.id));
      console.log('[Tromper] Third member candidates:', thirdCandidates.size);
      if (thirdCandidates.size > 0) {
        const arrT = Array.from(thirdCandidates.values());
        third = arrT[Math.floor(Math.random() * arrT.length)].user;
        console.log('[Tromper] Selected third member:', third.id);
      } else {
        console.log('[Tromper] No third member available, will use simplified scenario');
      }
      
    } catch (e) {
      console.error('[Tromper] Error fetching members:', e?.message || e);
      console.error('[Tromper] Stack trace:', e?.stack);
      console.log('[Tromper] Continuing with simplified scenario due to fetch error');
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Logique tromperie simulée en ${totalTime}ms`);
    console.log(`👤 Partenaire: ${partner ? partner.username : 'Aucun'}`);
    console.log(`👤 Tiers: ${third ? third.username : 'Aucun'}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Erreur test tromperie:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Démarrage des tests de diagnostic tromperie...\n');
  
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
  const test1 = await testMemberFetch();
  const test2 = await testTromperLogic();
  
  // Résultats
  console.log('\n📊 Résultats des tests:');
  console.log(`   Test récupération membres: ${test1 ? '✅' : '❌'}`);
  console.log(`   Test logique tromperie: ${test2 ? '✅' : '❌'}`);
  
  if (test1 && test2) {
    console.log('\n🎉 Tous les tests sont passés !');
    console.log('💡 Le problème pourrait être lié à:');
    console.log('   - Permissions insuffisantes');
    console.log('   - Timeout de l\'interaction Discord');
    console.log('   - Problème de concurrence');
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