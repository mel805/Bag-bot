require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }
  const DATA_DIR = process.env.DATA_DIR ? String(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
  const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
  let config = { guilds: {} };
  try {
    const raw = await fsp.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.guilds && typeof parsed.guilds === 'object') {
      config = parsed;
    }
  } catch (_) {
    // no local file, migrate empty structure
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS app_config (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    await client.query('INSERT INTO app_config (id, data, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()', [config]);
    console.log('Migration completed. Rows upserted for global config.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

