#!/bin/bash

# 🔄 Script de Redémarrage PM2 - BAG Discord Bot sur Freebox Delta
# Ce script redémarre le bot Discord géré par PM2 de manière sécurisée

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Variables de configuration
BOT_USER="botuser"
BOT_DIR="/home/$BOT_USER/bag-discord-bot"
APP_NAME="bagbot"

# Fonction d'affichage
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

info() {
    echo -e "${PURPLE}ℹ️  $1${NC}"
}

# Vérification des privilèges
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        error "Ce script doit être exécuté en tant que root (sudo)"
        exit 1
    fi
}

# Vérification de l'installation PM2
check_pm2_installation() {
    if ! command -v pm2 &> /dev/null; then
        error "PM2 n'est pas installé"
        error "Veuillez d'abord exécuter freebox-pm2-setup.sh"
        exit 1
    fi
    
    if ! id "$BOT_USER" &>/dev/null; then
        error "L'utilisateur $BOT_USER n'existe pas"
        exit 1
    fi
    
    success "Installation PM2 vérifiée"
}

# Vérification de l'application PM2
check_pm2_app() {
    log "Vérification de l'application PM2..."
    
    if sudo -u "$BOT_USER" pm2 list | grep -q "$APP_NAME"; then
        success "Application $APP_NAME trouvée dans PM2"
        return 0
    else
        error "Application $APP_NAME non trouvée dans PM2"
        
        # Proposer de démarrer l'application
        echo
        warning "L'application n'est pas démarrée. Voulez-vous la démarrer ? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            start_app
        else
            exit 1
        fi
    fi
}

# Démarrage de l'application
start_app() {
    log "Démarrage de l'application avec PM2..."
    
    cd "$BOT_DIR"
    
    if sudo -u "$BOT_USER" pm2 start ecosystem.config.js --env production; then
        success "Application démarrée"
        sudo -u "$BOT_USER" pm2 save
    else
        error "Échec du démarrage de l'application"
        exit 1
    fi
}

# Affichage du statut avant redémarrage
show_status_before() {
    log "Statut avant redémarrage:"
    echo
    
    # Statut général PM2
    sudo -u "$BOT_USER" pm2 status
    
    echo
    
    # Détails de l'application
    if sudo -u "$BOT_USER" pm2 describe "$APP_NAME" >/dev/null 2>&1; then
        info "Détails de l'application $APP_NAME:"
        sudo -u "$BOT_USER" pm2 describe "$APP_NAME" | head -20
    fi
}

# Redémarrage de l'application
restart_app() {
    log "Redémarrage de l'application $APP_NAME..."
    
    # Type de redémarrage selon l'option
    case "${1:-normal}" in
        "reload")
            log "Redémarrage en mode reload (zero-downtime)..."
            if sudo -u "$BOT_USER" pm2 reload "$APP_NAME"; then
                success "Reload effectué avec succès"
            else
                warning "Reload échoué, tentative de restart normal..."
                sudo -u "$BOT_USER" pm2 restart "$APP_NAME"
            fi
            ;;
        "graceful")
            log "Redémarrage gracieux..."
            sudo -u "$BOT_USER" pm2 stop "$APP_NAME"
            sleep 3
            sudo -u "$BOT_USER" pm2 start "$APP_NAME"
            ;;
        "force")
            log "Redémarrage forcé..."
            sudo -u "$BOT_USER" pm2 delete "$APP_NAME" || true
            cd "$BOT_DIR"
            sudo -u "$BOT_USER" pm2 start ecosystem.config.js --env production
            ;;
        *)
            log "Redémarrage normal..."
            sudo -u "$BOT_USER" pm2 restart "$APP_NAME"
            ;;
    esac
    
    # Sauvegarder la configuration
    sudo -u "$BOT_USER" pm2 save
    
    success "Commande de redémarrage envoyée"
}

# Vérification post-redémarrage
post_restart_check() {
    log "Vérification post-redémarrage..."
    
    # Attendre que l'application démarre
    sleep 10
    
    # Vérifier le statut
    if sudo -u "$BOT_USER" pm2 list | grep "$APP_NAME" | grep -q "online"; then
        success "L'application fonctionne correctement"
        
        # Afficher les informations de l'application
        echo
        info "Informations de l'application:"
        sudo -u "$BOT_USER" pm2 describe "$APP_NAME" | grep -E "(status|uptime|cpu|memory|restarts)"
        
        return 0
    else
        error "L'application ne fonctionne pas correctement"
        
        # Afficher les logs d'erreur
        echo
        error "Logs d'erreur récents:"
        sudo -u "$BOT_USER" pm2 logs "$APP_NAME" --lines 10 --raw
        
        return 1
    fi
}

# Affichage du statut après redémarrage
show_status_after() {
    echo
    log "Statut après redémarrage:"
    echo
    
    # Statut détaillé
    sudo -u "$BOT_USER" pm2 status
    
    echo
    
    # Logs récents
    info "Logs récents (dernières 5 lignes):"
    sudo -u "$BOT_USER" pm2 logs "$APP_NAME" --lines 5 --raw
}

# Nettoyage des logs (optionnel)
cleanup_logs() {
    if [[ "${1:-}" == "--cleanup-logs" ]]; then
        log "Nettoyage des logs..."
        
        # Vider les logs PM2
        sudo -u "$BOT_USER" pm2 flush "$APP_NAME"
        
        # Nettoyer les anciens logs dans le répertoire
        find "$BOT_DIR/logs" -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
        
        success "Logs nettoyés"
    fi
}

# Fonction principale
main() {
    echo "🔄 Redémarrage PM2 du BAG Discord Bot sur Freebox Delta"
    echo "====================================================="
    echo
    
    local restart_type="${1:-normal}"
    
    check_permissions
    check_pm2_installation
    check_pm2_app
    
    # Afficher le statut avant
    show_status_before
    
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Effectuer le redémarrage
    restart_app "$restart_type"
    
    # Nettoyage des logs si demandé
    cleanup_logs "$2"
    
    # Vérification post-redémarrage
    if post_restart_check; then
        show_status_after
        
        echo
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        success "Redémarrage terminé avec succès!"
        
        echo
        info "Commandes utiles:"
        echo "  • Monitoring : sudo -u $BOT_USER pm2 monit"
        echo "  • Logs       : sudo -u $BOT_USER pm2 logs $APP_NAME"
        echo "  • Statut     : sudo -u $BOT_USER pm2 status"
    else
        echo
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        error "Problème détecté après redémarrage"
        
        echo
        error "Actions recommandées:"
        echo "  1. Vérifiez les logs: sudo -u $BOT_USER pm2 logs $APP_NAME"
        echo "  2. Vérifiez la configuration: cat $BOT_DIR/.env"
        echo "  3. Redémarrage forcé: $0 --force"
        echo "  4. Monitoring: sudo -u $BOT_USER pm2 monit"
        
        exit 1
    fi
}

# Gestion des options
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [type] [options]"
        echo
        echo "Types de redémarrage:"
        echo "  normal     Redémarrage standard (défaut)"
        echo "  reload     Redémarrage zero-downtime"
        echo "  graceful   Arrêt propre puis redémarrage"
        echo "  force      Suppression et recréation du processus"
        echo
        echo "Options:"
        echo "  --help, -h        Afficher cette aide"
        echo "  --cleanup-logs    Nettoyer les logs après redémarrage"
        echo "  --status          Afficher uniquement le statut sans redémarrer"
        echo
        echo "Exemples:"
        echo "  $0                      # Redémarrage normal"
        echo "  $0 reload               # Redémarrage zero-downtime"
        echo "  $0 force --cleanup-logs # Redémarrage forcé avec nettoyage"
        echo
        exit 0
        ;;
    --status)
        check_permissions
        check_pm2_installation
        show_status_before
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac