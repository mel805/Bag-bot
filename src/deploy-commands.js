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
    .addStringOption(o => o
      .setName('action')
      .setDescription('Action à effectuer')
      .setRequired(true)
      .addChoices(
        { name: 'addxp', value: 'addxp' },
        { name: 'removexp', value: 'removexp' },
        { name: 'addlevel', value: 'addlevel' },
        { name: 'removelevel', value: 'removelevel' },
        { name: 'setlevel', value: 'setlevel' },
      )
    )
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o => o.setName('valeur').setDescription('Montant XP / Niveau selon action').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('eco')
    .setDescription('Économie')
    .addSubcommand(sc => sc.setName('solde').setDescription('Voir votre solde'))
    .addSubcommand(sc => sc.setName('travailler').setDescription('Gagner de l\'argent en travaillant'))
    .addSubcommand(sc => sc.setName('pecher').setDescription('Pêcher pour gagner de l\'argent'))
    .addSubcommand(sc => sc.setName('donner').setDescription('Donner de l\'argent à un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)))
    .addSubcommand(sc => sc.setName('voler').setDescription('Tenter de voler un membre').addUserOption(o=>o.setName('membre').setDescription('Cible').setRequired(true)))
    .addSubcommand(sc => sc.setName('embrasser').setDescription('Embrasser pour gagner du charme'))
    .addSubcommand(sc => sc.setName('flirter').setDescription('Flirter pour gagner du charme'))
    .addSubcommand(sc => sc.setName('seduire').setDescription('Séduire pour gagner du charme'))
    .addSubcommand(sc => sc.setName('fuck').setDescription('Action perverse 😈'))
    .addSubcommand(sc => sc.setName('masser').setDescription('Masser pour gagner du charme'))
    .addSubcommand(sc => sc.setName('danser').setDescription('Danser pour gagner du charme'))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('boutique')
    .setDescription('Consulter la boutique et acheter')
    .addSubcommand(sc => sc.setName('voir').setDescription('Voir la boutique'))
    .addSubcommand(sc => sc.setName('acheter').setDescription('Acheter un article').addStringOption(o=>o.setName('article').setDescription('ID de l\'article').setRequired(true)))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('niveau')
    .setDescription('Voir votre niveau ou celui d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Classements')
    .setDMPermission(false)
    .addSubcommand(sc => sc
      .setName('niveau')
      .setDescription('Classement des niveaux')
      .addIntegerOption(o => o.setName('limite').setDescription('Nombre de membres à afficher (1-25)').setRequired(false).setMinValue(1).setMaxValue(25))
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

