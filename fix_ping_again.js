const fs = require('fs');

/**
 * Re-correction du problème de ping pour les actions sans cible
 */

function fixPingIssueAgain() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // Trouver et remplacer la logique de sélection automatique
  const oldLogic = `      // If not provided, auto-pick a random non-bot member (prefer same channel audience)
      if (!initialPartner) {`;

  const newLogic = `      // Auto-pick random partner ONLY for tromper and orgie actions
      if (!initialPartner && (actionKey === 'tromper' || actionKey === 'orgie')) {`;

  if (content.includes(oldLogic)) {
    content = content.replace(oldLogic, newLogic);
    console.log('✅ Logique de sélection automatique corrigée');
  } else {
    console.log('⚠️ Logique déjà corrigée ou non trouvée');
  }

  // Sauvegarder et écrire
  const backupPath = botFilePath + '.backup-ping-fix-again';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Correction ping appliquée à nouveau');

  return true;
}

// Vérifier la correction
function verifyPingFix() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    return false;
  }

  const content = fs.readFileSync(botFilePath, 'utf8');
  
  const hasCorrectLogic = content.includes("actionKey === 'tromper' || actionKey === 'orgie'");
  const hasOldLogic = content.includes("If not provided, auto-pick a random non-bot member");
  
  console.log('\n🔍 === VÉRIFICATION CORRECTION PING ===');
  console.log(`Logique corrigée: ${hasCorrectLogic ? '✅' : '❌'}`);
  console.log(`Ancienne logique: ${hasOldLogic ? '⚠️ Présente' : '✅ Supprimée'}`);
  
  return hasCorrectLogic;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Re-correction du problème de ping...\n');
  
  const success = fixPingIssueAgain();
  
  if (success) {
    const verified = verifyPingFix();
    
    if (verified) {
      console.log('\n🎉 Correction ping appliquée avec succès !');
      console.log('\n📋 Changement appliqué:');
      console.log('  ✅ Sélection automatique SEULEMENT pour tromper et orgie');
      console.log('  ✅ Autres actions sans cible → Aucun ping aléatoire');
      console.log('\n📋 Prochaines étapes:');
      console.log('  1. pm2 restart bagbot');
      console.log('  2. Tester les actions sans cible');
    } else {
      console.log('❌ Vérification échouée');
      process.exit(1);
    }
  } else {
    console.log('❌ Échec de la correction');
    process.exit(1);
  }
}

module.exports = { fixPingIssueAgain, verifyPingFix };