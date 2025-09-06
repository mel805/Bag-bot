const { EmbedBuilder } = require('discord.js');

/**
 * Gestionnaire des interactions du player de musique (boutons)
 */

class MusicInteractions {
  constructor(musicManager) {
    this.music = musicManager;
  }

  /**
   * Gère toutes les interactions liées à la musique
   */
  async handleMusicInteraction(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('music_')) {
      return false;
    }

    const player = this.music.getPlayer(interaction.guildId);
    
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique en cours de lecture !',
        ephemeral: true
      });
    }

    // Vérifier si l'utilisateur est dans le salon vocal
    const memberChannel = interaction.member.voice?.channel;
    const botChannel = interaction.guild.channels.cache.get(player.voiceId);
    
    if (!memberChannel || !botChannel || memberChannel.id !== botChannel.id) {
      return interaction.reply({
        content: '❌ Vous devez être dans le même salon vocal que le bot !',
        ephemeral: true
      });
    }

    const customId = interaction.customId;

    try {
      await interaction.deferUpdate();

      switch (customId) {
        case 'music_pause_resume':
          await this.handlePauseResume(interaction, player);
          break;
        case 'music_skip':
          await this.handleSkip(interaction, player);
          break;
        case 'music_previous':
          await this.handlePrevious(interaction, player);
          break;
        case 'music_stop':
          await this.handleStop(interaction, player);
          break;
        case 'music_queue':
          await this.handleQueueDisplay(interaction, player);
          break;
        case 'music_vol_down':
          await this.handleVolumeDown(interaction, player);
          break;
        case 'music_vol_up':
          await this.handleVolumeUp(interaction, player);
          break;
        case 'music_shuffle':
          await this.handleShuffle(interaction, player);
          break;
        case 'music_repeat':
          await this.handleRepeat(interaction, player);
          break;
        case 'music_disconnect':
          await this.handleDisconnect(interaction, player);
          break;
        default:
          return false;
      }

      return true;
    } catch (error) {
      console.error(`[Music] Erreur interaction ${customId}:`, error);
      try {
        await interaction.followUp({
          content: `❌ Erreur lors de l'exécution de l'action !`,
          ephemeral: true
        });
      } catch (e) {
        console.error('[Music] Erreur envoi message d\'erreur:', e);
      }
      return true;
    }
  }

  /**
   * Gère le bouton pause/resume
   */
  async handlePauseResume(interaction, player) {
    const wasPaused = player.paused;
    player.pause(!wasPaused);
    
    const embed = new EmbedBuilder()
      .setColor(wasPaused ? 0x00ff00 : 0xff9900)
      .setTitle(wasPaused ? '▶️ Lecture reprise' : '⏸️ Lecture en pause')
      .setDescription(player.queue.current ? `**${player.queue.current.title}**` : 'Musique actuelle')
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère le bouton skip
   */
  async handleSkip(interaction, player) {
    const currentTrack = player.queue.current;
    
    if (player.queue.size === 0 && !currentTrack) {
      return interaction.followUp({
        content: '❌ Aucune musique suivante dans la queue !',
        ephemeral: true
      });
    }

    player.skip();
    
    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('⏭️ Musique passée')
      .setDescription(currentTrack ? `**${currentTrack.title}** a été passée` : 'Musique passée')
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère le bouton previous (si supporté)
   */
  async handlePrevious(interaction, player) {
    // Kazagumo ne supporte pas nativement le previous, on peut implémenter une logique custom
    await interaction.followUp({
      content: '❌ La fonction "précédent" n\'est pas encore disponible !',
      ephemeral: true
    });
  }

  /**
   * Gère le bouton stop
   */
  async handleStop(interaction, player) {
    player.queue.clear();
    player.stop();
    
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('⏹️ Musique arrêtée')
      .setDescription('La lecture a été arrêtée et la queue vidée.')
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère l'affichage de la queue
   */
  async handleQueueDisplay(interaction, player) {
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
      const tracks = queue.slice(0, 5).map((track, index) => 
        `\`${index + 1}.\` [**${track.title}**](${track.uri})\n👤 ${track.author || 'Inconnu'} • ⏱️ ${this.music.formatDuration(track.length)}`
      ).join('\n\n');

      embed.addFields({
        name: `🎶 À venir (${queue.size} musique${queue.size > 1 ? 's' : ''})`,
        value: tracks + (queue.size > 5 ? `\n\n*... et ${queue.size - 5} autre${queue.size - 5 > 1 ? 's' : ''}*` : ''),
        inline: false
      });
    } else {
      embed.addFields({
        name: '📭 File d\'attente vide',
        value: 'Ajoutez des musiques avec `/play` !',
        inline: false
      });
    }

    embed.setFooter({ 
      text: `Volume: ${player.volume}% • Répétition: ${this.getLoopText(player.loop)}` 
    });

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère la diminution du volume
   */
  async handleVolumeDown(interaction, player) {
    const newVolume = Math.max(0, player.volume - 10);
    player.setVolume(newVolume);
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🔉 Volume diminué')
      .setDescription(`Volume: **${newVolume}%**`)
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère l'augmentation du volume
   */
  async handleVolumeUp(interaction, player) {
    const newVolume = Math.min(200, player.volume + 10);
    player.setVolume(newVolume);
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🔊 Volume augmenté')
      .setDescription(`Volume: **${newVolume}%**`)
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère le mélange de la queue
   */
  async handleShuffle(interaction, player) {
    if (player.queue.size < 2) {
      return interaction.followUp({
        content: '❌ Il faut au moins 2 musiques dans la queue pour mélanger !',
        ephemeral: true
      });
    }

    player.queue.shuffle();
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🔀 Queue mélangée')
      .setDescription(`**${player.queue.size}** musiques ont été mélangées !`)
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère la répétition
   */
  async handleRepeat(interaction, player) {
    // Cycle through repeat modes: none -> track -> queue -> none
    let newLoop;
    switch (player.loop) {
      case 'none':
        newLoop = 'track';
        break;
      case 'track':
        newLoop = 'queue';
        break;
      case 'queue':
      default:
        newLoop = 'none';
        break;
    }

    player.setLoop(newLoop);

    const modeText = {
      'track': '🔂 Répétition de la piste activée',
      'queue': '🔁 Répétition de la queue activée', 
      'none': '❌ Répétition désactivée'
    };
    
    const embed = new EmbedBuilder()
      .setColor(newLoop === 'none' ? 0xff9900 : 0x00ff00)
      .setTitle('🔁 Répétition')
      .setDescription(modeText[newLoop])
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Gère la déconnexion
   */
  async handleDisconnect(interaction, player) {
    const voiceChannel = interaction.guild.channels.cache.get(player.voiceId);
    player.destroy();
    
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🚪 Déconnexion')
      .setDescription(`Déconnecté de **${voiceChannel?.name || 'salon vocal'}**`)
      .setFooter({ text: `Par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  /**
   * Convertit le mode de répétition en texte
   */
  getLoopText(loop) {
    switch (loop) {
      case 'track':
        return 'Piste';
      case 'queue':
        return 'Queue';
      case 'none':
      default:
        return 'Désactivée';
    }
  }
}

module.exports = MusicInteractions;