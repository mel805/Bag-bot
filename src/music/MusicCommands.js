const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Gestionnaire des commandes de musique pour le bot BAG
 */

class MusicCommands {
  constructor(musicManager) {
    this.music = musicManager;
  }

  /**
   * Commande /play - Joue une musique ou playlist
   */
  async handlePlay(interaction) {
    const query = interaction.options.getString('query');
    await this.music.play(interaction, query);
  }

  /**
   * Commande /skip - Passe à la musique suivante
   */
  async handleSkip(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    const currentTrack = player.queue.current;
    
    try {
      player.skip();
      
      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('⏭️ Musique passée')
        .setDescription(currentTrack ? `**${currentTrack.title}** a été passée` : 'Musique passée')
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur skip:', error);
      await interaction.reply({
        content: '❌ Erreur lors du passage à la musique suivante !',
        ephemeral: true
      });
    }
  }

  /**
   * Commande /pause - Met en pause ou reprend la lecture
   */
  async handlePause(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    try {
      const wasPaused = player.paused;
      player.pause(!wasPaused);
      
      const embed = new EmbedBuilder()
        .setColor(wasPaused ? 0x00ff00 : 0xff9900)
        .setTitle(wasPaused ? '▶️ Lecture reprise' : '⏸️ Lecture en pause')
        .setDescription(player.queue.current ? `**${player.queue.current.title}**` : 'Musique actuelle')
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur pause:', error);
      await interaction.reply({
        content: '❌ Erreur lors de la mise en pause !',
        ephemeral: true
      });
    }
  }

  /**
   * Commande /stop - Arrête la musique et vide la queue
   */
  async handleStop(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    try {
      player.queue.clear();
      player.stop();
      
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('⏹️ Musique arrêtée')
        .setDescription('La lecture a été arrêtée et la queue vidée.')
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur stop:', error);
      await interaction.reply({
        content: '❌ Erreur lors de l\'arrêt !',
        ephemeral: true
      });
    }
  }

  /**
   * Commande /queue - Affiche la file d'attente
   */
  async handleQueue(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    const current = player.queue.current;
    const queue = player.queue;
    
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle('📋 File d\'attente')
      .setTimestamp();

    if (current) {
      embed.addFields({
        name: '🎵 En cours de lecture',
        value: `[**${current.title}**](${current.uri})\n👤 ${current.author || 'Inconnu'} • ⏱️ ${this.music.formatDuration(current.length)}`,
        inline: false
      });
    }

    if (queue.size > 0) {
      const tracks = queue.slice(0, 10).map((track, index) => 
        `\`${index + 1}.\` [**${track.title}**](${track.uri})\n👤 ${track.author || 'Inconnu'} • ⏱️ ${this.music.formatDuration(track.length)}`
      ).join('\n\n');

      embed.addFields({
        name: `🎶 À venir (${queue.size} musique${queue.size > 1 ? 's' : ''})`,
        value: tracks + (queue.size > 10 ? `\n\n*... et ${queue.size - 10} autre${queue.size - 10 > 1 ? 's' : ''}*` : ''),
        inline: false
      });

      const totalDuration = queue.reduce((acc, track) => acc + (track.length || 0), 0);
      embed.setFooter({ 
        text: `Durée totale: ${this.music.formatDuration(totalDuration)} • Volume: ${player.volume}%` 
      });
    } else {
      embed.addFields({
        name: '📭 File d\'attente vide',
        value: 'Ajoutez des musiques avec `/play` !',
        inline: false
      });
    }

    // Ajouter les contrôles
    const row1 = this.music.createPlayerControls();
    const row2 = this.music.createVolumeControls();

    await interaction.reply({ embeds: [embed], components: [row1, row2] });
  }

  /**
   * Commande /volume - Ajuste le volume
   */
  async handleVolume(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    const volume = interaction.options.getInteger('level');
    
    if (volume < 0 || volume > 200) {
      return interaction.reply({
        content: '❌ Le volume doit être entre 0 et 200 !',
        ephemeral: true
      });
    }

    try {
      player.setVolume(volume);
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🔊 Volume ajusté')
        .setDescription(`Volume réglé à **${volume}%**`)
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur volume:', error);
      await interaction.reply({
        content: '❌ Erreur lors du réglage du volume !',
        ephemeral: true
      });
    }
  }

  /**
   * Commande /shuffle - Mélange la file d'attente
   */
  async handleShuffle(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    if (player.queue.size < 2) {
      return interaction.reply({
        content: '❌ Il faut au moins 2 musiques dans la queue pour mélanger !',
        ephemeral: true
      });
    }

    try {
      player.queue.shuffle();
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🔀 Queue mélangée')
        .setDescription(`**${player.queue.size}** musiques ont été mélangées !`)
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur shuffle:', error);
      await interaction.reply({
        content: '❌ Erreur lors du mélange !',
        ephemeral: true
      });
    }
  }

  /**
   * Commande /nowplaying - Affiche la musique actuelle
   */
  async handleNowPlaying(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player || !player.queue.current) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    const track = player.queue.current;
    const guild = interaction.guild;
    
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle('🎵 En cours de lecture')
      .setDescription(`[**${track.title}**](${track.uri})`)
      .addFields(
        { name: '👤 Artiste', value: track.author || 'Inconnu', inline: true },
        { name: '⏱️ Durée', value: this.music.formatDuration(track.length), inline: true },
        { name: '🔊 Volume', value: `${player.volume}%`, inline: true },
        { name: '🔁 Répétition', value: player.loop === 'track' ? 'Piste' : player.loop === 'queue' ? 'Queue' : 'Désactivée', inline: true },
        { name: '📋 Queue', value: `${player.queue.size} musique${player.queue.size > 1 ? 's' : ''}`, inline: true },
        { name: '🎯 Demandé par', value: `${track.requester || 'Inconnu'}`, inline: true }
      )
      .setThumbnail(track.thumbnail)
      .setFooter({ 
        text: guild.name, 
        iconURL: guild.iconURL() || this.music.client.user.displayAvatarURL() 
      })
      .setTimestamp();

    const row1 = this.music.createPlayerControls();
    const row2 = this.music.createVolumeControls();

    await interaction.reply({ embeds: [embed], components: [row1, row2] });
  }

  /**
   * Commande /disconnect - Déconnecte le bot du salon vocal
   */
  async handleDisconnect(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Le bot n\'est pas connecté à un salon vocal !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    try {
      const voiceChannel = interaction.guild.channels.cache.get(player.voiceId);
      player.destroy();
      
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🚪 Déconnexion')
        .setDescription(`Déconnecté de **${voiceChannel?.name || 'salon vocal'}**`)
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur disconnect:', error);
      await interaction.reply({
        content: '❌ Erreur lors de la déconnexion !',
        ephemeral: true
      });
    }
  }

  /**
   * Commande /repeat - Active/désactive la répétition
   */
  async handleRepeat(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    const mode = interaction.options.getString('mode') || 'off';
    
    try {
      switch (mode) {
        case 'track':
          player.setLoop('track');
          break;
        case 'queue':
          player.setLoop('queue');
          break;
        case 'off':
        default:
          player.setLoop('none');
          break;
      }

      const modeText = {
        'track': '🔂 Répétition de la piste activée',
        'queue': '🔁 Répétition de la queue activée', 
        'off': '❌ Répétition désactivée'
      };
      
      const embed = new EmbedBuilder()
        .setColor(mode === 'off' ? 0xff9900 : 0x00ff00)
        .setTitle('🔁 Répétition')
        .setDescription(modeText[mode] || modeText['off'])
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur repeat:', error);
      await interaction.reply({
        content: '❌ Erreur lors du changement de mode de répétition !',
        ephemeral: true
      });
    }
  }

  /**
   * Commande /clear - Vide la file d'attente
   */
  async handleClear(interaction) {
    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    if (!this.isInVoiceChannel(interaction, player)) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    if (player.queue.size === 0) {
      return interaction.reply({
        content: '❌ La file d\'attente est déjà vide !',
        ephemeral: true
      });
    }

    try {
      const clearedCount = player.queue.size;
      player.queue.clear();
      
      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('🗑️ Queue vidée')
        .setDescription(`**${clearedCount}** musique${clearedCount > 1 ? 's' : ''} supprimée${clearedCount > 1 ? 's' : ''} de la queue`)
        .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[Music] Erreur clear:', error);
      await interaction.reply({
        content: '❌ Erreur lors du vidage de la queue !',
        ephemeral: true
      });
    }
  }

  /**
   * Vérifie si l'utilisateur est dans le même salon vocal que le bot
   */
  isInVoiceChannel(interaction, player) {
    const memberChannel = interaction.member.voice?.channel;
    const botChannel = interaction.guild.channels.cache.get(player.voiceId);
    
    return memberChannel && botChannel && memberChannel.id === botChannel.id;
  }
}

module.exports = MusicCommands;