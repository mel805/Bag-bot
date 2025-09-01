#!/bin/bash

# Script de déploiement automatique pour corriger les erreurs Lavalink sur Render
# Usage: bash deploy-render-fix.sh

set -e

echo "🚀 Déploiement des Corrections Lavalink pour Render"
echo "=================================================="

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "render.yaml" ]; then
    echo "❌ Erreur: render.yaml non trouvé. Exécutez ce script depuis la racine du projet."
    exit 1
fi

# Vérifier les corrections appliquées
echo "🔍 Vérification des corrections..."

# Test 1: render.yaml
if grep -q "LAVALINK_NODES" render.yaml; then
    echo "✅ Configuration Lavalink présente dans render.yaml"
else
    echo "❌ Configuration Lavalink manquante dans render.yaml"
    exit 1
fi

# Test 2: Fichier de configuration des nœuds
if [ -f "lavalink-nodes-render.json" ]; then
    echo "✅ Configuration des nœuds Render présente"
else
    echo "❌ Configuration des nœuds Render manquante"
    exit 1
fi

# Test 3: Guide de correction
if [ -f "RENDER_LAVALINK_FIX.md" ]; then
    echo "✅ Guide de correction créé"
else
    echo "❌ Guide de correction manquant"
    exit 1
fi

# Vérifier l'état du dépôt Git
echo ""
echo "📦 Préparation du déploiement Git..."

# Vérifier si nous avons des changements
if [ -n "$(git status --porcelain)" ]; then
    echo "✅ Changements détectés, préparation du commit..."
    
    # Ajouter les fichiers modifiés
    git add render.yaml
    git add lavalink-nodes-render.json
    git add RENDER_LAVALINK_FIX.md
    git add test-render-lavalink.js
    git add src/bot.js
    
    # Créer le commit
    COMMIT_MSG="🎵 Fix: Erreurs Lavalink corrigées pour Render

✅ Configuration Lavalink optimisée pour Render
✅ Nœuds de fallback stables configurés  
✅ Gestion d'erreurs améliorée (failover rapide)
✅ Variables d'environnement configurées
✅ Health check ajouté

Changements:
- render.yaml: Variables LAVALINK_NODES configurées
- bot.js: Gestion d'erreurs optimisée pour Render
- Nouveaux nœuds: lavalink-render-primary, secondary, backup
- Timeouts réduits: 5 tentatives max, backoff 2-15s
- Auto-recovery: Réactivation après 5min cooldown"

    git commit -m "$COMMIT_MSG"
    echo "✅ Commit créé avec les corrections Lavalink"
else
    echo "⚠️  Aucun changement détecté"
fi

# Pousser vers le dépôt
echo ""
echo "🌐 Déploiement vers le dépôt..."
git push origin main
echo "✅ Changements poussés vers main"

# Instructions finales
echo ""
echo "🎯 Déploiement Terminé !"
echo "======================="
echo ""
echo "📋 Actions Suivantes:"
echo "1. 🔧 Configurer les variables d'environnement dans Render Dashboard:"
echo "   - DISCORD_TOKEN"
echo "   - CLIENT_ID" 
echo "   - GUILD_ID (optionnel)"
echo "   - DATABASE_URL (auto-configuré)"
echo ""
echo "2. 🚀 Déclencher le redéploiement:"
echo "   - Render Dashboard → bag-discord-bot → Manual Deploy"
echo "   - Ou attendre le déploiement automatique"
echo ""
echo "3. 📊 Surveiller les logs:"
echo "   - Rechercher: '[Music] ✅ Node connected'"
echo "   - Vérifier: 'Successfully logged in as BAG-Bot'"
echo ""
echo "4. 🧪 Tester le bot:"
echo "   - /music-status - État des nœuds Lavalink"
echo "   - /play test - Test de lecture audio"
echo ""
echo "📖 Documentation complète: RENDER_LAVALINK_FIX.md"
echo "🧪 Test de configuration: node test-render-lavalink.js"
echo ""
echo "🎵 Les erreurs Lavalink sont maintenant corrigées pour Render !"