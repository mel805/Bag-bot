#!/usr/bin/env node

/**
 * Script de test pour vérifier la configuration Render
 */

require('dotenv').config();

console.log('🔍 Test de Configuration Render\n');

// Variables critiques
const requiredVars = [
  'DISCORD_TOKEN',
  'CLIENT_ID', 
  'GUILD_ID',
  'DATABASE_URL',
  'GITHUB_TOKEN',
  'GITHUB_REPO'
];

const optionalVars = [
  'LOCATIONIQ_TOKEN',
  'LEVEL_CARD_LOGO_URL',
  'GITHUB_BACKUP_BRANCH'
];

console.log('📋 Variables d\'environnement requises:');
let missingRequired = [];

for (const varName of requiredVars) {
  const value = process.env[varName];
  const status = value ? '✅ CONFIGURÉ' : '❌ MANQUANT';
  console.log(`  ${varName}: ${status}`);
  
  if (!value) {
    missingRequired.push(varName);
  }
}

console.log('\n📋 Variables d\'environnement optionnelles:');
for (const varName of optionalVars) {
  const value = process.env[varName];
  const status = value ? '✅ CONFIGURÉ' : '⚠️  NON CONFIGURÉ';
  console.log(`  ${varName}: ${status}`);
}

// Test de connectivité GitHub
console.log('\n🔗 Test de connectivité GitHub:');
async function testGitHub() {
  try {
    const GitHubBackup = require('./src/storage/githubBackup');
    const github = new GitHubBackup();
    
    if (!github.isConfigured()) {
      console.log('❌ GitHub non configuré');
      return;
    }
    
    const result = await github.testConnection();
    if (result.success) {
      console.log(`✅ Connexion GitHub réussie`);
      console.log(`   Repository: ${result.repo}`);
      console.log(`   Permissions push: ${result.permissions.push ? '✅' : '❌'}`);
    } else {
      console.log(`❌ Erreur GitHub: ${result.error}`);
    }
  } catch (error) {
    console.log(`❌ Erreur test GitHub: ${error.message}`);
  }
}

// Test de connectivité PostgreSQL
console.log('\n🗄️  Test de connectivité PostgreSQL:');
async function testPostgreSQL() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('❌ DATABASE_URL non configuré');
    return;
  }
  
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    const client = await pool.connect();
    
    const result = await client.query('SELECT NOW() as current_time');
    console.log(`✅ Connexion PostgreSQL réussie`);
    console.log(`   Timestamp: ${result.rows[0].current_time}`);
    
    client.release();
    await pool.end();
  } catch (error) {
    console.log(`❌ Erreur PostgreSQL: ${error.message}`);
  }
}

// Résumé
console.log('\n📊 Résumé:');
if (missingRequired.length === 0) {
  console.log('✅ Toutes les variables requises sont configurées');
} else {
  console.log(`❌ ${missingRequired.length} variable(s) requise(s) manquante(s):`);
  missingRequired.forEach(v => console.log(`   - ${v}`));
}

// Exécuter les tests
(async () => {
  await testGitHub();
  await testPostgreSQL();
  
  console.log('\n🎯 Actions recommandées:');
  if (missingRequired.length > 0) {
    console.log('1. Configurez les variables manquantes dans le dashboard Render');
    console.log('2. Redéployez le service');
  }
  console.log('3. Vérifiez les logs de déploiement Render');
  console.log('4. Testez la restauration GitHub manuellement');
  
  process.exit(missingRequired.length > 0 ? 1 : 0);
})();