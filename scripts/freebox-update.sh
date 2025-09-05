#!/bin/bash

# 🔄 Script de Mise à Jour - BAG Discord Bot sur Freebox Delta
# Ce script met à jour le bot Discord en toute sécurité

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables de configuration
BOT_USER="botuser"
BOT_DIR="/home/$BOT_USER/bag-discord-bot"
SERVICE_NAME="bag-discord-bot"
BACKUP_DIR="$BOT_DIR/backups"

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

# Vérification de l'installation existante
check_installation() {
    log "Vérification de l'installation existante..."
    
    if [[ ! -d "$BOT_DIR" ]]; then
        error "Le répertoire du bot n'existe pas : $BOT_DIR"
        exit 1
    fi
    
    if ! systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        error "Le service $SERVICE_NAME n'est pas configuré"
        exit 1
    fi
    
    success "Installation existante vérifiée"
}

# Création d'une sauvegarde
create_backup() {
    log "Création d'une sauvegarde..."
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_NAME="backup_$TIMESTAMP"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
    
    # Créer le répertoire de sauvegarde
    sudo -u "$BOT_USER" mkdir -p "$BACKUP_PATH"
    
    # Sauvegarder les fichiers importants
    sudo -u "$BOT_USER" cp -r "$BOT_DIR/data" "$BACKUP_PATH/" 2>/dev/null || true
    sudo -u "$BOT_USER" cp "$BOT_DIR/.env" "$BACKUP_PATH/" 2>/dev/null || true
    sudo -u "$BOT_USER" cp "$BOT_DIR/package.json" "$BACKUP_PATH/" 2>/dev/null || true
    sudo -u "$BOT_USER" cp "$BOT_DIR/package-lock.json" "$BACKUP_PATH/" 2>/dev/null || true
    
    success "Sauvegarde créée : $BACKUP_PATH"
}

# Arrêt du service
stop_service() {
    log "Arrêt du service..."
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME"
        success "Service arrêté"
    else
        warning "Le service n'était pas en cours d'exécution"
    fi
}

# Mise à jour du code
update_code() {
    log "Mise à jour du code..."
    
    cd "$BOT_DIR"
    
    # Sauvegarder les modifications locales
    sudo -u "$BOT_USER" git stash push -m "Auto-stash before update $(date)"
    
    # Récupérer les dernières modifications
    sudo -u "$BOT_USER" git fetch origin
    sudo -u "$BOT_USER" git pull origin main
    
    success "Code mis à jour"
}

# Mise à jour des dépendances
update_dependencies() {
    log "Mise à jour des dépendances..."
    
    cd "$BOT_DIR"
    
    # Nettoyer le cache npm
    sudo -u "$BOT_USER" npm cache clean --force
    
    # Mettre à jour les dépendances
    sudo -u "$BOT_USER" npm install --production
    
    # Audit de sécurité
    sudo -u "$BOT_USER" npm audit fix --production || true
    
    success "Dépendances mises à jour"
}

# Déploiement des commandes Discord
deploy_commands() {
    log "Déploiement des commandes Discord..."
    
    cd "$BOT_DIR"
    
    if sudo -u "$BOT_USER" npm run register; then
        success "Commandes Discord déployées"
    else
        warning "Échec du déploiement des commandes (le bot démarrera quand même)"
    fi
}

# Démarrage du service
start_service() {
    log "Démarrage du service..."
    
    systemctl start "$SERVICE_NAME"
    
    # Attendre un peu pour vérifier que le service démarre correctement
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Service démarré avec succès"
    else
        error "Échec du démarrage du service"
        systemctl status "$SERVICE_NAME" --no-pager
        exit 1
    fi
}

# Vérification post-mise à jour
post_update_check() {
    log "Vérification post-mise à jour..."
    
    # Vérifier que le service fonctionne
    sleep 10
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Le bot fonctionne correctement"
        
        # Afficher les derniers logs
        echo
        log "Derniers logs du bot :"
        journalctl -u "$SERVICE_NAME" -n 10 --no-pager
    else
        error "Le bot ne fonctionne pas correctement"
        echo
        error "Logs d'erreur :"
        journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        exit 1
    fi
}

# Nettoyage des anciennes sauvegardes
cleanup_backups() {
    log "Nettoyage des anciennes sauvegardes..."
    
    # Garder seulement les 5 dernières sauvegardes
    cd "$BACKUP_DIR"
    sudo -u "$BOT_USER" ls -t | tail -n +6 | xargs -r sudo -u "$BOT_USER" rm -rf
    
    success "Anciennes sauvegardes nettoyées"
}

# Affichage des informations finales
show_final_info() {
    echo
    echo "========================================"
    success "Mise à jour terminée avec succès!"
    echo "========================================"
    echo
    echo "📊 Statut du service :"
    systemctl status "$SERVICE_NAME" --no-pager -l
    echo
    echo "📋 Commandes utiles :"
    echo "   • Logs temps réel : sudo journalctl -u $SERVICE_NAME -f"
    echo "   • Redémarrer      : sudo systemctl restart $SERVICE_NAME"
    echo "   • Arrêter         : sudo systemctl stop $SERVICE_NAME"
    echo "   • Statut          : sudo systemctl status $SERVICE_NAME"
    echo
}

# Fonction de rollback en cas d'échec
rollback() {
    error "Échec de la mise à jour, tentative de rollback..."
    
    # Arrêter le service défaillant
    systemctl stop "$SERVICE_NAME" || true
    
    # Restaurer la dernière sauvegarde
    LATEST_BACKUP=$(sudo -u "$BOT_USER" ls -t "$BACKUP_DIR" | head -n1)
    if [[ -n "$LATEST_BACKUP" ]]; then
        log "Restauration de la sauvegarde : $LATEST_BACKUP"
        
        # Restaurer les fichiers
        sudo -u "$BOT_USER" cp -r "$BACKUP_DIR/$LATEST_BACKUP/"* "$BOT_DIR/" 2>/dev/null || true
        
        # Redémarrer le service
        systemctl start "$SERVICE_NAME" || true
        
        warning "Rollback effectué, vérifiez le statut du service"
    else
        error "Aucune sauvegarde disponible pour le rollback"
    fi
}

# Fonction principale
main() {
    echo "🔄 Mise à jour du BAG Discord Bot sur Freebox Delta"
    echo "================================================="
    echo
    
    # Piège pour gérer les erreurs
    trap rollback ERR
    
    check_permissions
    check_installation
    
    log "Début de la mise à jour..."
    
    create_backup
    stop_service
    update_code
    update_dependencies
    deploy_commands
    start_service
    post_update_check
    cleanup_backups
    
    # Désactiver le piège d'erreur après succès
    trap - ERR
    
    show_final_info
}

# Gestion des signaux
trap 'error "Mise à jour interrompue"; rollback; exit 1' INT TERM

# Options de ligne de commande
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Afficher cette aide"
        echo "  --no-backup    Ne pas créer de sauvegarde"
        echo "  --force        Forcer la mise à jour même si le service est arrêté"
        echo
        exit 0
        ;;
    --no-backup)
        create_backup() { log "Sauvegarde ignorée (--no-backup)"; }
        ;;
    --force)
        check_installation() { log "Vérification ignorée (--force)"; }
        ;;
esac

# Exécution du script principal
main "$@"