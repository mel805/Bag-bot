require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
let Pool; try { ({ Pool } = require('pg')); } catch (_) {}

async function main() {
  const DATA_DIR = process.env.DATA_DIR ? String(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
  const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

  console.log('[render-restore] Démarrage de la restauration...');

  // 1. Essayer de restaurer depuis GitHub en priorité
  try {
    const GitHubBackup = require('../storage/githubBackup');
    const github = new GitHubBackup();
    
    if (github.isConfigured()) {
      console.log('[render-restore] Tentative de restauration GitHub...');
      const result = await github.restore();
      
      if (result.success && result.data) {
        // Écrire les données GitHub dans le fichier local
        await fsp.mkdir(DATA_DIR, { recursive: true });
        const tmp = CONFIG_PATH + '.tmp';
        await fsp.writeFile(tmp, JSON.stringify(result.data, null, 2), 'utf8');
        try { await fsp.rename(tmp, CONFIG_PATH); } catch (_) { await fsp.writeFile(CONFIG_PATH, JSON.stringify(result.data, null, 2), 'utf8'); }
        
        // Si PostgreSQL est disponible, synchroniser aussi
        const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.PG_CONNECTION_STRING || '';
        if (DB_URL && Pool) {
          try {
            const pool = new Pool({ connectionString: DB_URL, max: 1 });
            const client = await pool.connect();
            try {
              await client.query('CREATE TABLE IF NOT EXISTS app_config (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
              await client.query('INSERT INTO app_config (id, data, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()', [result.data]);
              console.log('[render-restore] ✅ Restauration GitHub réussie + sync Postgres');
            } finally {
              client.release();
              await pool.end();
            }
          } catch (e) {
            console.warn('[render-restore] Sync Postgres échouée:', e.message);
          }
        }
        
        console.log(`[render-restore] ✅ Restauration GitHub réussie depuis: ${result.metadata.timestamp}`);
        return;
      }
    } else {
      console.log('[render-restore] GitHub non configuré, fallback vers autres méthodes');
    }
  } catch (error) {
    console.error('[render-restore] Erreur GitHub:', error.message);
  }

  // 2. Fallback vers PostgreSQL si GitHub échoue
  const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.PG_CONNECTION_STRING || '';
  if (DB_URL && Pool) {
    try {
      const pool = new Pool({ connectionString: DB_URL, max: 1 });
      const client = await pool.connect();
      try {
        await client.query('CREATE TABLE IF NOT EXISTS app_config (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
        const { rows } = await client.query('SELECT data FROM app_config WHERE id = 1');
        const data = rows?.[0]?.data || { guilds: {} };
        await fsp.mkdir(DATA_DIR, { recursive: true });
        const tmp = CONFIG_PATH + '.tmp';
        await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
        try { await fsp.rename(tmp, CONFIG_PATH); } catch (_) { await fsp.writeFile(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
        console.log('[render-restore] ✅ Restauration Postgres réussie');
        return;
      } finally {
        client.release();
        await pool.end();
      }
    } catch (e) {
      console.error('[render-restore] Erreur Postgres:', e.message);
    }
  }

  // 3. Fallback final : créer un fichier vide
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try { await fsp.access(CONFIG_PATH, fs.constants.F_OK); } catch (_) {
    await fsp.writeFile(CONFIG_PATH, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
  }
  console.log('[render-restore] ⚠️ Aucune sauvegarde trouvée, fichier par défaut créé');
}

main().catch((e) => { console.error('[render-restore] Error:', e?.message||e); process.exit(1); });

