const { addTdPrompts, getTruthDareConfig, deleteTdPrompts } = require('./src/storage/jsonStore');

/**
 * Test de persistance des prompts Truth/Dare
 */

async function testTruthDarePersistence() {
  console.log('🧪 Test de persistance Truth/Dare...\n');
  
  const guildId = '1360897918504271882'; // ID du serveur
  
  try {
    // 1. Vérifier la config actuelle
    console.log('📋 1. Configuration actuelle:');
    const currentConfig = await getTruthDareConfig(guildId);
    console.log('   SFW prompts:', currentConfig.sfw?.prompts?.length || 0);
    console.log('   NSFW prompts:', currentConfig.nsfw?.prompts?.length || 0);
    console.log('   SFW nextId:', currentConfig.sfw?.nextId || 1);
    console.log('   NSFW nextId:', currentConfig.nsfw?.nextId || 1);
    
    // 2. Ajouter des prompts de test
    console.log('\n📦 2. Ajout de prompts de test...');
    
    const testPromptsSfw = [
      'Test Action SFW 1',
      'Test Action SFW 2'
    ];
    
    const testPromptsNsfw = [
      'Test Action NSFW 1',
      'Test Vérité NSFW 1'
    ];
    
    // Ajouter SFW
    const resultSfw = await addTdPrompts(guildId, 'action', testPromptsSfw, 'sfw');
    console.log('   SFW ajoutés:', resultSfw.length, 'prompts');
    
    // Ajouter NSFW
    const resultNsfw = await addTdPrompts(guildId, 'action', testPromptsNsfw, 'nsfw');
    console.log('   NSFW ajoutés:', resultNsfw.length, 'prompts');
    
    // 3. Vérifier après ajout
    console.log('\n🔍 3. Vérification après ajout:');
    const afterConfig = await getTruthDareConfig(guildId);
    console.log('   SFW prompts:', afterConfig.sfw?.prompts?.length || 0);
    console.log('   NSFW prompts:', afterConfig.nsfw?.prompts?.length || 0);
    
    // Afficher les prompts ajoutés
    if (afterConfig.sfw?.prompts?.length > 0) {
      console.log('   SFW détails:');
      afterConfig.sfw.prompts.slice(-2).forEach(p => {
        console.log(`     ID ${p.id}: ${p.text} (${p.type})`);
      });
    }
    
    if (afterConfig.nsfw?.prompts?.length > 0) {
      console.log('   NSFW détails:');
      afterConfig.nsfw.prompts.slice(-2).forEach(p => {
        console.log(`     ID ${p.id}: ${p.text} (${p.type})`);
      });
    }
    
    // 4. Vérifier la persistance en relisant le fichier
    console.log('\n💾 4. Vérification persistance (lecture fichier):');
    const fs = require('fs');
    const configFile = JSON.parse(fs.readFileSync('./data/config.json', 'utf8'));
    const guildData = configFile.guilds?.[guildId]?.truthdare;
    
    if (guildData) {
      console.log('   SFW dans fichier:', guildData.sfw?.prompts?.length || 0);
      console.log('   NSFW dans fichier:', guildData.nsfw?.prompts?.length || 0);
    } else {
      console.log('   ❌ Pas de données truthdare dans le fichier');
    }
    
    console.log('\n✅ Test terminé');
    
  } catch (error) {
    console.error('❌ Erreur durant le test:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Exécuter le test
if (require.main === module) {
  testTruthDarePersistence();
}