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
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  if (!Array.isArray(cfg.guilds[guildId].staffRoleIds)) cfg.guilds[guildId].staffRoleIds = [];
  if (!cfg.guilds[guildId].levels) {
    cfg.guilds[guildId].levels = {
      enabled: false,
      xpPerMessage: 10,
      xpPerVoiceMinute: 5,
      levelCurve: { base: 100, factor: 1.2 },
      rewards: {},
      users: {},
    };
  }
  return cfg.guilds[guildId];
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

// --- Levels helpers ---
function ensureLevelsShape(g) {
  if (!g.levels) {
    g.levels = {
      enabled: false,
      xpPerMessage: 10,
      xpPerVoiceMinute: 5,
      levelCurve: { base: 100, factor: 1.2 },
      rewards: {},
      users: {},
      announce: {
        levelUp: { enabled: false, channelId: '' },
        roleAward: { enabled: false, channelId: '' },
      },
      cards: {
        femaleRoleIds: [],
        certifiedRoleIds: [],
        backgrounds: { default: '', female: '', certified: '' },
      },
    };
  } else {
    if (typeof g.levels.enabled !== 'boolean') g.levels.enabled = false;
    if (typeof g.levels.xpPerMessage !== 'number') g.levels.xpPerMessage = 10;
    if (typeof g.levels.xpPerVoiceMinute !== 'number') g.levels.xpPerVoiceMinute = 5;
    if (!g.levels.levelCurve || typeof g.levels.levelCurve !== 'object') g.levels.levelCurve = { base: 100, factor: 1.2 };
    if (typeof g.levels.levelCurve.base !== 'number') g.levels.levelCurve.base = 100;
    if (typeof g.levels.levelCurve.factor !== 'number') g.levels.levelCurve.factor = 1.2;
    if (!g.levels.rewards || typeof g.levels.rewards !== 'object') g.levels.rewards = {};
    if (!g.levels.users || typeof g.levels.users !== 'object') g.levels.users = {};
    if (!g.levels.announce || typeof g.levels.announce !== 'object') g.levels.announce = {};
    if (!g.levels.announce.levelUp || typeof g.levels.announce.levelUp !== 'object') g.levels.announce.levelUp = { enabled: false, channelId: '' };
    if (!g.levels.announce.roleAward || typeof g.levels.announce.roleAward !== 'object') g.levels.announce.roleAward = { enabled: false, channelId: '' };
    if (typeof g.levels.announce.levelUp.enabled !== 'boolean') g.levels.announce.levelUp.enabled = false;
    if (typeof g.levels.announce.levelUp.channelId !== 'string') g.levels.announce.levelUp.channelId = '';
    if (typeof g.levels.announce.roleAward.enabled !== 'boolean') g.levels.announce.roleAward.enabled = false;
    if (typeof g.levels.announce.roleAward.channelId !== 'string') g.levels.announce.roleAward.channelId = '';
    if (!g.levels.cards || typeof g.levels.cards !== 'object') g.levels.cards = { femaleRoleIds: [], certifiedRoleIds: [], backgrounds: { default: '', female: '', certified: '' } };
    if (!g.levels.cards.perRoleBackgrounds || typeof g.levels.cards.perRoleBackgrounds !== 'object') g.levels.cards.perRoleBackgrounds = {};
    if (!Array.isArray(g.levels.cards.femaleRoleIds)) g.levels.cards.femaleRoleIds = [];
    if (!Array.isArray(g.levels.cards.certifiedRoleIds)) g.levels.cards.certifiedRoleIds = [];
    if (!g.levels.cards.backgrounds || typeof g.levels.cards.backgrounds !== 'object') g.levels.cards.backgrounds = { default: '', female: '', certified: '' };
    if (typeof g.levels.cards.backgrounds.default !== 'string') g.levels.cards.backgrounds.default = '';
    if (typeof g.levels.cards.backgrounds.female !== 'string') g.levels.cards.backgrounds.female = '';
    if (typeof g.levels.cards.backgrounds.certified !== 'string') g.levels.cards.backgrounds.certified = '';
  }
}

async function getLevelsConfig(guildId) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  ensureLevelsShape(cfg.guilds[guildId]);
  return cfg.guilds[guildId].levels;
}

async function updateLevelsConfig(guildId, partial) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  ensureLevelsShape(cfg.guilds[guildId]);
  cfg.guilds[guildId].levels = { ...cfg.guilds[guildId].levels, ...partial };
  await writeConfig(cfg);
  return cfg.guilds[guildId].levels;
}

async function getUserStats(guildId, userId) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  ensureLevelsShape(cfg.guilds[guildId]);
  const existing = cfg.guilds[guildId].levels.users[userId];
  const u = existing || { xp: 0, level: 0, xpSinceLevel: 0, lastMessageAt: 0, voiceMsAccum: 0, voiceJoinedAt: 0 };
  if (typeof u.xp !== 'number') u.xp = 0;
  if (typeof u.level !== 'number') u.level = 0;
  if (typeof u.xpSinceLevel !== 'number') u.xpSinceLevel = 0;
  if (typeof u.lastMessageAt !== 'number') u.lastMessageAt = 0;
  if (typeof u.voiceMsAccum !== 'number') u.voiceMsAccum = 0;
  if (typeof u.voiceJoinedAt !== 'number') u.voiceJoinedAt = 0;
  return u;
}

async function setUserStats(guildId, userId, stats) {
  const cfg = await readConfig();
  if (!cfg.guilds[guildId]) cfg.guilds[guildId] = {};
  ensureLevelsShape(cfg.guilds[guildId]);
  cfg.guilds[guildId].levels.users[userId] = stats;
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
  // Levels
  getLevelsConfig,
  updateLevelsConfig,
  getUserStats,
  setUserStats,
  paths: { DATA_DIR, CONFIG_PATH },
};

