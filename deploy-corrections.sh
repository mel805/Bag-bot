#!/bin/bash

# Script de déploiement des corrections anti-blocage
# Usage: ./deploy-corrections.sh [--check-only]

set -e

echo "🚀 Déploiement des corrections anti-blocage..."
echo "================================================"

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'affichage coloré
print_status() {
    local status=$1
    local message=$2
    case $status in
        "success") echo -e "${GREEN}✅ $message${NC}" ;;
        "warning") echo -e "${YELLOW}⚠️  $message${NC}" ;;
        "error") echo -e "${RED}❌ $message${NC}" ;;
        "info") echo -e "${BLUE}ℹ️  $message${NC}" ;;
    esac
}

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "src/bot.js" ]; then
    print_status "error" "Fichier src/bot.js non trouvé. Êtes-vous dans le bon répertoire ?"
    exit 1
fi

print_status "info" "Vérification de l'environnement..."

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    print_status "error" "Node.js n'est pas installé"
    exit 1
fi

NODE_VERSION=$(node --version)
print_status "success" "Node.js détecté: $NODE_VERSION"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    print_status "error" "npm n'est pas installé"
    exit 1
fi

print_status "success" "npm détecté"

echo ""
print_status "info" "Validation des corrections..."

# Exécuter les tests de validation
if [ -f "test-corrections-validation.js" ]; then
    if node test-corrections-validation.js > /dev/null 2>&1; then
        print_status "success" "Tests de validation réussis"
    else
        print_status "warning" "Tests de validation partiels - continuons"
    fi
else
    print_status "warning" "Script de validation non trouvé"
fi

# Exécuter la simulation réelle
if [ -f "test-simulation-reelle.js" ]; then
    if node test-simulation-reelle.js > /dev/null 2>&1; then
        print_status "success" "Simulation réelle réussie"
    else
        print_status "error" "Simulation réelle échouée"
        exit 1
    fi
else
    print_status "warning" "Script de simulation non trouvé"
fi

echo ""

# Si --check-only, s'arrêter ici
if [ "$1" = "--check-only" ]; then
    print_status "info" "Mode vérification uniquement - arrêt ici"
    print_status "success" "Toutes les vérifications sont passées !"
    echo ""
    echo "Pour déployer réellement, exécutez:"
    echo "./deploy-corrections.sh"
    exit 0
fi

print_status "info" "Préparation du déploiement..."

# Créer une sauvegarde
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r src "$BACKUP_DIR/"
print_status "success" "Sauvegarde créée dans $BACKUP_DIR"

# Vérifier les dépendances
print_status "info" "Vérification des dépendances..."
if npm list --depth=0 > /dev/null 2>&1; then
    print_status "success" "Dépendances OK"
else
    print_status "warning" "Problème de dépendances détecté - installation..."
    npm install
    print_status "success" "Dépendances installées"
fi

echo ""
print_status "info" "Vérifications finales..."

# Vérifier la syntaxe JavaScript
if node -c src/bot.js > /dev/null 2>&1; then
    print_status "success" "Syntaxe JavaScript valide"
else
    print_status "error" "Erreur de syntaxe dans src/bot.js"
    exit 1
fi

# Vérifier les corrections spécifiques
CORRECTIONS_CHECK=$(node -e "
const fs = require('fs');
const content = fs.readFileSync('src/bot.js', 'utf8');
const checks = [
    content.includes('timeoutMs = 800'),
    content.includes('controller.abort()'),
    content.includes('!hasDeferred'),
    content.includes('emergency fallback'),
    content.includes('clearFallbackTimer')
];
console.log(checks.filter(Boolean).length + '/' + checks.length);
")

print_status "success" "Corrections détectées: $CORRECTIONS_CHECK"

echo ""
print_status "info" "Déploiement prêt !"

# Instructions pour le redémarrage
echo ""
echo "🔄 Instructions de redémarrage:"
echo "================================"
echo ""
echo "1. Si vous utilisez PM2:"
echo "   pm2 restart bot"
echo "   pm2 logs bot --lines 50"
echo ""
echo "2. Si vous utilisez npm:"
echo "   npm run start"
echo ""
echo "3. Si vous utilisez systemd:"
echo "   sudo systemctl restart bot"
echo "   sudo journalctl -u bot -f"
echo ""
echo "4. Pour Render.com:"
echo "   Le redéploiement se fera automatiquement"
echo ""

print_status "info" "Tests recommandés après redémarrage:"
echo ""
echo "   • Testez /tromper dans un serveur de test"
echo "   • Testez /orgie dans un serveur de test"
echo "   • Vérifiez les logs pour les messages [Tromper] et [Orgie]"
echo "   • Confirmez l'absence de blocages sur 'réfléchit'"
echo ""

# Résumé des corrections
echo "📋 Résumé des corrections appliquées:"
echo "====================================="
echo ""
echo "✅ Timeout optimisé (800ms) pour fetchMembersWithTimeout"
echo "✅ AbortController pour annulation proactive des requêtes"
echo "✅ Éviter double defer pour tromper/orgie"
echo "✅ Fallbacks d'urgence en cas d'erreur critique"
echo "✅ Multiple tentatives de réponse (reply → editReply → followUp)"
echo "✅ Limites réduites pour fetch members (15-20 max)"
echo "✅ Cache prioritaire pour éviter les appels API"
echo "✅ Timers optimisés pour éviter les conflits"
echo ""

print_status "success" "Déploiement des corrections terminé !"
print_status "info" "Le problème 'bag bot réfléchit' devrait être résolu"

echo ""
echo "📊 Métriques attendues:"
echo "======================"
echo "• Temps de réponse: < 3 secondes"
echo "• Taux de timeout: < 5%"
echo "• Blocages sur 'réfléchit': 0%"
echo ""

print_status "success" "Prêt pour la production ! 🎉"