#!/bin/bash

# 🔄 Script de Restauration Systemd - BAG Discord Bot sur Freebox Delta
# Ce script migre de PM2 vers systemd comme gestionnaire de processus

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

info() {
    echo -e "${PURPLE}ℹ️  $1${NC}"
}

# Vérification des privilèges root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "Ce script doit être exécuté en tant que root (sudo)"
        exit 1
    fi
}

# Vérification de l'installation PM2
check_pm2_installation() {
    if ! command -v pm2 &> /dev/null; then
        error "PM2 n'est pas installé, rien à migrer"
        exit 1
    fi
    
    if ! id "$BOT_USER" &>/dev/null; then
        error "L'utilisateur $BOT_USER n'existe pas"
        exit 1
    fi
    
    success "Installation PM2 détectée"
}

# Sauvegarde de la configuration PM2
backup_pm2_config() {
    log "Sauvegarde de la configuration PM2..."
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="$BOT_DIR/backups/pm2_backup_$TIMESTAMP"
    
    sudo -u "$BOT_USER" mkdir -p "$BACKUP_DIR"
    
    # Sauvegarder la liste PM2
    sudo -u "$BOT_USER" pm2 save
    sudo -u "$BOT_USER" cp "/home/$BOT_USER/.pm2/dump.pm2" "$BACKUP_DIR/" 2>/dev/null || true
    
    # Sauvegarder les logs PM2
    sudo -u "$BOT_USER" cp -r "/home/$BOT_USER/.pm2/logs" "$BACKUP_DIR/" 2>/dev/null || true
    
    # Sauvegarder l'ecosystem file
    sudo -u "$BOT_USER" cp "$BOT_DIR/ecosystem.config.js" "$BACKUP_DIR/" 2>/dev/null || true
    
    success "Configuration PM2 sauvegardée dans $BACKUP_DIR"
}

# Arrêt et suppression des processus PM2
stop_pm2_processes() {
    log "Arrêt des processus PM2..."
    
    # Arrêter l'application bagbot
    if sudo -u "$BOT_USER" pm2 list | grep -q "bagbot"; then
        sudo -u "$BOT_USER" pm2 stop bagbot || true
        sudo -u "$BOT_USER" pm2 delete bagbot || true
        success "Application bagbot supprimée de PM2"
    else
        warning "Application bagbot non trouvée dans PM2"
    fi
    
    # Supprimer le démarrage automatique PM2
    sudo -u "$BOT_USER" pm2 unstartup systemd || true
    
    # Arrêter le daemon PM2
    sudo -u "$BOT_USER" pm2 kill || true
    
    success "Processus PM2 arrêtés"
}

# Configuration du service systemd
setup_systemd_service() {
    log "Configuration du service systemd..."
    
    SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
    
    # Vérifier si le service existe déjà
    if [[ -f "$SERVICE_FILE" ]]; then
        success "Service systemd existe déjà"
    else
        # Créer le service systemd
        cat > "$SERVICE_FILE" << EOF
[Unit]
Description=BAG Discord Bot
After=network.target
Wants=network.target

[Service]
Type=simple
User=$BOT_USER
Group=$BOT_USER
WorkingDirectory=$BOT_DIR
ExecStart=/usr/bin/node src/bot.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=$BOT_DIR/.env

# Limites de sécurité
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$BOT_DIR

# Limites de ressources
MemoryMax=1G
TasksMax=100

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF
        success "Service systemd créé"
    fi
    
    # Recharger systemd
    systemctl daemon-reload
    
    # Activer le service
    systemctl enable "$SERVICE_NAME"
    
    success "Service systemd configuré et activé"
}

# Démarrage du service systemd
start_systemd_service() {
    log "Démarrage du service systemd..."
    
    # Démarrer le service
    systemctl start "$SERVICE_NAME"
    
    # Attendre un peu pour vérifier que le service démarre correctement
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Service systemd démarré avec succès"
    else
        error "Échec du démarrage du service systemd"
        systemctl status "$SERVICE_NAME" --no-pager
        return 1
    fi
}

# Vérification post-migration
post_migration_check() {
    log "Vérification post-migration..."
    
    # Attendre un peu plus pour que le bot se connecte
    sleep 10
    
    # Vérifier que le service fonctionne
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Le bot fonctionne correctement avec systemd"
        
        # Afficher les derniers logs
        echo
        info "Derniers logs du bot:"
        journalctl -u "$SERVICE_NAME" -n 10 --no-pager
        
        return 0
    else
        error "Le bot ne fonctionne pas correctement avec systemd"
        echo
        error "Logs d'erreur:"
        journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        
        return 1
    fi
}

# Nettoyage optionnel de PM2
cleanup_pm2() {
    if [[ "${1:-}" == "--remove-pm2" ]]; then
        log "Suppression de PM2..."
        
        # Désinstaller PM2 globalement
        npm uninstall -g pm2 || true
        
        # Supprimer les fichiers PM2 de l'utilisateur
        sudo -u "$BOT_USER" rm -rf "/home/$BOT_USER/.pm2" || true
        
        success "PM2 supprimé"
    else
        info "PM2 conservé (utilisez --remove-pm2 pour le supprimer)"
    fi
}

# Affichage des informations finales
show_final_info() {
    echo
    echo "========================================"
    success "Migration vers systemd terminée!"
    echo "========================================"
    echo
    echo "🤖 Le bot Discord BAG est maintenant géré par systemd"
    echo
    echo "📋 Commandes systemd utiles :"
    echo "   • Statut          : sudo systemctl status $SERVICE_NAME"
    echo "   • Logs temps réel : sudo journalctl -u $SERVICE_NAME -f"
    echo "   • Redémarrer      : sudo systemctl restart $SERVICE_NAME"
    echo "   • Arrêter         : sudo systemctl stop $SERVICE_NAME"
    echo "   • Démarrer        : sudo systemctl start $SERVICE_NAME"
    echo
    echo "🚀 Scripts de gestion disponibles :"
    echo "   • ./scripts/freebox-status.sh"
    echo "   • ./scripts/freebox-restart.sh"
    echo "   • ./scripts/freebox-update.sh"
    echo
    echo "📁 Sauvegarde PM2 :"
    echo "   • Les configurations PM2 sont sauvegardées dans $BOT_DIR/backups/"
    echo
    info "Pour revenir à PM2, utilisez: ./scripts/freebox-pm2-setup.sh"
}

# Fonction de rollback en cas d'échec
rollback_to_pm2() {
    error "Échec de la migration, tentative de rollback vers PM2..."
    
    # Arrêter le service systemd défaillant
    systemctl stop "$SERVICE_NAME" || true
    systemctl disable "$SERVICE_NAME" || true
    
    # Redémarrer PM2
    cd "$BOT_DIR"
    if sudo -u "$BOT_USER" pm2 start ecosystem.config.js --env production; then
        sudo -u "$BOT_USER" pm2 save
        warning "Rollback vers PM2 effectué"
    else
        error "Échec du rollback vers PM2"
    fi
}

# Fonction principale
main() {
    echo "🔄 Migration de PM2 vers systemd - BAG Discord Bot sur Freebox Delta"
    echo "=================================================================="
    echo
    
    # Piège pour gérer les erreurs
    trap rollback_to_pm2 ERR
    
    check_root
    check_pm2_installation
    
    log "Début de la migration vers systemd..."
    
    backup_pm2_config
    stop_pm2_processes
    setup_systemd_service
    start_systemd_service
    
    if post_migration_check; then
        cleanup_pm2 "$1"
        
        # Désactiver le piège d'erreur après succès
        trap - ERR
        
        show_final_info
    else
        error "Échec de la vérification post-migration"
        exit 1
    fi
}

# Gestion des signaux
trap 'error "Migration interrompue"; rollback_to_pm2; exit 1' INT TERM

# Gestion des options
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Ce script migre le bot Discord BAG de PM2 vers systemd"
        echo
        echo "Options:"
        echo "  --help, -h      Afficher cette aide"
        echo "  --remove-pm2    Supprimer complètement PM2 après migration"
        echo
        echo "Prérequis:"
        echo "  • Le bot doit être géré par PM2"
        echo "  • Exécuter en tant que root (sudo)"
        echo
        echo "Note:"
        echo "  • Les configurations PM2 sont sauvegardées automatiquement"
        echo "  • En cas d'échec, un rollback automatique vers PM2 est tenté"
        echo
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac