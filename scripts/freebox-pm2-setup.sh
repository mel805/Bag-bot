#!/bin/bash

# 🏠 Script d'Installation PM2 - BAG Discord Bot sur Freebox Delta
# Ce script configure PM2 comme gestionnaire de processus pour le bot Discord

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

# Vérification de l'installation existante
check_existing_installation() {
    log "Vérification de l'installation existante..."
    
    if [[ ! -d "$BOT_DIR" ]]; then
        error "Le répertoire du bot n'existe pas : $BOT_DIR"
        error "Veuillez d'abord exécuter le script freebox-setup.sh"
        exit 1
    fi
    
    if ! id "$BOT_USER" &>/dev/null; then
        error "L'utilisateur $BOT_USER n'existe pas"
        error "Veuillez d'abord exécuter le script freebox-setup.sh"
        exit 1
    fi
    
    success "Installation existante vérifiée"
}

# Installation de PM2
install_pm2() {
    log "Installation de PM2..."
    
    # Vérifier si PM2 est déjà installé
    if command -v pm2 &> /dev/null; then
        PM2_VERSION=$(pm2 --version)
        success "PM2 déjà installé : v$PM2_VERSION"
        return
    fi
    
    # Installation globale de PM2
    npm install -g pm2@latest
    
    # Vérification de l'installation
    PM2_VERSION=$(pm2 --version)
    success "PM2 v$PM2_VERSION installé avec succès"
    
    # Configuration de PM2 pour l'utilisateur botuser
    sudo -u "$BOT_USER" pm2 install pm2-logrotate
    sudo -u "$BOT_USER" pm2 set pm2-logrotate:max_size 10M
    sudo -u "$BOT_USER" pm2 set pm2-logrotate:retain 7
    sudo -u "$BOT_USER" pm2 set pm2-logrotate:compress true
    
    success "Configuration PM2 terminée"
}

# Configuration du répertoire de logs pour PM2
setup_pm2_logs() {
    log "Configuration des logs PM2..."
    
    # Créer le répertoire de logs s'il n'existe pas
    sudo -u "$BOT_USER" mkdir -p "$BOT_DIR/logs"
    
    # Créer les fichiers de logs avec les bonnes permissions
    sudo -u "$BOT_USER" touch "$BOT_DIR/logs/combined.log"
    sudo -u "$BOT_USER" touch "$BOT_DIR/logs/out.log"
    sudo -u "$BOT_USER" touch "$BOT_DIR/logs/error.log"
    
    success "Répertoire de logs configuré"
}

# Arrêt du service systemd s'il existe
stop_systemd_service() {
    log "Vérification du service systemd existant..."
    
    if systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        warning "Service systemd détecté, arrêt en cours..."
        
        # Arrêter le service
        systemctl stop "$SERVICE_NAME" || true
        
        # Désactiver le service (ne pas le supprimer complètement)
        systemctl disable "$SERVICE_NAME" || true
        
        success "Service systemd arrêté et désactivé"
        info "Le service systemd est conservé comme sauvegarde"
    else
        success "Aucun service systemd à arrêter"
    fi
}

# Configuration du démarrage automatique avec PM2
setup_pm2_startup() {
    log "Configuration du démarrage automatique PM2..."
    
    # Générer le script de démarrage pour systemd
    STARTUP_SCRIPT=$(sudo -u "$BOT_USER" pm2 startup systemd -u "$BOT_USER" --hp "/home/$BOT_USER" | grep "sudo")
    
    if [[ -n "$STARTUP_SCRIPT" ]]; then
        # Exécuter la commande de configuration
        eval "$STARTUP_SCRIPT"
        success "Script de démarrage PM2 configuré"
    else
        warning "Impossible de générer le script de démarrage automatique"
    fi
}

# Démarrage du bot avec PM2
start_bot_with_pm2() {
    log "Démarrage du bot avec PM2..."
    
    cd "$BOT_DIR"
    
    # Démarrer avec l'ecosystem file
    if sudo -u "$BOT_USER" pm2 start ecosystem.config.js --env production; then
        success "Bot démarré avec PM2"
    else
        error "Échec du démarrage du bot avec PM2"
        return 1
    fi
    
    # Sauvegarder la configuration PM2
    sudo -u "$BOT_USER" pm2 save
    
    # Afficher le statut
    echo
    info "Statut PM2 :"
    sudo -u "$BOT_USER" pm2 status
}

# Vérification post-installation
post_install_check() {
    log "Vérification post-installation..."
    
    # Attendre un peu pour que le bot se connecte
    sleep 10
    
    # Vérifier que PM2 gère bien le processus
    if sudo -u "$BOT_USER" pm2 list | grep -q "bagbot"; then
        success "Le bot est géré par PM2"
        
        # Vérifier le statut du processus
        if sudo -u "$BOT_USER" pm2 list | grep "bagbot" | grep -q "online"; then
            success "Le bot fonctionne correctement"
            return 0
        else
            error "Le bot ne fonctionne pas correctement"
            return 1
        fi
    else
        error "Le bot n'est pas trouvé dans PM2"
        return 1
    fi
}

# Configuration de la rotation des logs PM2
setup_pm2_logrotate() {
    log "Configuration de la rotation des logs PM2..."
    
    LOGROTATE_FILE="/etc/logrotate.d/pm2-$BOT_USER"
    
    cat > "$LOGROTATE_FILE" << EOF
$BOT_DIR/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 $BOT_USER $BOT_USER
    sharedscripts
    postrotate
        sudo -u $BOT_USER pm2 reloadLogs
    endscript
}

/home/$BOT_USER/.pm2/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 $BOT_USER $BOT_USER
    sharedscripts
    postrotate
        sudo -u $BOT_USER pm2 reloadLogs
    endscript
}
EOF

    success "Rotation des logs PM2 configurée"
}

# Création des scripts de gestion PM2
create_pm2_management_scripts() {
    log "Création des scripts de gestion PM2..."
    
    # Script de démarrage PM2
    cat > "/usr/local/bin/bagbot-pm2-start" << 'EOF'
#!/bin/bash
sudo -u botuser bash -c 'cd /home/botuser/bag-discord-bot && pm2 start ecosystem.config.js --env production'
EOF
    chmod +x "/usr/local/bin/bagbot-pm2-start"
    
    # Script d'arrêt PM2
    cat > "/usr/local/bin/bagbot-pm2-stop" << 'EOF'
#!/bin/bash
sudo -u botuser pm2 stop bagbot
EOF
    chmod +x "/usr/local/bin/bagbot-pm2-stop"
    
    # Script de redémarrage PM2
    cat > "/usr/local/bin/bagbot-pm2-restart" << 'EOF'
#!/bin/bash
sudo -u botuser pm2 restart bagbot
EOF
    chmod +x "/usr/local/bin/bagbot-pm2-restart"
    
    # Script de statut PM2
    cat > "/usr/local/bin/bagbot-pm2-status" << 'EOF'
#!/bin/bash
sudo -u botuser pm2 status
sudo -u botuser pm2 monit
EOF
    chmod +x "/usr/local/bin/bagbot-pm2-status"
    
    success "Scripts de gestion PM2 créés"
    info "Commandes disponibles : bagbot-pm2-start, bagbot-pm2-stop, bagbot-pm2-restart, bagbot-pm2-status"
}

# Affichage des informations finales
show_final_info() {
    echo
    echo "========================================"
    success "Installation PM2 terminée avec succès!"
    echo "========================================"
    echo
    echo "🤖 Le bot Discord BAG est maintenant géré par PM2"
    echo
    echo "📋 Commandes PM2 utiles :"
    echo "   • Statut          : sudo -u $BOT_USER pm2 status"
    echo "   • Monitoring      : sudo -u $BOT_USER pm2 monit"
    echo "   • Logs temps réel : sudo -u $BOT_USER pm2 logs bagbot --lines 50"
    echo "   • Redémarrer      : sudo -u $BOT_USER pm2 restart bagbot"
    echo "   • Arrêter         : sudo -u $BOT_USER pm2 stop bagbot"
    echo "   • Démarrer        : sudo -u $BOT_USER pm2 start bagbot"
    echo
    echo "🚀 Commandes raccourcies :"
    echo "   • bagbot-pm2-start"
    echo "   • bagbot-pm2-stop"
    echo "   • bagbot-pm2-restart"
    echo "   • bagbot-pm2-status"
    echo
    echo "📊 Monitoring avancé :"
    echo "   • Interface web   : sudo -u $BOT_USER pm2 web"
    echo "   • Métriques       : sudo -u $BOT_USER pm2 describe bagbot"
    echo
    echo "📁 Logs :"
    echo "   • Répertoire logs : $BOT_DIR/logs/"
    echo "   • Logs PM2        : /home/$BOT_USER/.pm2/logs/"
    echo
    warning "Le service systemd a été désactivé mais conservé comme sauvegarde"
    info "Pour revenir à systemd, utilisez le script freebox-systemd-restore.sh"
}

# Fonction principale
main() {
    echo "🏠 Installation PM2 pour BAG Discord Bot sur Freebox Delta"
    echo "========================================================="
    echo
    
    check_root
    check_existing_installation
    
    log "Début de l'installation PM2..."
    
    install_pm2
    setup_pm2_logs
    stop_systemd_service
    setup_pm2_startup
    start_bot_with_pm2
    
    if post_install_check; then
        setup_pm2_logrotate
        create_pm2_management_scripts
        show_final_info
    else
        error "Échec de la vérification post-installation"
        echo
        error "Logs d'erreur PM2 :"
        sudo -u "$BOT_USER" pm2 logs bagbot --lines 20
        exit 1
    fi
}

# Gestion des signaux pour un arrêt propre
trap 'error "Installation interrompue"; exit 1' INT TERM

# Gestion des options
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Ce script installe et configure PM2 pour gérer le bot Discord BAG"
        echo
        echo "Options:"
        echo "  --help, -h      Afficher cette aide"
        echo "  --keep-systemd  Garder le service systemd actif (mode hybride)"
        echo
        echo "Prérequis:"
        echo "  • Le bot doit être déjà installé avec freebox-setup.sh"
        echo "  • Exécuter en tant que root (sudo)"
        echo
        exit 0
        ;;
    --keep-systemd)
        stop_systemd_service() { 
            log "Mode hybride : conservation du service systemd"
        }
        ;;
esac

# Exécution du script principal
main "$@"