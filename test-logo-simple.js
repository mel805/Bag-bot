// Test simple de chargement du logo Discord
const { loadImage } = require('@napi-rs/canvas');

const LOGO_URL = 'https://cdn.discordapp.com/attachments/1408458115283812484/1411752143173714040/IMG_20250831_183646.png';

async function testLogoLoadingSimple() {
  console.log('🔍 Test simple de chargement du logo...');
  console.log('URL:', LOGO_URL);
  
  try {
    console.log('⏳ Tentative de chargement...');
    const startTime = Date.now();
    const img = await loadImage(LOGO_URL);
    const endTime = Date.now();
    
    console.log('✅ Logo chargé avec succès !');
    console.log('📏 Dimensions:', img.width, 'x', img.height);
    console.log('⏱️ Temps de chargement:', (endTime - startTime), 'ms');
    
    return true;
    
  } catch (error) {
    console.error('❌ Erreur lors du chargement du logo:');
    console.error('Type:', error.constructor.name);
    console.error('Message:', error.message);
    
    if (error.code) {
      console.error('Code:', error.code);
    }
    
    return false;
  }
}

// Timeout de 10 secondes
const timeout = setTimeout(() => {
  console.error('❌ Timeout après 10 secondes');
  process.exit(1);
}, 10000);

testLogoLoadingSimple().then((success) => {
  clearTimeout(timeout);
  if (success) {
    console.log('🎉 Test réussi !');
    process.exit(0);
  } else {
    console.log('💥 Test échoué !');
    process.exit(1);
  }
}).catch((error) => {
  clearTimeout(timeout);
  console.error('💥 Erreur inattendue:', error);
  process.exit(1);
});