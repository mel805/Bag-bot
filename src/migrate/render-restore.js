require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
let Pool; try { ({ Pool } = require('pg')); } catch (_) {}

// Import Discord.js pour les logs
let Client, EmbedBuilder, GatewayIntentBits;
try {
  ({ Client, EmbedBuilder, GatewayIntentBits } = require('discord.js'));
} catch (_) {
  // Discord.js non disponible, les logs ne seront pas envoyés
}

// Fonction pour envoyer un log dans le canal backup
async function sendBackupLog(title, description, fields = []) {
  if (!Client || !EmbedBuilder || !process.env.DISCORD_TOKEN) {
    console.log('[render-restore] Discord.js non disponible, log backup ignoré');
    return;
  }

  try {
    // Créer un client Discord temporaire
    const client = new Client({ 
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
    });

    await client.login(process.env.DISCORD_TOKEN);

    // Attendre que le client soit prêt
    await new Promise((resolve) => {
      client.once('ready', resolve);
    });

    // Lire la configuration pour obtenir les guilds et leurs logs
    const DATA_DIR = process.env.DATA_DIR ? String(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
    const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
    
    let config = {};
    try {
      const configData = await fsp.readFile(CONFIG_PATH, 'utf8');
      config = JSON.parse(configData);
    } catch (_) {
      console.log('[render-restore] Impossible de lire la config pour les logs backup');
      await client.destroy();
      return;
    }

    // Envoyer le log à tous les serveurs qui ont les logs backup activés
    for (const [guildId, guildConfig] of Object.entries(config.guilds || {})) {
      try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        const logs = guildConfig.logs;
        if (!logs?.categories?.backup) continue;

        const channelId = (logs.channels?.backup) || logs.channelId;
        if (!channelId) continue;

        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || typeof channel.send !== 'function') continue;

        const embed = new EmbedBuilder()
          .setColor(0x00FF00) // Vert pour succès
          .setTitle(`${logs.emoji || '📝'} ${title}`)
          .setDescription(description)
          .setTimestamp();

        if (fields.length > 0) {
          embed.addFields(fields);
        }

        await channel.send({ embeds: [embed] });
        console.log(`[render-restore] Log backup envoyé au serveur ${guild.name} (${guildId})`);
      } catch (error) {
        console.error(`[render-restore] Erreur envoi log backup pour ${guildId}:`, error.message);
      }
    }

    await client.destroy();
  } catch (error) {
    console.error('[render-restore] Erreur lors de l\'envoi du log backup:', error.message);
  }
}

async function main() {
  const DATA_DIR = process.env.DATA_DIR ? String(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
  const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

  console.log('[render-restore] Démarrage de la restauration...');
  console.log('[render-restore] Variables d\'environnement:');
  console.log(`  - GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? 'CONFIGURÉ' : 'MANQUANT'}`);
  console.log(`  - GITHUB_REPO: ${process.env.GITHUB_REPO || 'MANQUANT'}`);
  console.log(`  - DATABASE_URL: ${process.env.DATABASE_URL ? 'CONFIGURÉ' : 'MANQUANT'}`);
  console.log(`  - DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? 'CONFIGURÉ' : 'MANQUANT'}`);

  // 1. Note: Système GitHub supprimé - utilisation des sauvegardes locales uniquement
  console.log('[render-restore] ℹ️ Système GitHub supprimé - utilisation des sauvegardes locales');

  // 2. Utiliser PostgreSQL comme source principale
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

