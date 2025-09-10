#!/usr/bin/env node

/**
 * Démonstration du sélecteur de restauration
 * Simule plusieurs sauvegardes pour montrer la pagination
 */

const fs = require('fs');
const path = require('path');

// Créer quelques sauvegardes de démonstration
function createDemoBackups() {
  const backupDir = './data/backups';
  
  // Créer le dossier s'il n'existe pas
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  console.log('🎭 Création de sauvegardes de démonstration...');
  
  // Créer 25 sauvegardes fictives pour tester la pagination
  for (let i = 0; i < 25; i++) {
    const now = new Date();
    now.setHours(now.getHours() - i);
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    
    const timestamp = `${year}-${month}-${day}_${hour}h${minute}`;
    
    const configFile = path.join(backupDir, `bot-config_${timestamp}.json`);
    const userDataFile = path.join(backupDir, `user-data_${timestamp}.json`);
    
    // Créer des fichiers JSON fictifs
    const demoConfig = {
      guilds: {
        "demo": {
          economy: { enabled: true, currency: { name: "DEMO$" } },
          levels: { enabled: true, rewards: {} }
        }
      }
    };
    
    const demoUserData = {
      guilds: {
        "demo": {
          economy: { balances: { "user1": { amount: 1000 + i * 100 } } },
          levels: { users: { "user1": { xp: 500 + i * 50, level: Math.floor(i / 5) } } }
        }
      }
    };
    
    fs.writeFileSync(configFile, JSON.stringify(demoConfig, null, 2));
    fs.writeFileSync(userDataFile, JSON.stringify(demoUserData, null, 2));
  }
  
  console.log('✅ 25 sauvegardes de démonstration créées');
  console.log('📋 Testez maintenant: node restore_with_selector.js');
  console.log('🧹 Pour nettoyer: rm data/backups/bot-config_*demo*.json data/backups/user-data_*demo*.json');
}

if (require.main === module) {
  createDemoBackups();
}