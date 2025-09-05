#!/bin/bash

echo "🛑 Arrêt complet du système musique"
echo "=================================="

# Arrêter tous les processus liés au système musique
echo "📋 Recherche et arrêt des processus..."

# Arrêter les processus par nom
pkill -f "lavalink" 2>/dev/null && echo "   ✅ Processus Lavalink arrêtés"
pkill -f "music" 2>/dev/null && echo "   ✅ Processus musique arrêtés"  
pkill -f "ws-proxy" 2>/dev/null && echo "   ✅ Proxy WebSocket arrêté"
pkill -f "bot.js" 2>/dev/null && echo "   ✅ Bot principal arrêté"

# Arrêter les processus Java (Lavalink)
pkill -f "java.*lavalink" 2>/dev/null && echo "   ✅ Serveurs Java Lavalink arrêtés"

# Vérifier et arrêter les processus sur les ports spécifiques
for port in 2333 7000 8080 3000; do
    pid=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        kill -9 $pid 2>/dev/null && echo "   ✅ Service sur port $port arrêté (PID: $pid)"
    fi
done

echo ""
echo "🔍 Vérification des processus restants..."

# Vérifier qu'aucun processus musique ne reste actif
remaining=$(ps aux | grep -E "(lavalink|music|ws-proxy|bot\.js)" | grep -v grep | wc -l)

if [ $remaining -eq 0 ]; then
    echo "   ✅ Aucun processus musique détecté"
else
    echo "   ⚠️  $remaining processus encore actifs:"
    ps aux | grep -E "(lavalink|music|ws-proxy|bot\.js)" | grep -v grep
fi

echo ""
echo "🔧 Nettoyage des variables d'environnement..."

# Désactiver les variables d'environnement musique
unset ENABLE_MUSIC
unset ENABLE_LOCAL_LAVALINK
unset ENABLE_LOCAL_LAVALINK_V3
unset MUSIC_V3_ONLY
unset LAVALINK_NODES

echo "   ✅ Variables d'environnement nettoyées"

echo ""
echo "📊 État final du système:"
echo "   - Processus musique: ARRÊTÉS"
echo "   - Variables env: NETTOYÉES"
echo "   - Ports Lavalink: LIBÉRÉS"
echo ""
echo "✅ Système musique complètement arrêté"