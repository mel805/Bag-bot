const { REST, Routes, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID in environment');
  process.exit(2);
}

// Build /config command - visible to members with ManageGuild by default
const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer le serveur (Staff, AutoKick, Levels)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('adminxp')
    .setDescription('Gestion des niveaux et XP')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(sc => sc
      .setName('addxp')
      .setDescription('Ajouter de l\'XP à un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o => o.setName('montant').setDescription('XP à ajouter').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sc => sc
      .setName('removexp')
      .setDescription('Retirer de l\'XP à un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o => o.setName('montant').setDescription('XP à retirer').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sc => sc
      .setName('addlevel')
      .setDescription('Ajouter des niveaux à un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o => o.setName('niveaux').setDescription('Niveaux à ajouter').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sc => sc
      .setName('removelevel')
      .setDescription('Retirer des niveaux à un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o => o.setName('niveaux').setDescription('Niveaux à retirer').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sc => sc
      .setName('setlevel')
      .setDescription('Définir le niveau d\'un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o => o.setName('niveau').setDescription('Niveau cible').setRequired(true).setMinValue(0))
    )
    .toJSON(),
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('Registering guild commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✓ /config registered for guild', guildId);
  } catch (err) {
    console.error('Failed to register commands:', err?.response?.data || err);
    process.exit(1);
  }
}

main();

