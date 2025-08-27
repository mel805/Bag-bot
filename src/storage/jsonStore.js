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

// --- AutoKick config helpers ---
function ensureAutoKickShape(g) {
  if (!g.autokick) {
    g.autokick = { enabled: false, roleId: '', delayMs: 3600000, pendingJoiners: {} };
  } else {
    if (typeof g.autokick.enabled !== 'boolean') g.autokick.enabled = false;
    if (typeof g.autokick.roleId !== 'string') g.autokick.roleId = '';
    if (typeof g.autokick.delayMs !== 'number') g.autokick.delayMs = 3600000;
    if (!g.autokick.pendingJoiners || typeof g.autokick.pendingJoiners !== 'object') g.autokick.pendingJoiners = {};
  }
}

async function getAutoKickConfig(guildId) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  ensureAutoKickShape(cfg.guilds[guildId]);
  return cfg.guilds[guildId].autokick;
}

async function updateAutoKickConfig(guildId, partial) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  ensureAutoKickShape(cfg.guilds[guildId]);
  cfg.guilds[guildId].autokick = { ...cfg.guilds[guildId].autokick, ...partial };
  await writeConfig(cfg);
  return cfg.guilds[guildId].autokick;
}

async function addPendingJoiner(guildId, userId, joinedAtMs) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  ensureAutoKickShape(cfg.guilds[guildId]);
  cfg.guilds[guildId].autokick.pendingJoiners[userId] = joinedAtMs;
  await writeConfig(cfg);
}

async function removePendingJoiner(guildId, userId) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) return;
  ensureAutoKickShape(cfg.guilds[guildId]);
  delete cfg.guilds[guildId].autokick.pendingJoiners[userId];
  await writeConfig(cfg);
}

module.exports = {
  ensureStorageExists,
  readConfig,
  writeConfig,
  getGuildConfig,
  getGuildStaffRoleIds,
  setGuildStaffRoleIds,
  getAutoKickConfig,
  updateAutoKickConfig,
  addPendingJoiner,
  removePendingJoiner,
  paths: { DATA_DIR, CONFIG_PATH },
};

