#!/usr/bin/env node

/**
 * Vérification finale de toutes les corrections
 */

const fs = require('fs');

function verifyAllFixes() {
  console.log('🔍 === VÉRIFICATION COMPLÈTE DES CORRECTIONS ===\n');
  
  const botPath = './src/bot.js';
  if (!fs.existsSync(botPath)) {
    console.log('❌ Fichier bot.js introuvable');
    return false;
  }

  const content = fs.readFileSync(botPath, 'utf8');
  
  // 1. Vérifier la correction des pings
  console.log('1. 🎯 CORRECTION DES PINGS:');
  
  const hasCorrectPingLogic = content.includes('(actionKey === "tromper" || actionKey === "orgie")');
  const hasOldAutoPickComment = content.includes('Auto-pick random partner ONLY for tromper and orgie');
  const hasPartsLogic = content.includes('const parts = [(initialPartner && (actionKey === "tromper" || actionKey === "orgie")) ? String(initialPartner) : undefined];');
  
  console.log(`   Auto-pick limité tromper/orgie: ${hasCorrectPingLogic ? '✅' : '❌'}`);
  console.log(`   Commentaire explicite: ${hasOldAutoPickComment ? '✅' : '❌'}`);
  console.log(`   Logique parts corrigée: ${hasPartsLogic ? '✅' : '❌'}`);
  
  // 2. Vérifier la correction du modal
  console.log('\n2. 🎯 CORRECTION MODAL RÉCOMPENSES:');
  
  const hasModalStartsWith = content.includes("customId.startsWith('levels_reward_add_modal:')");
  const hasModalSplit = content.includes('customId.split(\':\')[1]');
  const modalLineNumber = content.split('\n').findIndex(line => line.includes("customId.startsWith('levels_reward_add_modal:')")) + 1;
  
  console.log(`   CustomId startsWith: ${hasModalStartsWith ? '✅' : '❌'}`);
  console.log(`   RoleId extraction: ${hasModalSplit ? '✅' : '❌'}`);
  if (modalLineNumber > 0) {
    console.log(`   Ligne du modal: ${modalLineNumber}`);
  }
  
  // 3. Vérifier la commande backup
  console.log('\n3. 🎯 COMMANDE /backup:');
  
  const hasBackupCommand = content.includes("commandName === 'backup'");
  const hasBackupEmbed = content.includes('Sauvegarde Forcée Créée');
  const hasBackupLogs = content.includes('logChannel.send({ embeds: [logEmbed]');
  const hasBackupAttachment = content.includes('AttachmentBuilder');
  
  console.log(`   Commande présente: ${hasBackupCommand ? '✅' : '❌'}`);
  console.log(`   Embed détaillé: ${hasBackupEmbed ? '✅' : '❌'}`);
  console.log(`   Logs automatiques: ${hasBackupLogs ? '✅' : '❌'}`);
  console.log(`   Fichiers téléchargeables: ${hasBackupAttachment ? '✅' : '❌'}`);
  
  // 4. Vérifier la commande restorer
  console.log('\n4. 🎯 COMMANDE /restorer:');
  
  const hasRestorerCommand = content.includes("commandName === 'restorer'");
  const hasRestoreSelect = content.includes("customId === 'restore_select'");
  const hasRestoreConfirm = content.includes("customId.startsWith('restore_confirm_')");
  
  console.log(`   Commande présente: ${hasRestorerCommand ? '✅' : '❌'}`);
  console.log(`   Sélecteur: ${hasRestoreSelect ? '✅' : '❌'}`);
  console.log(`   Confirmation: ${hasRestoreConfirm ? '✅' : '❌'}`);
  
  // 5. Résumé général
  console.log('\n📊 === RÉSUMÉ GÉNÉRAL ===');
  
  const allChecks = [
    hasCorrectPingLogic, hasPartsLogic, // Pings
    hasModalStartsWith, hasModalSplit,  // Modal
    hasBackupCommand, hasBackupEmbed, hasBackupLogs, // Backup
    hasRestorerCommand, hasRestoreSelect // Restorer
  ];
  
  const passedChecks = allChecks.filter(Boolean).length;
  const totalChecks = allChecks.length;
  
  console.log(`Vérifications réussies: ${passedChecks}/${totalChecks}`);
  
  if (passedChecks === totalChecks) {
    console.log('✅ TOUTES LES CORRECTIONS SONT APPLIQUÉES !');
    
    console.log('\n🎮 PRÊT À TESTER:');
    console.log('  1. Actions sans cible → Aucun ping aléatoire');
    console.log('  2. /config → Économie → Récompenses → Modal fonctionnel');
    console.log('  3. /backup → Embed détaillé avec logs et fichiers');
    console.log('  4. /restorer → Sélecteur avec vrais noms (en cours)');
    
    return true;
  } else {
    console.log('⚠️ Certaines corrections manquent encore');
    
    // Détailler ce qui manque
    const checkNames = [
      'Ping logic correct', 'Parts logic fixed',
      'Modal startsWith', 'Modal split',
      'Backup command', 'Backup embed', 'Backup logs',
      'Restorer command', 'Restore select'
    ];
    
    console.log('\nDétail des vérifications:');
    allChecks.forEach((passed, index) => {
      console.log(`  ${checkNames[index]}: ${passed ? '✅' : '❌'}`);
    });
    
    return false;
  }
}

// Si exécuté directement
if (require.main === module) {
  const allGood = verifyAllFixes();
  process.exit(allGood ? 0 : 1);
}

module.exports = { verifyAllFixes };