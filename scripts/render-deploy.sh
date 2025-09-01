#!/bin/bash

# Script de déploiement complet pour Render
# Ce script automatise le processus de déploiement sur Render

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
RENDER_API_URL="https://api.render.com/v1"
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
        log_error "Ce script doit être exécuté depuis la racine du projet (où se trouvent package.json et render.yaml)"
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

# Fonction pour vérifier le statut Git
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
        
        read -p "Voulez-vous continuer le déploiement ? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Déploiement annulé"
            exit 0
        fi
    fi
    
    log_success "Statut Git OK"
}

# Fonction pour exécuter les tests
run_tests() {
    log_info "Exécution des tests..."
    
    # Vérifier s'il y a des scripts de test
    if npm run | grep -q "test"; then
        npm test
        log_success "Tests passés"
    else
        log_warning "Aucun script de test trouvé dans package.json"
    fi
}

# Fonction pour construire le projet
build_project() {
    log_info "Construction du projet..."
    
    # Nettoyer les dépendances
    if [ -d "node_modules" ]; then
        rm -rf node_modules
        log_info "Dossier node_modules nettoyé"
    fi
    
    # Installer les dépendances
    npm ci
    log_success "Dépendances installées"
    
    # Exécuter le build si défini
    if npm run | grep -q "build"; then
        npm run build
        log_success "Build terminé"
    else
        log_info "Aucun script de build défini"
    fi
}

# Fonction pour déployer les commandes en local (test)
test_commands_locally() {
    log_info "Test local du déploiement des commandes..."
    
    # Vérifier les variables d'environnement pour le test
    if [ -f ".env" ]; then
        source .env
    fi
    
    if [ -z "$DISCORD_TOKEN" ] || [ -z "$CLIENT_ID" ]; then
        log_warning "Variables d'environnement manquantes pour le test local"
        log_info "Assurez-vous que DISCORD_TOKEN et CLIENT_ID sont configurées dans Render"
    else
        # Exécuter le script de déploiement des commandes
        if [ -f "scripts/deploy-commands.sh" ]; then
            ./scripts/deploy-commands.sh --env-check
            log_success "Test de déploiement des commandes OK"
        else
            log_warning "Script deploy-commands.sh non trouvé"
        fi
    fi
}

# Fonction pour créer un tag Git
create_git_tag() {
    log_info "Création d'un tag Git pour ce déploiement..."
    
    # Obtenir la version depuis package.json
    VERSION=$(node -p "require('./package.json').version")
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    TAG_NAME="deploy-v${VERSION}-${TIMESTAMP}"
    
    # Créer le tag
    git tag -a "$TAG_NAME" -m "Déploiement version $VERSION - $(date)"
    
    log_success "Tag créé: $TAG_NAME"
    
    # Pousser le tag
    if command -v git &> /dev/null; then
        read -p "Voulez-vous pousser le tag vers le repository distant ? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git push origin "$TAG_NAME"
            log_success "Tag poussé vers le repository distant"
        fi
    fi
}

# Fonction pour afficher les informations de déploiement
show_deployment_info() {
    log_deploy "=== INFORMATIONS DE DÉPLOIEMENT ==="
    echo ""
    echo "🚀 Service: $RENDER_SERVICE_NAME"
    echo "📦 Version: $(node -p "require('./package.json').version")"
    echo "🌐 Environnement: Production (Render)"
    echo "📅 Date: $(date)"
    echo "🔧 Node.js: $(node --version)"
    echo "📋 Commit: $(git rev-parse --short HEAD)"
    echo ""
    echo "📝 Configuration Render:"
    echo "   - Build Command: npm run render-build"
    echo "   - Start Command: npm run render-start"
    echo "   - Auto Deploy: Activé"
    echo ""
    echo "🔗 Liens utiles:"
    echo "   - Dashboard Render: https://dashboard.render.com/"
    echo "   - Logs: https://dashboard.render.com/web/srv-xxxxx/logs"
    echo ""
}

# Fonction pour afficher les étapes post-déploiement
show_post_deployment_steps() {
    log_info "=== ÉTAPES POST-DÉPLOIEMENT ==="
    echo ""
    echo "✅ 1. Vérifiez le déploiement sur Render Dashboard"
    echo "✅ 2. Surveillez les logs de déploiement"
    echo "✅ 3. Testez les commandes slash dans Discord"
    echo "✅ 4. Vérifiez la connectivité du bot"
    echo "✅ 5. Surveillez les métriques de performance"
    echo ""
    echo "🔧 Commandes utiles:"
    echo "   - Voir les logs: render logs --service $RENDER_SERVICE_NAME"
    echo "   - Redémarrer: render restart --service $RENDER_SERVICE_NAME"
    echo ""
}

# Fonction principale
main() {
    echo "🚀 SCRIPT DE DÉPLOIEMENT RENDER - BAG DISCORD BOT"
    echo "=================================================="
    echo ""
    
    # Vérifications préliminaires
    check_prerequisites
    check_git_status
    
    # Tests et construction
    if [ "$1" != "--skip-tests" ]; then
        run_tests
    fi
    
    if [ "$1" != "--skip-build" ]; then
        build_project
    fi
    
    # Test local des commandes
    test_commands_locally
    
    # Affichage des informations
    show_deployment_info
    
    # Confirmation du déploiement
    echo ""
    log_deploy "Prêt pour le déploiement sur Render"
    read -p "Voulez-vous continuer avec le déploiement ? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Déploiement annulé par l'utilisateur"
        exit 0
    fi
    
    # Créer un tag pour ce déploiement
    if [ "$1" != "--no-tag" ]; then
        create_git_tag
    fi
    
    # Pousser vers Git (déclenche le déploiement automatique sur Render)
    log_deploy "Déclenchement du déploiement..."
    
    if git remote | grep -q "origin"; then
        git push origin main || git push origin master
        log_success "Code poussé vers le repository distant"
        log_deploy "Déploiement automatique déclenché sur Render"
    else
        log_warning "Aucun remote Git configuré"
        log_info "Configurez votre repository Git pour déclencher le déploiement automatique"
    fi
    
    # Informations post-déploiement
    echo ""
    log_success "✅ Déploiement initié avec succès!"
    show_post_deployment_steps
    
    log_info "Surveillez le dashboard Render pour voir l'avancement du déploiement"
}

# Gestion des arguments
case "$1" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h           Afficher cette aide"
        echo "  --skip-tests         Ignorer l'exécution des tests"
        echo "  --skip-build         Ignorer la phase de build"
        echo "  --no-tag             Ne pas créer de tag Git"
        echo "  --check-only         Effectuer uniquement les vérifications"
        echo ""
        echo "Ce script automatise le déploiement sur Render en:"
        echo "  1. Vérifiant les prérequis et le statut Git"
        echo "  2. Exécutant les tests (si disponibles)"
        echo "  3. Construisant le projet"
        echo "  4. Créant un tag Git"
        echo "  5. Poussant le code (déclenchant le déploiement auto)"
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