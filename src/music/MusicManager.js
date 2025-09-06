const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo, KazagumoPlayer } = require('kazagumo');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Gestionnaire de musique complet pour le bot BAG
 * Utilise Shoukaku + Kazagumo pour une expérience musicale optimale
 */

class MusicManager {
  constructor(client) {
    this.client = client;
    this.shoukaku = null;
    this.kazagumo = null;
    this.isReady = false;
    
    // Configuration des nœuds Lavalink publics
    this.nodes = [
      {
        name: 'lavalink-repl',
        url: 'lavalink-repl.techgamingyt.repl.co:443',
        auth: 'techgamingyt',
        secure: true
      },
      {
        name: 'lavalink-public',
        url: 'lavalink.devamop.in:443',
        auth: 'DevamOP',
        secure: true
      },
      {
        name: 'lavalink-darrennathanael',
        url: 'lavalink.darrennathanael.com:80',
        auth: 'darrennathanael.com',
        secure: false
      },
      {
        name: 'lavalink-eu',
        url: 'eu-lavalink.lexnet.cc:443',
        auth: 'lexn3t',
        secure: true
      },
      {
        name: 'lavalink-us',
        url: 'us-lavalink.lexnet.cc:443',
        auth: 'lexn3t',
        secure: true
      }
    ];
    
    // Configuration des options
    this.shoukakuOptions = {
      resume: true,
      resumeTimeout: 30,
      reconnectTries: 3,
      restTimeout: 10000,
      moveOnDisconnect: false,
      userAgent: 'BAG-Discord-Bot/1.0 (https://github.com/bag-discord-bot)'
    };
    
    this.kazagumoOptions = {
      defaultSearchEngine: 'youtube',
      send: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
      plugins: []
    };
  }

  /**
   * Initialise le système de musique
   */
  async initialize() {
    try {
      console.log('[Music] Initialisation du système de musique...');
      
      // Initialiser Shoukaku
      this.shoukaku = new Shoukaku(
        new Connectors.DiscordJS(this.client),
        this.nodes,
        this.shoukakuOptions
      );
      
      // Initialiser Kazagumo
      this.kazagumo = new Kazagumo(this.kazagumoOptions, new Connectors.DiscordJS(this.client), this.nodes);
      
      // Configurer les événements
      this.setupEvents();
      
      // Marquer comme prêt
      this.isReady = true;
      
      console.log('[Music] ✅ Système de musique initialisé avec succès');
      console.log(`[Music] 📡 ${this.nodes.length} nœuds Lavalink configurés`);
      
    } catch (error) {
      console.error('[Music] ❌ Erreur lors de l\'initialisation:', error);
      throw error;
    }
  }

  /**
   * Configure les événements du système de musique
   */
  setupEvents() {
    // Événements Shoukaku
    this.shoukaku.on('ready', (name, reconnected) => {
      const status = reconnected ? 'reconnecté' : 'connecté';
      console.log(`[Music] 🎵 Nœud ${name} ${status}`);
    });

    this.shoukaku.on('error', (name, error) => {
      console.error(`[Music] ❌ Erreur nœud ${name}:`, error.message);
    });

    this.shoukaku.on('close', (name, code, reason) => {
      console.warn(`[Music] ⚠️ Nœud ${name} fermé (${code}): ${reason}`);
    });

    this.shoukaku.on('disconnect', (name, count) => {
      console.warn(`[Music] 🔌 Nœud ${name} déconnecté (tentative ${count})`);
    });

    // Événements Kazagumo
    this.kazagumo.on('playerStart', (player, track) => {
      console.log(`[Music] ▶️ Lecture démarrée: ${track.title} dans ${player.guildId}`);
      this.sendNowPlayingMessage(player, track);
    });

    this.kazagumo.on('playerEnd', (player, track, reason) => {
      console.log(`[Music] ⏹️ Lecture terminée: ${track.title} (${reason})`);
    });

    this.kazagumo.on('playerEmpty', (player) => {
      console.log(`[Music] 📭 Queue vide pour ${player.guildId}`);
      this.sendQueueEmptyMessage(player);
    });

    this.kazagumo.on('playerError', (player, error) => {
      console.error(`[Music] ❌ Erreur player ${player.guildId}:`, error.message);
      this.sendErrorMessage(player, error);
    });

    this.kazagumo.on('playerStuck', (player, track, threshold) => {
      console.warn(`[Music] ⚠️ Player bloqué: ${track.title} (${threshold}ms)`);
    });
  }

  /**
   * Recherche et joue une musique
   */
  async play(interaction, query) {
    try {
      if (!interaction.member.voice?.channel) {
        return interaction.reply({
          content: '❌ Vous devez être dans un salon vocal pour utiliser cette commande !',
          ephemeral: true
        });
      }

      const voiceChannel = interaction.member.voice.channel;
      
      // Vérifier les permissions
      const permissions = voiceChannel.permissionsFor(this.client.user);
      if (!permissions.has(['Connect', 'Speak'])) {
        return interaction.reply({
          content: '❌ Je n\'ai pas les permissions pour rejoindre ou parler dans ce salon vocal !',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      // Rechercher la musique
      const result = await this.kazagumo.search(query, {
        requester: interaction.user
      });

      if (!result || !result.tracks.length) {
        return interaction.editReply({
          content: '❌ Aucun résultat trouvé pour votre recherche !'
        });
      }

      // Créer ou récupérer le player
      let player = this.kazagumo.players.get(interaction.guildId);
      
      if (!player) {
        player = await this.kazagumo.createPlayer({
          guildId: interaction.guildId,
          textId: interaction.channelId,
          voiceId: voiceChannel.id,
          deaf: true
        });
      }

      // Ajouter les pistes à la queue
      if (result.type === 'PLAYLIST') {
        for (const track of result.tracks) {
          player.queue.add(track);
        }
        
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('📋 Playlist ajoutée !')
          .setDescription(`**${result.playlistName}**\n${result.tracks.length} pistes ajoutées à la queue`)
          .setThumbnail(result.tracks[0]?.thumbnail || null)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        const track = result.tracks[0];
        player.queue.add(track);

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Musique ajoutée !')
          .setDescription(`[**${track.title}**](${track.uri})`)
          .addFields(
            { name: '👤 Artiste', value: track.author || 'Inconnu', inline: true },
            { name: '⏱️ Durée', value: this.formatDuration(track.length), inline: true },
            { name: '🎯 Position', value: `${player.queue.size}`, inline: true }
          )
          .setThumbnail(track.thumbnail)
          .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      // Démarrer la lecture si ce n'est pas déjà fait
      if (!player.playing && !player.paused) {
        await player.play();
      }

    } catch (error) {
      console.error('[Music] Erreur lors de la lecture:', error);
      const content = error.message.includes('No available nodes') 
        ? '❌ Aucun serveur de musique disponible. Réessayez dans quelques instants.'
        : `❌ Erreur lors de la lecture: ${error.message}`;
        
      if (interaction.deferred) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    }
  }

  /**
   * Envoie le message "En cours de lecture"
   */
  async sendNowPlayingMessage(player, track) {
    try {
      const channel = this.client.channels.cache.get(player.textId);
      if (!channel) return;

      const guild = this.client.guilds.cache.get(player.guildId);
      const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle('🎵 En cours de lecture')
        .setDescription(`[**${track.title}**](${track.uri})`)
        .addFields(
          { name: '👤 Artiste', value: track.author || 'Inconnu', inline: true },
          { name: '⏱️ Durée', value: this.formatDuration(track.length), inline: true },
          { name: '🔊 Volume', value: `${player.volume}%`, inline: true }
        )
        .setThumbnail(track.thumbnail)
        .setFooter({ 
          text: guild ? guild.name : 'BAG Music Player', 
          iconURL: guild?.iconURL() || this.client.user.displayAvatarURL() 
        })
        .setTimestamp();

      const row = this.createPlayerControls();
      
      await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('[Music] Erreur envoi message now playing:', error);
    }
  }

  /**
   * Envoie le message "Queue vide"
   */
  async sendQueueEmptyMessage(player) {
    try {
      const channel = this.client.channels.cache.get(player.textId);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('📭 Queue terminée')
        .setDescription('Toutes les musiques ont été jouées. Ajoutez-en d\'autres avec `/play` !')
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      
      // Déconnecter après 5 minutes d'inactivité
      setTimeout(() => {
        if (player && !player.playing && player.queue.size === 0) {
          player.destroy();
        }
      }, 5 * 60 * 1000);
      
    } catch (error) {
      console.error('[Music] Erreur envoi message queue vide:', error);
    }
  }

  /**
   * Envoie un message d'erreur
   */
  async sendErrorMessage(player, error) {
    try {
      const channel = this.client.channels.cache.get(player.textId);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Erreur de lecture')
        .setDescription(`Une erreur s'est produite: ${error.message}`)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[Music] Erreur envoi message d\'erreur:', err);
    }
  }

  /**
   * Crée les contrôles du player
   */
  createPlayerControls() {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('music_previous')
          .setEmoji('⏮️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_pause_resume')
          .setEmoji('⏯️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('music_stop')
          .setEmoji('⏹️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('music_skip')
          .setEmoji('⏭️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_queue')
          .setEmoji('📋')
          .setStyle(ButtonStyle.Secondary)
      );
  }

  /**
   * Crée les contrôles de volume
   */
  createVolumeControls() {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('music_vol_down')
          .setEmoji('🔉')
          .setLabel('-10')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_vol_up')
          .setEmoji('🔊')
          .setLabel('+10')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_shuffle')
          .setEmoji('🔀')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_repeat')
          .setEmoji('🔁')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_disconnect')
          .setEmoji('🚪')
          .setStyle(ButtonStyle.Danger)
      );
  }

  /**
   * Formate la durée en mm:ss
   */
  formatDuration(ms) {
    if (!ms || ms === 0) return '🔴 En direct';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Obtient un player pour une guilde
   */
  getPlayer(guildId) {
    return this.kazagumo?.players.get(guildId) || null;
  }

  /**
   * Détruit un player
   */
  destroyPlayer(guildId) {
    const player = this.getPlayer(guildId);
    if (player) {
      player.destroy();
      return true;
    }
    return false;
  }

  /**
   * Vérifie si le système est prêt
   */
  isSystemReady() {
    return this.isReady && this.kazagumo && this.shoukaku;
  }

  /**
   * Obtient les statistiques du système
   */
  getStats() {
    if (!this.isSystemReady()) return null;
    
    return {
      players: this.kazagumo.players.size,
      nodes: this.shoukaku.nodes.size,
      connectedNodes: Array.from(this.shoukaku.nodes.values()).filter(node => node.state === 'CONNECTED').length,
      totalTracks: Array.from(this.kazagumo.players.values()).reduce((acc, player) => acc + player.queue.size, 0)
    };
  }
}

module.exports = MusicManager;