#!/bin/bash

echo "🎵 Activation du système musique (Render optimisé)"
echo "================================================="

# Vérifier que les nœuds sont accessibles
echo "🔍 Vérification de la connectivité des nœuds Lavalink..."

if ! node test-lavalink-simple.js; then
    echo "❌ Échec de la vérification des nœuds Lavalink"
    echo "🔧 Vérifiez votre connexion réseau"
    exit 1
fi

echo ""
echo "✅ Nœuds Lavalink vérifiés et fonctionnels"

# Configurer les variables d'environnement pour Render
echo "⚙️ Configuration des variables d'environnement..."

export ENABLE_MUSIC="true"
export ENABLE_LOCAL_LAVALINK="false"
export ENABLE_LOCAL_LAVALINK_V3="false"
export MUSIC_V3_ONLY="true"

# Charger la configuration des nœuds optimisée
export LAVALINK_NODES='[{"identifier":"darrennathanael-ssl","host":"lavalink.darrennathanael.com","port":443,"password":"darrennathanael.com","secure":true,"retryAmount":2,"retryDelay":3000,"priority":1,"timeout":2000,"note":"Primary SSL node - 61ms avg"},{"identifier":"ajieblogs-v3-backup","host":"lava-v3.ajieblogs.eu.org","port":80,"password":"https://dsc.gg/ajidevserver","secure":false,"retryAmount":2,"retryDelay":4000,"priority":2,"timeout":2000,"note":"Backup node - 471ms avg"}]'

# Limites pour Render
export MUSIC_MAX_CONCURRENT_CONNECTIONS="3"
export MUSIC_CONNECTION_TIMEOUT="2000"
export MUSIC_MAX_QUEUE_SIZE="25"
export MUSIC_MAX_TRACK_DURATION="600"
export MUSIC_ENABLE_FALLBACK="true"

# Limites Discord
export DISCORD_MAX_VOICE_CONNECTIONS="1"
export DISCORD_VOICE_TIMEOUT="5000"
export DISCORD_RECONNECT_ATTEMPTS="2"

# Optimisations Node.js pour Render
export NODE_OPTIONS="--max-old-space-size=400 --max-semi-space-size=64"
export RENDER="true"
export NODE_ENV="production"

echo "   ✅ Variables d'environnement configurées"

# Vérifier que le bot principal est prêt
if [ ! -f "src/bot.js" ]; then
    echo "❌ Fichier bot.js non trouvé"
    exit 1
fi

echo ""
echo "📊 Configuration active:"
echo "   🎵 Système musique: ACTIVÉ"
echo "   🌐 Nœuds Lavalink: 2 nœuds publics"
echo "   📈 Optimisé pour: Render + Discord"
echo "   💾 RAM limitée: 400MB"
echo "   ⏱️ Timeout max: 2000ms"
echo "   🔄 Connexions max: 3"
echo "   📀 Queue max: 25 titres"
echo "   ⏳ Durée max: 10 minutes"

echo ""
echo "🚀 Démarrage du bot avec système musique..."

# Démarrer le bot avec les optimisations
if [ "$1" = "--test" ]; then
    echo "🧪 Mode test - Vérification de la configuration uniquement"
    node -e "
    console.log('✅ Configuration Node.js validée');
    console.log('📊 Limites mémoire:', process.env.NODE_OPTIONS);
    console.log('🎵 Musique activée:', process.env.ENABLE_MUSIC);
    console.log('🌐 Nœuds:', JSON.parse(process.env.LAVALINK_NODES).length, 'configurés');
    "
else
    exec node src/bot.js
fi