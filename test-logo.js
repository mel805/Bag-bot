// Test de chargement du logo Discord
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const LOGO_URL = 'https://cdn.discordapp.com/attachments/1408458115283812484/1411752143173714040/IMG_20250831_183646.png';

async function testLogoLoading() {
  console.log('🔍 Test de chargement du logo...');
  console.log('URL:', LOGO_URL);
  
  try {
    console.log('⏳ Tentative de chargement...');
    const img = await loadImage(LOGO_URL);
    console.log('✅ Logo chargé avec succès !');
    console.log('📏 Dimensions:', img.width, 'x', img.height);
    
    // Test de création d'une carte simple avec le logo
    console.log('🎨 Test de création d\'une carte simple...');
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Fond noir
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 800, 400);
    
    // Logo au centre
    const logoSize = 150;
    const logoX = 400 - logoSize/2;
    const logoY = 200 - logoSize/2;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(400, 200, logoSize/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
    ctx.restore();
    
    // Bordure dorée
    ctx.beginPath();
    ctx.arc(400, 200, logoSize/2 + 5, 0, Math.PI*2);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Texte
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Test Logo BAG', 400, 350);
    
    const buffer = canvas.toBuffer('image/png');
    require('fs').writeFileSync('./output/test-logo-result.png', buffer);
    console.log('✅ Carte de test créée: ./output/test-logo-result.png');
    
  } catch (error) {
    console.error('❌ Erreur lors du chargement du logo:');
    console.error('Type d\'erreur:', error.constructor.name);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.code) {
      console.error('Code d\'erreur:', error.code);
    }
    
    // Informations supplémentaires sur l'erreur
    if (error.message.includes('fetch')) {
      console.log('💡 Problème de réseau ou URL invalide');
    } else if (error.message.includes('format')) {
      console.log('💡 Format d\'image non supporté');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Timeout lors du chargement');
    }
  }
}

testLogoLoading().catch(console.error);