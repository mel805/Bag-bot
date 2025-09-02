#!/bin/bash

# Script de diagnostic rapide pour Render
# Vérifie les problèmes de configuration sans déployer

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[DEBUG]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "🔍 Diagnostic Render - Bag Discord Bot"
echo "======================================"

# Vérifier les fichiers de configuration
log_info "Vérification des fichiers de configuration..."

if [ -f "package.json" ]; then
    log_success "package.json trouvé"
else
    log_error "package.json manquant"
    exit 1
fi

if [ -f "render.yaml" ]; then
    log_success "render.yaml trouvé"
else
    log_error "render.yaml manquant"
    exit 1
fi

# Vérifier les scripts npm
log_info "Vérification des scripts npm..."
if grep -q "render-start" package.json; then
    log_success "Script render-start défini"
else
    log_error "Script render-start manquant"
fi

# Vérifier les dépendances
log_info "Vérification des dépendances..."
if [ -d "node_modules" ]; then
    log_success "node_modules présent"
else
    log_warning "node_modules manquant - exécuter 'npm ci'"
fi

# Vérifier les variables d'environnement critiques
log_info "Vérification des variables d'environnement..."

check_env_var() {
    local var_name=$1
    local is_critical=$2
    
    if [ -z "${!var_name}" ]; then
        if [ "$is_critical" = "true" ]; then
            log_error "$var_name: MANQUANT (CRITIQUE)"
        else
            log_warning "$var_name: MANQUANT (optionnel)"
        fi
        return 1
    else
        log_success "$var_name: DÉFINI"
        return 0
    fi
}

critical_missing=0

# Variables critiques
check_env_var "DISCORD_TOKEN" "true" || ((critical_missing++))
check_env_var "CLIENT_ID" "true" || ((critical_missing++))
check_env_var "GUILD_ID" "true" || ((critical_missing++))
check_env_var "DATABASE_URL" "true" || ((critical_missing++))

# Variables optionnelles
check_env_var "GITHUB_TOKEN" "false" || true
check_env_var "GITHUB_REPO" "false" || true
check_env_var "LOCATIONIQ_TOKEN" "false" || true
check_env_var "LEVEL_CARD_LOGO_URL" "false" || true

echo ""
echo "📊 RÉSUMÉ DU DIAGNOSTIC"
echo "======================"

if [ $critical_missing -eq 0 ]; then
    log_success "✅ Toutes les variables critiques sont définies"
    log_info "Le bot devrait démarrer correctement"
else
    log_error "❌ $critical_missing variable(s) critique(s) manquante(s)"
    log_error "Le déploiement ÉCHOUERA jusqu'à ce qu'elles soient configurées"
    
    echo ""
    echo "🚨 ACTIONS REQUISES:"
    echo "1. Aller sur https://dashboard.render.com"
    echo "2. Sélectionner le service 'bag-discord-bot'"
    echo "3. Onglet 'Environment'"
    echo "4. Ajouter les variables manquantes"
    echo "5. Redéployer manuellement"
fi

echo ""
echo "🔗 Liens utiles:"
echo "- Dashboard Render: https://dashboard.render.com"
echo "- Documentation: https://render.com/docs/environment-variables"
echo "- Discord Developer Portal: https://discord.com/developers/applications"