#!/bin/bash

# 🏠 Script d'Installation Automatique - BAG Discord Bot sur Freebox Delta
# Ce script configure automatiquement l'environnement pour le bot Discord

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

# Vérification des privilèges root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "Ce script doit être exécuté en tant que root (sudo)"
        exit 1
    fi
}

# Mise à jour du système
update_system() {
    log "Mise à jour du système..."
    apt update && apt upgrade -y
    success "Système mis à jour"
}

# Installation de Node.js
install_nodejs() {
    log "Installation de Node.js 18.x..."
    
    # Vérifier si Node.js est déjà installé
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log "Node.js déjà installé : $NODE_VERSION"
        
        # Vérifier la version
        if [[ "$NODE_VERSION" =~ ^v18\. ]]; then
            success "Version Node.js correcte"
            return
        else
            warning "Version Node.js incorrecte, mise à jour..."
        fi
    fi
    
    # Installation de Node.js 18.x
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    # Vérification
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    success "Node.js $NODE_VERSION et npm $NPM_VERSION installés"
}

# Installation de PM2 (optionnel)
install_pm2() {
    if [[ "${USE_PM2:-false}" == "true" ]]; then
        log "Installation de PM2..."
        
        # Vérifier si PM2 est déjà installé
        if command -v pm2 &> /dev/null; then
            PM2_VERSION=$(pm2 --version)
            success "PM2 déjà installé : v$PM2_VERSION"
            return
        fi
        
        # Installation globale de PM2
        npm install -g pm2@latest
        
        # Configuration de PM2 pour l'utilisateur botuser
        sudo -u "$BOT_USER" pm2 install pm2-logrotate || true
        sudo -u "$BOT_USER" pm2 set pm2-logrotate:max_size 10M || true
        sudo -u "$BOT_USER" pm2 set pm2-logrotate:retain 7 || true
        sudo -u "$BOT_USER" pm2 set pm2-logrotate:compress true || true
        
        # Vérification
        PM2_VERSION=$(pm2 --version)
        success "PM2 v$PM2_VERSION installé avec succès"
    else
        log "PM2 non installé (utilisation de systemd)"
    fi
}

# Installation des dépendances système
install_dependencies() {
    log "Installation des dépendances système..."
    
    apt install -y \
        build-essential \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        git \
        curl \
        wget \
        htop \
        nano \
        ufw \
        logrotate
    
    success "Dépendances système installées"
}

# Création de l'utilisateur du bot
create_bot_user() {
    log "Création de l'utilisateur $BOT_USER..."
    
    # Vérifier si l'utilisateur existe
    if id "$BOT_USER" &>/dev/null; then
        success "L'utilisateur $BOT_USER existe déjà"
        return
    fi
    
    # Créer l'utilisateur
    useradd -m -s /bin/bash "$BOT_USER"
    
    # Ajouter au groupe sudo (optionnel, pour la maintenance)
    # usermod -aG sudo "$BOT_USER"
    
    success "Utilisateur $BOT_USER créé"
}

# Configuration du répertoire du bot
setup_bot_directory() {
    log "Configuration du répertoire du bot..."
    
    # Créer le répertoire s'il n'existe pas
    if [[ ! -d "$BOT_DIR" ]]; then
        mkdir -p "$BOT_DIR"
        chown "$BOT_USER:$BOT_USER" "$BOT_DIR"
        success "Répertoire $BOT_DIR créé"
    else
        success "Répertoire $BOT_DIR existe déjà"
    fi
    
    # Créer les répertoires nécessaires
    sudo -u "$BOT_USER" mkdir -p "$BOT_DIR/logs"
    sudo -u "$BOT_USER" mkdir -p "$BOT_DIR/backups"
    sudo -u "$BOT_USER" mkdir -p "$BOT_DIR/data"
}

# Installation des fichiers du projet
install_project_files() {
    log "Installation des fichiers du projet..."
    
    # Copier les fichiers du projet vers le répertoire du bot
    if [[ -f "package.json" ]]; then
        cp -r . "$BOT_DIR/"
        chown -R "$BOT_USER:$BOT_USER" "$BOT_DIR"
        
        # Installation des dépendances npm
        log "Installation des dépendances npm..."
        cd "$BOT_DIR"
        sudo -u "$BOT_USER" npm install --production
        
        success "Fichiers du projet installés"
    else
        warning "Fichier package.json non trouvé. Assurez-vous d'exécuter ce script depuis le répertoire du projet."
        exit 1
    fi
}

# Configuration du fichier .env
setup_environment() {
    log "Configuration du fichier d'environnement..."
    
    ENV_FILE="$BOT_DIR/.env"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        cat > "$ENV_FILE" << EOF
# Discord Configuration
DISCORD_TOKEN=your_discord_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here

# Bot Configuration
NODE_ENV=production
BOT_PREFIX=!

# Logging
LOG_LEVEL=info
LOG_FILE=$BOT_DIR/logs/bot.log
EOF
        
        chown "$BOT_USER:$BOT_USER" "$ENV_FILE"
        chmod 600 "$ENV_FILE"  # Permissions restrictives pour la sécurité
        
        warning "Fichier .env créé avec des valeurs par défaut"
        warning "IMPORTANT: Éditez $ENV_FILE avec vos vraies valeurs avant de démarrer le bot"
    else
        success "Fichier .env existe déjà"
    fi
}

# Configuration du service systemd ou PM2
setup_process_manager() {
    if [[ "${USE_PM2:-false}" == "true" ]]; then
        setup_pm2_service
    else
        setup_systemd_service
    fi
}

# Configuration du service systemd
setup_systemd_service() {
    log "Configuration du service systemd..."
    
    SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
    
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

    # Recharger systemd
    systemctl daemon-reload
    
    # Activer le service (mais ne pas le démarrer tout de suite)
    systemctl enable "$SERVICE_NAME"
    
    success "Service systemd configuré et activé"
}

# Configuration du service PM2
setup_pm2_service() {
    log "Configuration du service PM2..."
    
    # Créer le répertoire de logs pour PM2
    sudo -u "$BOT_USER" mkdir -p "$BOT_DIR/logs"
    
    # Générer le script de démarrage pour systemd
    STARTUP_SCRIPT=$(sudo -u "$BOT_USER" pm2 startup systemd -u "$BOT_USER" --hp "/home/$BOT_USER" | grep "sudo")
    
    if [[ -n "$STARTUP_SCRIPT" ]]; then
        # Exécuter la commande de configuration
        eval "$STARTUP_SCRIPT"
        success "Script de démarrage PM2 configuré"
    else
        warning "Impossible de générer le script de démarrage automatique PM2"
    fi
    
    # Démarrer l'application avec PM2
    cd "$BOT_DIR"
    if sudo -u "$BOT_USER" pm2 start ecosystem.config.js --env production; then
        success "Bot démarré avec PM2"
        
        # Sauvegarder la configuration PM2
        sudo -u "$BOT_USER" pm2 save
        
        success "Service PM2 configuré et démarré"
    else
        error "Échec du démarrage du bot avec PM2"
    fi
}

# Configuration du firewall
setup_firewall() {
    log "Configuration du firewall..."
    
    # Configuration basique d'ufw
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    
    # Activer le firewall
    ufw --force enable
    
    success "Firewall configuré"
}

# Configuration de la rotation des logs
setup_log_rotation() {
    log "Configuration de la rotation des logs..."
    
    LOGROTATE_FILE="/etc/logrotate.d/$SERVICE_NAME"
    
    cat > "$LOGROTATE_FILE" << EOF
$BOT_DIR/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0644 $BOT_USER $BOT_USER
    postrotate
        systemctl reload $SERVICE_NAME > /dev/null 2>&1 || true
    endscript
}
EOF

    success "Rotation des logs configurée"
}

# Affichage des informations finales
show_final_info() {
    echo
    echo "========================================"
    success "Installation terminée avec succès!"
    echo "========================================"
    echo
    echo "📋 Prochaines étapes :"
    echo
    echo "1. 📝 Éditez le fichier de configuration :"
    echo "   sudo nano $BOT_DIR/.env"
    echo
    
    if [[ "${USE_PM2:-false}" == "true" ]]; then
        echo "🤖 Le bot est géré par PM2 :"
        echo
        echo "2. 📊 Vérifiez le statut :"
        echo "   sudo -u $BOT_USER pm2 status"
        echo
        echo "3. 📋 Consultez les logs :"
        echo "   sudo -u $BOT_USER pm2 logs $SERVICE_NAME"
        echo
        echo "📚 Commandes PM2 utiles :"
        echo "   • Monitoring  : sudo -u $BOT_USER pm2 monit"
        echo "   • Redémarrer  : sudo -u $BOT_USER pm2 restart bagbot"
        echo "   • Arrêter     : sudo -u $BOT_USER pm2 stop bagbot"
        echo "   • Démarrer    : sudo -u $BOT_USER pm2 start bagbot"
        echo "   • Interface   : sudo -u $BOT_USER pm2 web"
        echo
        echo "🚀 Scripts de gestion disponibles :"
        echo "   • ./scripts/freebox-pm2-status.sh"
        echo "   • ./scripts/freebox-pm2-restart.sh"
    else
        echo "🤖 Le bot est géré par systemd :"
        echo
        echo "2. 🚀 Démarrez le bot :"
        echo "   sudo systemctl start $SERVICE_NAME"
        echo
        echo "3. 📊 Vérifiez le statut :"
        echo "   sudo systemctl status $SERVICE_NAME"
        echo
        echo "4. 📋 Consultez les logs :"
        echo "   sudo journalctl -u $SERVICE_NAME -f"
        echo
        echo "📚 Commandes systemd utiles :"
        echo "   • Redémarrer : sudo systemctl restart $SERVICE_NAME"
        echo "   • Arrêter    : sudo systemctl stop $SERVICE_NAME"
        echo "   • Logs       : sudo journalctl -u $SERVICE_NAME"
        echo "   • Statut     : sudo systemctl status $SERVICE_NAME"
        echo
        echo "🔄 Pour migrer vers PM2 :"
        echo "   • ./scripts/freebox-pm2-setup.sh"
    fi
    
    echo
    warning "N'oubliez pas de configurer vos tokens Discord dans le fichier .env !"
    echo
}

# Fonction principale
main() {
    echo "🏠 Installation du BAG Discord Bot sur Freebox Delta"
    echo "=================================================="
    echo
    
    check_root
    
    log "Début de l'installation..."
    
    update_system
    install_nodejs
    install_pm2
    install_dependencies
    create_bot_user
    setup_bot_directory
    install_project_files
    setup_environment
    setup_process_manager
    setup_firewall
    setup_log_rotation
    
    show_final_info
}

# Gestion des signaux pour un arrêt propre
trap 'error "Installation interrompue"; exit 1' INT TERM

# Gestion des options de ligne de commande
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Ce script installe et configure le bot Discord BAG sur Freebox Delta"
        echo
        echo "Options:"
        echo "  --help, -h    Afficher cette aide"
        echo "  --pm2         Utiliser PM2 comme gestionnaire de processus (au lieu de systemd)"
        echo "  --systemd     Utiliser systemd comme gestionnaire de processus (défaut)"
        echo
        echo "Exemples:"
        echo "  $0                # Installation avec systemd (défaut)"
        echo "  $0 --pm2          # Installation avec PM2"
        echo
        echo "Prérequis:"
        echo "  • Freebox Delta avec VM Ubuntu/Debian"
        echo "  • Accès root (sudo)"
        echo "  • Connexion Internet"
        echo
        exit 0
        ;;
    --pm2)
        export USE_PM2=true
        echo "🚀 Installation avec PM2 comme gestionnaire de processus"
        ;;
    --systemd)
        export USE_PM2=false
        echo "🔧 Installation avec systemd comme gestionnaire de processus"
        ;;
    *)
        # Par défaut, utiliser systemd
        export USE_PM2=false
        ;;
esac

# Exécution du script principal
main "$@"