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
  new SlashCommandBuilder().setName('solde').setDescription('Voir votre solde').toJSON(),
  new SlashCommandBuilder().setName('travailler').setDescription('Gagner de l\'argent en travaillant').toJSON(),
  new SlashCommandBuilder().setName('pêcher').setDescription('Pêcher pour gagner de l\'argent').toJSON(),
  new SlashCommandBuilder().setName('donner').setDescription('Donner de l\'argent à un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)).toJSON(),
  new SlashCommandBuilder().setName('voler').setDescription('Tenter de voler un membre').addUserOption(o=>o.setName('membre').setDescription('Cible').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('embrasser').setDescription('Embrasser pour gagner du charme').toJSON(),
  new SlashCommandBuilder().setName('flirter').setDescription('Flirter pour gagner du charme').toJSON(),
  new SlashCommandBuilder().setName('séduire').setDescription('Séduire pour gagner du charme').toJSON(),
  new SlashCommandBuilder().setName('fuck').setDescription('Action perverse 😈').toJSON(),
  new SlashCommandBuilder().setName('masser').setDescription('Masser pour gagner du charme').toJSON(),
  new SlashCommandBuilder().setName('danser').setDescription('Danser pour gagner du charme').toJSON(),
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
  new SlashCommandBuilder().setName('crime').setDescription('Commettre un crime… au risque 😈').toJSON(),
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

