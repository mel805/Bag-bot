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
    echo "2. 🚀 Démarrez le bot :"
    echo "   sudo systemctl start $SERVICE_NAME"
    echo
    echo "3. 📊 Vérifiez le statut :"
    echo "   sudo systemctl status $SERVICE_NAME"
    echo
    echo "4. 📋 Consultez les logs :"
    echo "   sudo journalctl -u $SERVICE_NAME -f"
    echo
    echo "📚 Commandes utiles :"
    echo "   • Redémarrer : sudo systemctl restart $SERVICE_NAME"
    echo "   • Arrêter    : sudo systemctl stop $SERVICE_NAME"
    echo "   • Logs       : sudo journalctl -u $SERVICE_NAME"
    echo "   • Statut     : sudo systemctl status $SERVICE_NAME"
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
    install_dependencies
    create_bot_user
    setup_bot_directory
    install_project_files
    setup_environment
    setup_systemd_service
    setup_firewall
    setup_log_rotation
    
    show_final_info
}

# Gestion des signaux pour un arrêt propre
trap 'error "Installation interrompue"; exit 1' INT TERM

# Exécution du script principal
main "$@"