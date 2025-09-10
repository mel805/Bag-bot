const { SlashCommandBuilder } = require('discord.js');

/**
 * Définition de la commande /backup pour deploy-commands.js
 */

const backupCommand = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Gestion avancée des sauvegardes du bot')
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Forcer la création d\'une sauvegarde immédiate')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('Afficher toutes les sauvegardes avec sélecteur paginé')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Afficher le statut détaillé des sauvegardes')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('restore')
      .setDescription('Restaurer une sauvegarde par timestamp')
      .addStringOption(option =>
        option
          .setName('timestamp')
          .setDescription('Timestamp de la sauvegarde (ex: 2025-09-10_17h25)')
          .setRequired(true)
      )
  );

module.exports = backupCommand;