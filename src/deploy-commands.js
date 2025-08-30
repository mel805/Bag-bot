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
  new SlashCommandBuilder().setName('embrasser').setDescription('Embrasser pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('flirter').setDescription('Flirter pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('séduire').setDescription('Séduire pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('fuck').setDescription('Action perverse 😈').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('masser').setDescription('Masser pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('danser').setDescription('Danser pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Danser avec (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('boutique').setDescription('Ouvrir la boutique du serveur').toJSON(),
  new SlashCommandBuilder()
    .setName('niveau')
    .setDescription('Voir votre niveau ou celui d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder().setName('economie').setDescription('Voir votre économie (argent, charme, perversion)').toJSON(),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Classements')
    .setDMPermission(false)
    .addSubcommand(sc => sc
      .setName('niveau')
      .setDescription('Classement des niveaux')
      .addIntegerOption(o => o.setName('limite').setDescription('Nombre de membres à afficher (1-25)').setRequired(false).setMinValue(1).setMaxValue(25))
    )
    .addSubcommand(sc => sc
      .setName('economie')
      .setDescription('Classement par argent')
      .addIntegerOption(o => o.setName('limite').setDescription('Nombre de membres à afficher (1-25)').setRequired(false).setMinValue(1).setMaxValue(25))
    )
    .toJSON(),
  new SlashCommandBuilder().setName('crime').setDescription('Commettre un crime… au risque 😈').addUserOption(o=>o.setName('complice').setDescription('Complice (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder()
    .setName('ajout')
    .setDescription('Administration: ajout de ressources')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sc => sc
      .setName('argent')
      .setDescription('Ajouter de l\'argent à un membre')
      .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o=>o.setName('montant').setDescription('Montant à ajouter').setRequired(true).setMinValue(1))
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('couleur')
    .setDescription('Attribuer une couleur de rôle à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON(),
  new SlashCommandBuilder().setName('actionverite').setDescription('Démarrer Action ou Vérité dans ce salon autorisé').toJSON(),
  new SlashCommandBuilder()
    .setName('map')
    .setDescription('Définir ou voir votre localisation (ville)')
    .addStringOption(o=>o.setName('ville').setDescription('Votre ville (ex: Paris)').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('proche')
    .setDescription('Voir les membres proches (≤ 200 km) sur une carte')
    .addIntegerOption(o=>o.setName('distance').setDescription('Distance max en km (10-1000)').setRequired(false).setMinValue(10).setMaxValue(1000))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('localisation')
    .setDescription('Admin: voir la localisation des membres (carte ou par membre)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption(o=>o.setName('membre').setDescription('Membre spécifique (optionnel)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Envoyer une confession anonyme')
    .addStringOption(o=>o.setName('texte').setDescription('Votre confession (optionnel)').setRequired(false))
    .addAttachmentOption(o=>o.setName('image').setDescription('Image (optionnel)').setRequired(false))
    .toJSON(),
  // Moderation (staff-only)
  new SlashCommandBuilder().setName('ban').setDescription('Ban un membre').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('unban').setDescription('Déban un utilisateur').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o=>o.setName('userid').setDescription('ID utilisateur').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('kick').setDescription('Kick un membre').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('mute').setDescription('Mute un membre (timeout)').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(10080)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('warn').setDescription('Avertir un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('masskick').setDescription('Kick en masse par rôle').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addStringOption(o=>o.setName('mode').setDescription('Avec ou sans le rôle').setRequired(true).addChoices({name:'sans_role', value:'without'},{name:'avec_role', value:'with'})).addRoleOption(o=>o.setName('role').setDescription('Rôle cible')).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('massban').setDescription('Ban en masse par rôle').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o=>o.setName('mode').setDescription('Avec ou sans le rôle').setRequired(true).addChoices({name:'sans_role', value:'without'},{name:'avec_role', value:'with'})).addRoleOption(o=>o.setName('role').setDescription('Rôle cible')).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('purge').setDescription('Vider le salon courant (X messages) et réinitialiser les systèmes').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o=>o.setName('nombre').setDescription('Nombre de messages à supprimer (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).toJSON(),
  // Music commands
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Lire une musique (URL ou recherche)')
    .addStringOption(o=>o.setName('recherche').setDescription('URL ou mots-clés').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder().setName('pause').setDescription('Mettre la musique en pause').toJSON(),
  new SlashCommandBuilder().setName('resume').setDescription('Reprendre la musique').toJSON(),
  new SlashCommandBuilder().setName('skip').setDescription('Passer au titre suivant').toJSON(),
  new SlashCommandBuilder().setName('stop').setDescription('Arrêter et vider la file').toJSON(),
  new SlashCommandBuilder().setName('queue').setDescription('Voir la file d\'attente').toJSON(),
  new SlashCommandBuilder().setName('leave').setDescription('Quitter le salon vocal').toJSON(),
  new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Lancer une radio')
    .addStringOption(o=>o.setName('station').setDescription('Station').setRequired(true)
      .addChoices(
        { name: 'Chillout', value: 'chillout' },
        { name: 'LoFi', value: 'lofi' },
        { name: 'EDM', value: 'edm' },
        { name: 'Jazz', value: 'jazz' }
      ))
    .toJSON(),
  new SlashCommandBuilder().setName('testaudio').setDescription('Debug: jouer un MP3 de test').toJSON(),
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

