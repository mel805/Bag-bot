require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
let Pool; try { ({ Pool } = require('pg')); } catch (_) {}

async function main() {
  const DATA_DIR = process.env.DATA_DIR ? String(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
  const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

  const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.PG_CONNECTION_STRING || '';
  if (!DB_URL || !Pool) {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    try { await fsp.access(CONFIG_PATH, fs.constants.F_OK); } catch (_) {
      await fsp.writeFile(CONFIG_PATH, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
    }
    console.log('[render-restore] No database configured. Ensured local file exists at', CONFIG_PATH);
    return;
  }

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
    console.log('[render-restore] Restored config to', CONFIG_PATH);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('[render-restore] Error:', e?.message||e); process.exit(1); });

