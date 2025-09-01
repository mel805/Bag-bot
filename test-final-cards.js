// Test final des cartes d'annonce avec le vrai logo BAG
const { renderLevelCardLandscape } = require('./src/level-landscape');
const { renderPrestigeCardRoseGoldLandscape } = require('./src/prestige-rose-gold-landscape');
const { renderPrestigeCardBlueLandscape } = require('./src/prestige-blue-landscape');
const fs = require('fs');

async function testAllCards() {
  console.log('🎨 Test final des cartes d\'annonce avec bag.png...');
  
  // Vérifier que bag.png existe
  if (!fs.existsSync('./bag.png')) {
    console.error('❌ Fichier bag.png non trouvé !');
    console.log('💡 Veuillez ajouter le fichier bag.png à la racine du projet');
    return false;
  }
  
  console.log('✅ Fichier bag.png trouvé');
  
  const testOptions = {
    memberName: 'TestUser',
    level: 42,
    roleName: 'Membre VIP',
    logoUrl: './bag.png'
  };
  
  try {
    // Test carte niveau certifiée (doré)
    console.log('🔍 Test carte niveau certifiée...');
    const certifiedCard = await renderLevelCardLandscape({
      ...testOptions,
      isCertified: true
    });
    fs.writeFileSync('./output/test-certified-level.png', certifiedCard);
    console.log('✅ Carte certifiée créée: ./output/test-certified-level.png');
    
    // Test carte niveau femme (rose gold)
    console.log('🔍 Test carte niveau femme...');
    const femaleCard = await renderPrestigeCardRoseGoldLandscape({
      memberName: testOptions.memberName,
      level: testOptions.level,
      lastRole: testOptions.roleName,
      logoUrl: testOptions.logoUrl,
      bgLogoUrl: testOptions.logoUrl
    });
    fs.writeFileSync('./output/test-female-level.png', femaleCard);
    console.log('✅ Carte femme créée: ./output/test-female-level.png');
    
    // Test carte niveau standard (bleu)
    console.log('🔍 Test carte niveau standard...');
    const standardCard = await renderPrestigeCardBlueLandscape({
      memberName: testOptions.memberName,
      level: testOptions.level,
      lastRole: testOptions.roleName,
      logoUrl: testOptions.logoUrl,
      bgLogoUrl: testOptions.logoUrl
    });
    fs.writeFileSync('./output/test-standard-level.png', standardCard);
    console.log('✅ Carte standard créée: ./output/test-standard-level.png');
    
    // Test carte rôle récompense
    console.log('🔍 Test carte rôle récompense...');
    const roleCard = await renderLevelCardLandscape({
      ...testOptions,
      level: 0,
      isRoleAward: true,
      isCertified: true
    });
    fs.writeFileSync('./output/test-role-reward.png', roleCard);
    console.log('✅ Carte rôle récompense créée: ./output/test-role-reward.png');
    
    console.log('🎉 Tous les tests réussis !');
    console.log('📁 Vérifiez les cartes dans le dossier ./output/');
    
    return true;
    
  } catch (error) {
    console.error('❌ Erreur lors des tests:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

testAllCards().then((success) => {
  if (success) {
    console.log('✨ Le système de cartes d\'annonce est maintenant prêt !');
    process.exit(0);
  } else {
    console.log('💥 Des erreurs ont été détectées');
    process.exit(1);
  }
}).catch(console.error);