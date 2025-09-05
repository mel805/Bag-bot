#!/bin/bash

echo "🚀 Démarrage du bot Discord avec PM2..."

# Vérifier que le fichier .env existe
if [ ! -f ".env" ]; then
    echo "❌ Erreur: Fichier .env manquant!"
    echo "📋 Copiez .env.example vers .env et configurez vos variables Discord"
    exit 1
fi

# Charger les variables d'environnement
source .env

# Vérifier les variables critiques
if [ -z "$DISCORD_TOKEN" ] || [ "$DISCORD_TOKEN" = "YOUR_DISCORD_BOT_TOKEN_HERE" ]; then
    echo "❌ Erreur: DISCORD_TOKEN manquant ou non configuré!"
    echo "📋 Éditez le fichier .env et ajoutez votre token Discord"
    exit 1
fi

if [ -z "$GUILD_ID" ] || [ "$GUILD_ID" = "YOUR_DISCORD_GUILD_ID_HERE" ]; then
    echo "❌ Erreur: GUILD_ID manquant ou non configuré!"
    echo "📋 Éditez le fichier .env et ajoutez l'ID de votre serveur Discord"
    exit 1
fi

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "YOUR_DISCORD_CLIENT_ID_HERE" ]; then
    echo "❌ Erreur: CLIENT_ID manquant ou non configuré!"
    echo "📋 Éditez le fichier .env et ajoutez l'ID de votre application Discord"
    exit 1
fi

echo "✅ Variables d'environnement validées"

# Arrêter PM2 s'il tourne déjà
pm2 stop bag-discord-bot 2>/dev/null || true
pm2 delete bag-discord-bot 2>/dev/null || true

echo "🔄 Démarrage avec PM2..."
pm2 start ecosystem.config.js

echo "📊 Statut PM2:"
pm2 status

echo ""
echo "📋 Commandes utiles:"
echo "  pm2 status                    - Voir le statut"
echo "  pm2 logs bag-discord-bot      - Voir les logs"
echo "  pm2 restart bag-discord-bot   - Redémarrer"
echo "  pm2 stop bag-discord-bot      - Arrêter"
echo "  pm2 monit                     - Monitoring"