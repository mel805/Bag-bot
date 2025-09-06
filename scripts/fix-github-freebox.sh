#!/bin/bash

# 🔧 Script de Correction GitHub pour Freebox - BAG Discord Bot
# Ce script configure correctement GitHub pour les sauvegardes sur Freebox

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Variables
BOT_USER="botuser"
BOT_DIR="/home/$BOT_USER/bag-discord-bot"
ENV_FILE="$BOT_DIR/.env"

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

# Fonction pour demander une entrée utilisateur
prompt() {
    local prompt_text="$1"
    local var_name="$2"
    local current_value="$3"
    
    if [[ -n "$current_value" ]]; then
        echo -e "${YELLOW}$prompt_text${NC} [actuel: $current_value]"
        read -p "Nouvelle valeur (Entrée pour garder actuel): " new_value
        if [[ -z "$new_value" ]]; then
            new_value="$current_value"
        fi
    else
        echo -e "${YELLOW}$prompt_text${NC}"
        read -p "Valeur: " new_value
    fi
    
    eval "$var_name=\"$new_value\""
}

# Vérifier les prérequis
check_prerequisites() {
    log "Vérification des prérequis..."
    
    if [[ ! -d "$BOT_DIR" ]]; then
        error "Répertoire du bot non trouvé: $BOT_DIR"
        exit 1
    fi
    
    if [[ ! -f "$ENV_FILE" ]]; then
        warning "Fichier .env non trouvé, création..."
        sudo -u "$BOT_USER" touch "$ENV_FILE"
    fi
    
    success "Prérequis vérifiés"
}

# Lire les variables d'environnement actuelles
read_current_env() {
    log "Lecture de la configuration actuelle..."
    
    if [[ -f "$ENV_FILE" ]]; then
        # Lire les valeurs actuelles
        CURRENT_GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        CURRENT_GITHUB_REPO=$(grep "^GITHUB_REPO=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        CURRENT_GITHUB_BRANCH=$(grep "^GITHUB_BACKUP_BRANCH=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        
        if [[ -n "$CURRENT_GITHUB_TOKEN" ]]; then
            info "Token GitHub trouvé (${CURRENT_GITHUB_TOKEN:0:8}...)"
        fi
        if [[ -n "$CURRENT_GITHUB_REPO" ]]; then
            info "Dépôt GitHub: $CURRENT_GITHUB_REPO"
        fi
        if [[ -n "$CURRENT_GITHUB_BRANCH" ]]; then
            info "Branche de sauvegarde: $CURRENT_GITHUB_BRANCH"
        fi
    fi
}

# Configuration interactive
configure_github() {
    log "Configuration GitHub interactive..."
    echo
    
    # Token GitHub
    echo "🔑 Configuration du Token GitHub"
    echo "   - Allez sur https://github.com/settings/tokens"
    echo "   - Créez un token avec les permissions: repo, contents:write"
    echo
    prompt "Token GitHub" "GITHUB_TOKEN" "$CURRENT_GITHUB_TOKEN"
    
    echo
    
    # Dépôt GitHub
    echo "📁 Configuration du Dépôt GitHub"
    echo "   - Format: proprietaire/nom-du-depot"
    echo "   - Exemple: mel805/Bag-bot"
    echo
    prompt "Dépôt GitHub (owner/repo)" "GITHUB_REPO" "$CURRENT_GITHUB_REPO"
    
    echo
    
    # Branche de sauvegarde
    echo "🌿 Configuration de la Branche de Sauvegarde"
    echo "   - Nom de la branche pour stocker les sauvegardes"
    echo "   - Sera créée automatiquement si elle n'existe pas"
    echo
    if [[ -z "$CURRENT_GITHUB_BRANCH" ]]; then
        CURRENT_GITHUB_BRANCH="backup-data"
    fi
    
    # Vérifier si la branche actuelle est incorrecte
    if [[ "$CURRENT_GITHUB_BRANCH" == "backu" ]]; then
        warning "⚠️  Branche incorrecte détectée: 'backu'"
        info "Correction automatique vers 'backup-data'"
        CURRENT_GITHUB_BRANCH="backup-data"
    fi
    prompt "Branche de sauvegarde" "GITHUB_BACKUP_BRANCH" "$CURRENT_GITHUB_BRANCH"
}

# Mise à jour du fichier .env
update_env_file() {
    log "Mise à jour du fichier .env..."
    
    # Créer une sauvegarde
    if [[ -f "$ENV_FILE" ]]; then
        sudo -u "$BOT_USER" cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        success "Sauvegarde du .env créée"
    fi
    
    # Supprimer les anciennes entrées GitHub
    sudo -u "$BOT_USER" sed -i '/^GITHUB_TOKEN=/d' "$ENV_FILE" 2>/dev/null || true
    sudo -u "$BOT_USER" sed -i '/^GITHUB_REPO=/d' "$ENV_FILE" 2>/dev/null || true
    sudo -u "$BOT_USER" sed -i '/^GITHUB_BACKUP_BRANCH=/d' "$ENV_FILE" 2>/dev/null || true
    
    # Ajouter les nouvelles entrées
    {
        echo ""
        echo "# Configuration GitHub pour sauvegardes"
        echo "GITHUB_TOKEN=\"$GITHUB_TOKEN\""
        echo "GITHUB_REPO=\"$GITHUB_REPO\""
        echo "GITHUB_BACKUP_BRANCH=\"$GITHUB_BACKUP_BRANCH\""
    } | sudo -u "$BOT_USER" tee -a "$ENV_FILE" > /dev/null
    
    success "Fichier .env mis à jour"
}

# Test de la connectivité GitHub
test_github_connection() {
    log "Test de la connectivité GitHub..."
    
    # Test avec Node.js
    cat > "/tmp/test-github.js" << 'EOF'
const GitHubBackup = require('./src/storage/githubBackup.js');
require('dotenv').config();

async function testGitHub() {
    const github = new GitHubBackup();
    
    console.log('🔍 Test de configuration...');
    if (!github.isConfigured()) {
        console.error('❌ Configuration GitHub manquante');
        process.exit(1);
    }
    console.log('✅ Configuration OK');
    
    console.log('🔗 Test de connectivité...');
    const result = await github.testConnection();
    
    if (result.success) {
        console.log('✅ Connectivité GitHub OK');
        console.log(`📁 Dépôt: ${result.repo}`);
        console.log(`🔐 Permissions push: ${result.permissions.push ? '✅' : '❌'}`);
        console.log(`👑 Permissions admin: ${result.permissions.admin ? '✅' : '❌'}`);
    } else {
        console.error('❌ Erreur connectivité:', result.error);
        process.exit(1);
    }
}

testGitHub().catch(error => {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
});
EOF

    cd "$BOT_DIR"
    if sudo -u "$BOT_USER" node /tmp/test-github.js; then
        success "Test GitHub réussi !"
    else
        error "Test GitHub échoué"
        return 1
    fi
    
    rm -f "/tmp/test-github.js"
}

# Test de sauvegarde
test_backup() {
    log "Test de sauvegarde GitHub..."
    
    cat > "/tmp/test-backup.js" << 'EOF'
const GitHubBackup = require('./src/storage/githubBackup.js');
require('dotenv').config();

async function testBackup() {
    const github = new GitHubBackup();
    
    // Données de test
    const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'Test de sauvegarde depuis Freebox'
    };
    
    console.log('💾 Test de sauvegarde...');
    const result = await github.backup({ test_data: testData });
    
    if (result.success) {
        console.log('✅ Sauvegarde test réussie !');
        console.log(`📝 Commit: ${result.commit_sha.substring(0, 8)}`);
        console.log(`🔗 URL: ${result.commit_url}`);
    } else {
        console.error('❌ Sauvegarde test échouée');
        process.exit(1);
    }
}

testBackup().catch(error => {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
});
EOF

    cd "$BOT_DIR"
    if sudo -u "$BOT_USER" node /tmp/test-backup.js; then
        success "Test de sauvegarde réussi !"
    else
        error "Test de sauvegarde échoué"
        return 1
    fi
    
    rm -f "/tmp/test-backup.js"
}

# Redémarrage du bot
restart_bot() {
    log "Redémarrage du bot pour appliquer les changements..."
    
    # Détecter le gestionnaire de processus
    if systemctl is-active --quiet bag-discord-bot 2>/dev/null; then
        log "Redémarrage avec systemd..."
        systemctl restart bag-discord-bot
        success "Bot redémarré avec systemd"
    elif sudo -u "$BOT_USER" pm2 list | grep -q bagbot 2>/dev/null; then
        log "Redémarrage avec PM2..."
        sudo -u "$BOT_USER" pm2 restart bagbot
        success "Bot redémarré avec PM2"
    else
        warning "Aucun gestionnaire de processus détecté"
        info "Redémarrez manuellement le bot après ce script"
    fi
}

# Fonction principale
main() {
    echo "🔧 Correction de la Configuration GitHub - BAG Discord Bot"
    echo "======================================================="
    echo
    
    info "Ce script va configurer GitHub pour les sauvegardes sur Freebox"
    echo
    
    # Vérifications
    check_prerequisites
    read_current_env
    
    echo
    read -p "Voulez-vous continuer la configuration ? [Y/n] " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        info "Configuration annulée"
        exit 0
    fi
    
    # Configuration
    configure_github
    update_env_file
    
    echo
    log "Configuration terminée, test de connectivité..."
    
    # Tests
    if test_github_connection; then
        echo
        read -p "Voulez-vous tester une sauvegarde ? [Y/n] " -n 1 -r
        echo
        
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            test_backup
        fi
        
        echo
        read -p "Voulez-vous redémarrer le bot maintenant ? [Y/n] " -n 1 -r
        echo
        
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            restart_bot
        fi
        
        echo
        success "🎉 Configuration GitHub terminée avec succès !"
        echo
        info "Résumé de la configuration:"
        echo "   • Token: ${GITHUB_TOKEN:0:8}..."
        echo "   • Dépôt: $GITHUB_REPO"
        echo "   • Branche: $GITHUB_BACKUP_BRANCH"
        echo
        info "Les sauvegardes automatiques GitHub sont maintenant actives !"
        
    else
        error "Échec de la configuration GitHub"
        echo
        warning "Vérifiez :"
        echo "   • Que le token GitHub a les bonnes permissions"
        echo "   • Que le dépôt existe et est accessible"
        echo "   • Votre connexion Internet"
        exit 1
    fi
}

# Vérification des privilèges
if [[ $EUID -ne 0 ]]; then
    error "Ce script nécessite les privilèges root (sudo)"
    exit 1
fi

# Exécution
main "$@"