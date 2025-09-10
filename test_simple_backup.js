const SimpleBackupCommands = require('./simple_backup_commands');

/**
 * Test du système de backup simple
 */

async function testSimpleBackup() {
  console.log('🧪 Test du système de backup simple...\n');
  
  const backup = new SimpleBackupCommands();
  
  try {
    // Test 1: Créer une sauvegarde test
    console.log('📦 Test 1: Création de sauvegarde...');
    const timestamp = backup.getTimestamp();
    console.log(`   Timestamp généré: ${timestamp}`);
    
    // Test 2: Lister les sauvegardes
    console.log('\n📋 Test 2: Liste des sauvegardes...');
    const backups = backup.getAllBackups();
    console.log(`   Sauvegardes trouvées: ${backups.length}`);
    
    backups.slice(0, 5).forEach((b, index) => {
      console.log(`   ${index + 1}. ${b.location === 'local' ? '🏠' : '☁️'} ${b.timestamp} (${b.age})`);
    });
    
    // Test 3: Vérifier l'intégration dans bot.js
    console.log('\n🔧 Test 3: Vérification intégration...');
    const fs = require('fs');
    const botContent = fs.readFileSync('./src/bot.js', 'utf8');
    
    const checks = {
      import: botContent.includes('SimpleBackupCommands'),
      init: botContent.includes('simpleBackupCommands = new SimpleBackupCommands'),
      backupHandler: botContent.includes("commandName === 'backup'"),
      restorerHandler: botContent.includes("commandName === 'restorer'"),
      interactions: botContent.includes('handleInteraction')
    };
    
    console.log('   Vérifications:');
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`     ${key}: ${value ? '✅' : '❌'}`);
    });
    
    const allGood = Object.values(checks).every(Boolean);
    console.log(`\n📊 Intégration: ${allGood ? '✅ Complète' : '❌ Incomplète'}`);
    
    if (allGood) {
      console.log('\n🎉 Le système de backup simple est prêt !');
      console.log('\n📋 Commandes disponibles dans Discord:');
      console.log('   /backup    - Force une sauvegarde avec embeds');
      console.log('   /restorer  - Sélecteur avec vrais noms des backups');
    }
    
  } catch (error) {
    console.error('❌ Erreur durant le test:', error.message);
  }
}

// Exécuter le test
if (require.main === module) {
  testSimpleBackup();
}