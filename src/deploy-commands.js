const { REST, Routes, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID in environment');
  process.exit(2);
}

// Build /setup command - visible to members with ManageGuild by default
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configurer le staff et les rôles de modération')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('Registering guild commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✓ /setup registered for guild', guildId);
  } catch (err) {
    console.error('Failed to register commands:', err?.response?.data || err);
    process.exit(1);
  }
}

main();

