#!/bin/bash

# 🔄 Script de Redémarrage - BAG Discord Bot sur Freebox Delta
# Ce script redémarre le bot Discord de manière sécurisée

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables de configuration
SERVICE_NAME="bag-discord-bot"

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

# Vérification des privilèges
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        error "Ce script doit être exécuté en tant que root (sudo)"
        exit 1
    fi
}

# Vérification de l'existence du service
check_service() {
    if ! systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        error "Service $SERVICE_NAME non trouvé"
        exit 1
    fi
}

# Redémarrage du service
restart_service() {
    log "Redémarrage du service $SERVICE_NAME..."
    
    # Obtenir le statut avant redémarrage
    WAS_ACTIVE=$(systemctl is-active "$SERVICE_NAME" || echo "inactive")
    
    # Redémarrer le service
    systemctl restart "$SERVICE_NAME"
    
    success "Commande de redémarrage envoyée"
    
    # Attendre un peu pour que le service démarre
    log "Attente du démarrage du service..."
    sleep 5
    
    # Vérifier que le service a bien redémarré
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Service redémarré avec succès"
        
        # Afficher le nouveau PID
        NEW_PID=$(systemctl show "$SERVICE_NAME" --property=MainPID --value)
        if [[ "$NEW_PID" != "0" ]] && [[ -n "$NEW_PID" ]]; then
            success "Nouveau PID: $NEW_PID"
        fi
        
        return 0
    else
        error "Échec du redémarrage du service"
        return 1
    fi
}

# Vérification post-redémarrage
post_restart_check() {
    log "Vérification post-redémarrage..."
    
    # Attendre un peu plus pour que le bot se connecte
    sleep 10
    
    # Vérifier le statut
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Le bot fonctionne correctement"
        
        # Afficher les derniers logs
        echo
        log "Derniers logs du bot:"
        journalctl -u "$SERVICE_NAME" -n 10 --no-pager
        
        return 0
    else
        error "Le bot ne fonctionne pas correctement après redémarrage"
        echo
        error "Logs d'erreur:"
        journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        
        return 1
    fi
}

# Redémarrage forcé
force_restart() {
    warning "Redémarrage forcé du service..."
    
    # Arrêter brutalement si nécessaire
    systemctl stop "$SERVICE_NAME" || true
    sleep 2
    
    # Tuer tous les processus Node.js du bot si ils existent encore
    pkill -f "node.*bot.js" || true
    sleep 1
    
    # Redémarrer
    systemctl start "$SERVICE_NAME"
    
    success "Redémarrage forcé effectué"
}

# Affichage du statut avant/après
show_status() {
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 STATUT DU SERVICE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    systemctl status "$SERVICE_NAME" --no-pager -l || true
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
}

# Fonction principale
main() {
    echo "🔄 Redémarrage du BAG Discord Bot sur Freebox Delta"
    echo "================================================="
    echo
    
    check_permissions
    check_service
    
    # Afficher le statut avant
    log "Statut avant redémarrage:"
    show_status
    
    # Effectuer le redémarrage
    if [[ "${1:-}" == "--force" ]]; then
        force_restart
    else
        if ! restart_service; then
            warning "Redémarrage normal échoué, tentative de redémarrage forcé..."
            force_restart
        fi
    fi
    
    # Vérification post-redémarrage
    if post_restart_check; then
        echo
        success "Redémarrage terminé avec succès!"
        
        # Afficher le statut après
        log "Statut après redémarrage:"
        show_status
    else
        echo
        error "Problème détecté après redémarrage"
        
        # Afficher le statut après
        log "Statut après redémarrage:"
        show_status
        
        echo
        error "Actions recommandées:"
        echo "  1. Vérifiez les logs: sudo journalctl -u $SERVICE_NAME -f"
        echo "  2. Vérifiez la configuration: cat /home/botuser/bag-discord-bot/.env"
        echo "  3. Testez manuellement: sudo -u botuser node /home/botuser/bag-discord-bot/src/bot.js"
        
        exit 1
    fi
}

# Gestion des options
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h    Afficher cette aide"
        echo "  --force       Redémarrage forcé (tue les processus si nécessaire)"
        echo "  --status      Afficher uniquement le statut sans redémarrer"
        echo
        echo "Exemples:"
        echo "  $0                 # Redémarrage normal"
        echo "  $0 --force         # Redémarrage forcé"
        echo "  $0 --status        # Afficher le statut"
        echo
        exit 0
        ;;
    --status)
        check_permissions
        check_service
        show_status
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac