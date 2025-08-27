const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

async function ensureStorageExists() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(CONFIG_PATH, fs.constants.F_OK);
  } catch (_) {
    const initial = { guilds: {} };
    await fsp.writeFile(CONFIG_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

async function readConfig() {
  await ensureStorageExists();
  try {
    const raw = await fsp.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { guilds: {} };
    if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
    return parsed;
  } catch (_) {
    return { guilds: {} };
  }
}

async function writeConfig(cfg) {
  await ensureStorageExists();
  const tmpPath = CONFIG_PATH + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(cfg, null, 2), 'utf8');
  await fsp.rename(tmpPath, CONFIG_PATH);
}

async function getGuildConfig(guildId) {
  const cfg = await readConfig();
  return cfg.guilds[guildId] || { staffRoleIds: [] };
}

async function getGuildStaffRoleIds(guildId) {
  const g = await getGuildConfig(guildId);
  return Array.isArray(g.staffRoleIds) ? g.staffRoleIds : [];
}

async function setGuildStaffRoleIds(guildId, roleIds) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  cfg.guilds[guildId].staffRoleIds = Array.from(new Set(roleIds.map(String)));
  await writeConfig(cfg);
}

module.exports = {
  ensureStorageExists,
  readConfig,
  writeConfig,
  getGuildConfig,
  getGuildStaffRoleIds,
  setGuildStaffRoleIds,
  paths: { DATA_DIR, CONFIG_PATH },
};

