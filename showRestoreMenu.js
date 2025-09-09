"use strict";
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const listFreeboxBackups = require('./listFreeboxBackups');

module.exports = async function showRestoreMenu(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const options = await listFreeboxBackups();
    if (!options || !options.length) {
      return interaction.editReply({ content: '❌ Aucun fichier de sauvegarde trouvé.' });
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId('restore_file_select')
      .setPlaceholder('📂 Sélectionnez une sauvegarde à restaurer')
      .addOptions(options.slice(0, 25));
    const row = new ActionRowBuilder().addComponents(select);
    return interaction.editReply({ content: '🗃️ Choisissez un fichier à restaurer :', components: [row] });
  } catch (e) {
    try { await interaction.editReply({ content: '❌ Erreur: ' + (e?.message || String(e)) }); } catch (_) {}
  }
};

