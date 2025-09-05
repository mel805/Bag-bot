#!/bin/bash
# Script pour démarrer le bot avec le système musique activé

echo "🎵 Activation du système musique..."

# Configuration des variables d'environnement pour la musique
export ENABLE_MUSIC=true
export ENABLE_LOCAL_LAVALINK=false
export ENABLE_LOCAL_LAVALINK_V3=false

# Configuration d'un nœud Lavalink public fonctionnel
export LAVALINK_NODES='[{"identifier":"ajieblogs-v3-primary","host":"lava-v3.ajieblogs.eu.org","port":80,"password":"https://dsc.gg/ajidevserver","secure":false,"retryAmount":5,"retryDelay":8000,"priority":1}]'

echo "✅ Variables configurées :"
echo "   - ENABLE_MUSIC: $ENABLE_MUSIC"
echo "   - LAVALINK_NODES: Configuration publique"
echo "   - Local Lavalink: désactivé (utilisation du nœud public)"
echo ""
echo "🚀 Démarrage du bot..."

# Démarrer le bot avec la configuration musique
node src/bot.js