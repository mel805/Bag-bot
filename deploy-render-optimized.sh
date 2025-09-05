#!/bin/bash

echo "🚀 Déploiement Render avec optimisations anti-blocage"
echo "====================================================="

# Vérifier que les optimisations ont été appliquées
if [ ! -f "src/bot.js.backup" ]; then
    echo "❌ Optimisations non appliquées ! Exécutez d'abord:"
    echo "   node render-optimization-patch.js"
    exit 1
fi

echo "✅ Optimisations détectées"

# Vérifier les fichiers critiques
echo ""
echo "🔍 Vérification des fichiers..."

files_to_check=(
    "src/bot.js"
    "package.json"
    "render-optimized.yaml"
    "scripts/parallel-start.js"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (manquant)"
        exit 1
    fi
done

# Vérifier que les optimisations sont présentes dans le code
echo ""
echo "🔧 Vérification des optimisations..."

optimizations=(
    "immediatelyDeferInteraction"
    "renderSafeReply"
    "RENDER-OPT"
    "isRenderEnvironment"
)

for opt in "${optimizations[@]}"; do
    if grep -q "$opt" src/bot.js; then
        echo "  ✅ $opt"
    else
        echo "  ❌ $opt (manquant)"
        echo "     Réappliquez le patch: node render-optimization-patch.js"
        exit 1
    fi
done

echo ""
echo "📊 Statistiques du bot optimisé:"
original_size=$(wc -c < src/bot.js.backup)
optimized_size=$(wc -c < src/bot.js)
difference=$((optimized_size - original_size))

echo "  - Taille originale: $original_size bytes"
echo "  - Taille optimisée: $optimized_size bytes"
echo "  - Différence: +$difference bytes"

echo ""
echo "🎯 Optimisations appliquées:"
echo "  ✅ Defer immédiat de toutes les interactions"
echo "  ✅ Timeouts réseau réduits (max 2000ms)"
echo "  ✅ Fallbacks pour réponses critiques"
echo "  ✅ Détection environnement Render"
echo "  ✅ Configuration Lavalink V3 optimisée"
echo "  ✅ Variables d'environnement spécialisées"

echo ""
echo "📋 Instructions de déploiement:"
echo "1. Commitez les changements:"
echo "   git add ."
echo "   git commit -m 'Optimisations Render anti-blocage'"
echo "   git push"
echo ""
echo "2. Dans Render Dashboard:"
echo "   - Utilisez le fichier render-optimized.yaml"
echo "   - Ou copiez les variables d'environnement manuellement"
echo ""
echo "3. Variables d'environnement critiques à configurer:"
echo "   RENDER=true"
echo "   FORCE_DEFER_ALL_INTERACTIONS=true"
echo "   REDUCE_NETWORK_TIMEOUTS=true"
echo "   ENABLE_RENDER_OPTIMIZATIONS=true"
echo "   MUSIC_V3_ONLY=true"

echo ""
echo "🎉 Le bot est prêt pour un déploiement Render optimisé !"
echo "💡 Les commandes ne devraient plus rester bloquées sur 'réfléchit'"

# Créer un fichier de configuration rapide pour Render
cat > render-env-vars.txt << EOF
# Variables d'environnement Render optimisées
# Copiez ces valeurs dans Render Dashboard > Environment

RENDER=true
NODE_ENV=production
FORCE_DEFER_ALL_INTERACTIONS=true
REDUCE_NETWORK_TIMEOUTS=true
ENABLE_RENDER_OPTIMIZATIONS=true
DEFAULT_TIMEOUT=1500
NETWORK_TIMEOUT=2000
INTERACTION_TIMEOUT=2500
ENABLE_MUSIC=true
ENABLE_LOCAL_LAVALINK=false
ENABLE_LOCAL_LAVALINK_V3=false
MUSIC_V3_ONLY=true
LAVALINK_NODES=[{"identifier":"ajieblogs-v3-render","host":"lava-v3.ajieblogs.eu.org","port":80,"password":"https://dsc.gg/ajidevserver","secure":false,"retryAmount":3,"retryDelay":5000,"priority":1}]
NODE_OPTIONS=--max-old-space-size=400 --optimize-for-size --max-semi-space-size=64
EOF

echo ""
echo "📄 Fichier créé: render-env-vars.txt"
echo "   (Variables d'environnement prêtes à copier dans Render)"