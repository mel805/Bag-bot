#!/bin/bash

# Script de déploiement automatisé pour Render (non-interactif)
# Version corrigée pour éviter les blocages de déploiement

set -e  # Arrêter le script en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
RENDER_SERVICE_NAME="bag-discord-bot"
PROJECT_DIR="/workspace"

# Fonction pour afficher les messages colorés
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_deploy() {
    echo -e "${PURPLE}[DEPLOY]${NC} $1"
}

# Fonction pour vérifier les prérequis
check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    # Vérifier si on est dans le bon répertoire
    if [ ! -f "package.json" ] || [ ! -f "render.yaml" ]; then
        log_error "Ce script doit être exécuté depuis la racine du projet"
        exit 1
    fi
    
    # Vérifier Git
    if ! command -v git &> /dev/null; then
        log_error "Git n'est pas installé"
        exit 1
    fi
    
    # Vérifier Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js n'est pas installé"
        exit 1
    fi
    
    # Vérifier npm
    if ! command -v npm &> /dev/null; then
        log_error "npm n'est pas installé"
        exit 1
    fi
    
    log_success "Prérequis vérifiés"
}

# Fonction pour vérifier le statut Git (non-interactive)
check_git_status() {
    log_info "Vérification du statut Git..."
    
    # Vérifier si on est dans un repo Git
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Ce n'est pas un repository Git"
        exit 1
    fi
    
    # Vérifier s'il y a des changements non commitées
    if ! git diff-index --quiet HEAD --; then
        log_warning "Il y a des changements non commitées"
        echo "Changements détectés:"
        git status --porcelain
        
        # En mode automatique, on commit automatiquement
        log_info "Commit automatique des changements..."
        git add .
        git commit -m "Auto-commit avant déploiement - $(date)"
        log_success "Changements commitées automatiquement"
    fi
    
    log_success "Statut Git OK"
}

# Fonction pour construire le projet (simplifiée)
build_project() {
    log_info "Construction du projet..."
    
    # Installer les dépendances
    npm ci
    log_success "Dépendances installées"
    
    # Test de syntaxe basique
    node -c src/bot.js
    log_success "Syntaxe JavaScript validée"
}

# Fonction pour créer un tag Git (automatique)
create_git_tag() {
    log_info "Création d'un tag Git pour ce déploiement..."
    
    # Obtenir la version depuis package.json
    VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    TAG_NAME="deploy-v${VERSION}-${TIMESTAMP}"
    
    # Créer le tag
    git tag -a "$TAG_NAME" -m "Déploiement automatique version $VERSION - $(date)" || true
    
    log_success "Tag créé: $TAG_NAME"
    
    # Pousser le tag automatiquement
    git push origin "$TAG_NAME" || log_warning "Impossible de pousser le tag"
}

# Fonction pour déclencher le déploiement
trigger_deployment() {
    log_deploy "Déclenchement du déploiement automatique..."
    
    # Pousser vers Git (déclenche le déploiement automatique sur Render)
    if git remote | grep -q "origin"; then
        # Essayer main puis master
        if git push origin main 2>/dev/null; then
            log_success "Code poussé vers origin/main"
        elif git push origin master 2>/dev/null; then
            log_success "Code poussé vers origin/master"
        else
            log_error "Impossible de pousser vers origin"
            exit 1
        fi
        log_deploy "Déploiement automatique déclenché sur Render"
    else
        log_warning "Aucun remote Git configuré"
        log_error "Configurez votre repository Git pour déclencher le déploiement automatique"
        exit 1
    fi
}

# Fonction pour afficher le résumé
show_summary() {
    echo ""
    log_success "✅ Déploiement initié avec succès!"
    echo ""
    echo "🔗 Liens utiles:"
    echo "   - Dashboard Render: https://dashboard.render.com/"
    echo "   - Logs: https://dashboard.render.com/web/srv-*/logs"
    echo ""
    echo "🎯 Prochaines étapes:"
    echo "   1. Surveillez les logs de déploiement Render"
    echo "   2. Configurez les variables d'environnement manquantes"
    echo "   3. Testez les commandes Discord après déploiement"
    echo ""
}

# Fonction principale (non-interactive)
main() {
    echo "🚀 DÉPLOIEMENT AUTOMATIQUE RENDER - BAG DISCORD BOT"
    echo "=================================================="
    echo ""
    
    # Vérifications préliminaires
    check_prerequisites
    check_git_status
    
    # Construction simplifiée
    build_project
    
    # Créer un tag pour ce déploiement
    create_git_tag
    
    # Déclencher le déploiement
    trigger_deployment
    
    # Afficher le résumé
    show_summary
}

# Gestion des arguments
case "$1" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h           Afficher cette aide"
        echo "  --check-only         Effectuer uniquement les vérifications"
        echo ""
        echo "Ce script automatise le déploiement sur Render en mode non-interactif:"
        echo "  1. Vérifie les prérequis et le statut Git"
        echo "  2. Commit automatiquement les changements"
        echo "  3. Construit le projet"
        echo "  4. Crée un tag Git automatiquement"
        echo "  5. Pousse le code (déclenchant le déploiement auto)"
        echo ""
        exit 0
        ;;
    --check-only)
        check_prerequisites
        check_git_status
        log_success "Vérifications terminées - Prêt pour le déploiement"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac