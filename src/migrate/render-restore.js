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

  // 1. Essayer de restaurer depuis GitHub en priorité
  try {
    const GitHubBackup = require('../storage/githubBackup');
    const github = new GitHubBackup();
    
    if (github.isConfigured()) {
      console.log('[render-restore] ✅ Configuration GitHub OK - Tentative de restauration...');
      const result = await github.restore();
      
      if (result.success && result.data) {
        // Écrire les données GitHub dans le fichier local
        await fsp.mkdir(DATA_DIR, { recursive: true });
        const tmp = CONFIG_PATH + '.tmp';
        await fsp.writeFile(tmp, JSON.stringify(result.data, null, 2), 'utf8');
        try { await fsp.rename(tmp, CONFIG_PATH); } catch (_) { await fsp.writeFile(CONFIG_PATH, JSON.stringify(result.data, null, 2), 'utf8'); }
        
        // Si PostgreSQL est disponible, synchroniser aussi
        let postgresSuccess = false;
        const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.PG_CONNECTION_STRING || '';
        if (DB_URL && Pool) {
          try {
            const pool = new Pool({ connectionString: DB_URL, max: 1 });
            const client = await pool.connect();
            try {
              await client.query('CREATE TABLE IF NOT EXISTS app_config (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
              await client.query('INSERT INTO app_config (id, data, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()', [result.data]);
              console.log('[render-restore] ✅ Restauration GitHub réussie + sync Postgres');
              postgresSuccess = true;
            } finally {
              client.release();
              await pool.end();
            }
          } catch (e) {
            console.warn('[render-restore] Sync Postgres échouée:', e.message);
          }
        }
        
        console.log(`[render-restore] ✅ Restauration GitHub réussie depuis: ${result.metadata.timestamp}`);
        
        // Envoyer un log dans les canaux backup
        const description = postgresSuccess 
          ? '🔄 Les données du bot ont été restaurées avec succès depuis GitHub lors du redéploiement Render.\n💾 Synchronisation PostgreSQL également effectuée.'
          : '🔄 Les données du bot ont été restaurées avec succès depuis GitHub lors du redéploiement Render.';
        
        const status = postgresSuccess 
          ? 'Restauration + Sync Postgres réussie' 
          : 'Restauration réussie';
        
        await sendBackupLog(
          'Restauration GitHub réussie',
          description,
          [
            { name: '📅 Timestamp', value: result.metadata.timestamp, inline: true },
            { name: '🏷️ Version', value: result.metadata.bot_version || 'N/A', inline: true },
            { name: '🔧 Type', value: result.metadata.backup_type || 'complete', inline: true },
            { name: '✅ Statut', value: status, inline: false }
          ]
        );
        
        return;
      }
    } else {
      console.log('[render-restore] ❌ GitHub non configuré - Variables manquantes:');
      console.log(`  - GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '✅' : '❌ MANQUANT'}`);
      console.log(`  - GITHUB_REPO: ${process.env.GITHUB_REPO ? '✅' : '❌ MANQUANT'}`);
      console.log('[render-restore] Fallback vers PostgreSQL...');
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

