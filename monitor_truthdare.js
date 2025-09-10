const fs = require('fs');
const { getTruthDareConfig, addTdPrompts } = require('./src/storage/jsonStore');

/**
 * Monitore les changements dans les prompts Truth/Dare
 */

async function monitorTruthDare() {
  const guildId = '1360897918504271882';
  
  console.log('🔍 Monitoring Truth/Dare prompts...\n');
  
  // Ajouter un prompt de test
  console.log('📦 Ajout d\'un prompt de test...');
  await addTdPrompts(guildId, 'action', ['TEST MONITORING - ' + Date.now()], 'sfw');
  
  // Monitorer pendant 60 secondes
  for (let i = 0; i < 12; i++) {
    const config = await getTruthDareConfig(guildId);
    const sfwCount = config.sfw?.prompts?.length || 0;
    const nsfwCount = config.nsfw?.prompts?.length || 0;
    
    console.log(`${new Date().toLocaleTimeString()} - SFW: ${sfwCount}, NSFW: ${nsfwCount}`);
    
    if (sfwCount === 0 && i > 0) {
      console.log('❌ PROMPTS EFFACÉS DÉTECTÉS !');
      
      // Vérifier le fichier directement
      const fileContent = JSON.parse(fs.readFileSync('./data/config.json', 'utf8'));
      const filePrompts = fileContent.guilds?.[guildId]?.truthdare?.sfw?.prompts?.length || 0;
      console.log(`   Prompts dans le fichier: ${filePrompts}`);
      
      if (filePrompts === 0) {
        console.log('   → Les prompts ont été effacés du fichier lui-même');
      } else {
        console.log('   → Le fichier contient encore les prompts, problème de lecture');
      }
      
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Attendre 5 secondes
  }
  
  console.log('\n✅ Monitoring terminé');
}

// Exécuter le monitoring
if (require.main === module) {
  monitorTruthDare().catch(console.error);
}