#!/bin/bash

# Script de démarrage du système musique sur Freebox Delta
# Optimisé pour les ressources disponibles sur VM Freebox

echo "🏠 Démarrage BAG Discord Bot sur Freebox Delta..."

# Variables d'environnement pour Freebox
export NODE_ENV="production"
export ENABLE_MUSIC="true" 
export MUSIC_V3_ONLY="true"

# Configuration Lavalink pour Freebox (plus de ressources disponibles)
export LAVALINK_NODES='[
  {
    "identifier": "darrennathanael-ssl",
    "host": "lavalink.darrennathanael.com",
    "port": 443,
    "password": "darrennathanael.com",
    "secure": true,
    "retryAmount": 3,
    "retryDelay": 2000,
    "priority": 1,
    "timeout": 3000
  },
  {
    "identifier": "ajieblogs-v3",
    "host": "lava-v3.ajieblogs.eu.org",
    "port": 80,
    "password": "https://dsc.gg/ajidevserver",
    "secure": false,
    "retryAmount": 3,
    "retryDelay": 3000,
    "priority": 2,
    "timeout": 4000
  },
  {
    "identifier": "oops-wtf-ssl",
    "host": "lavalink.oops.wtf",
    "port": 443,
    "password": "www.freelavalink.ga",
    "secure": true,
    "retryAmount": 2,
    "retryDelay": 5000,
    "priority": 3,
    "timeout": 5000
  }
]'

# Limites adaptées pour Freebox (plus généreuses que Render)
export MUSIC_MAX_CONCURRENT_CONNECTIONS="5"
export MUSIC_MAX_QUEUE_SIZE="100"
export MUSIC_MAX_TRACK_DURATION="3600"  # 1 heure
export DISCORD_MAX_VOICE_CONNECTIONS="3"
export MUSIC_CONNECTION_TIMEOUT="5000"

# Configuration des sauvegardes Freebox
export FREEBOX_BACKUP_PATH="/media/Freebox/Disque dur/BAG-Backups"

echo "🎵 Configuration musique activée avec 3 nœuds Lavalink"
echo "💾 Chemin de sauvegarde: $FREEBOX_BACKUP_PATH"
echo "🔧 Limites: Queue=$MUSIC_MAX_QUEUE_SIZE, Connexions=$MUSIC_MAX_CONCURRENT_CONNECTIONS"

# Démarrage avec restauration automatique
echo "🔄 Tentative de restauration automatique..."
node src/migrate/render-restore.js

echo "📡 Déploiement des commandes Discord..."
node src/deploy-commands.js

echo "🚀 Démarrage du bot..."
node src/bot.js