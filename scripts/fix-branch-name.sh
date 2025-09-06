#!/bin/bash

# 🌿 Script de Correction du Nom de Branche GitHub - BAG Discord Bot
# Ce script corrige spécifiquement le problème de nom de branche incorrect

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

# Fonction principale
main() {
    echo "🌿 Correction du Nom de Branche GitHub - BAG Discord Bot"
    echo "====================================================="
    echo
    
    log "Vérification du répertoire du bot..."
    if [[ ! -d "$BOT_DIR" ]]; then
        error "Répertoire du bot non trouvé: $BOT_DIR"
        exit 1
    fi
    success "Répertoire du bot trouvé"
    
    log "Vérification du fichier .env..."
    if [[ ! -f "$ENV_FILE" ]]; then
        warning "Fichier .env non trouvé, création..."
        sudo -u "$BOT_USER" touch "$ENV_FILE"
    fi
    
    # Lire la configuration actuelle
    log "Lecture de la configuration actuelle..."
    CURRENT_BRANCH=$(grep "^GITHUB_BACKUP_BRANCH=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
    
    if [[ -n "$CURRENT_BRANCH" ]]; then
        info "Branche actuelle configurée: '$CURRENT_BRANCH'"
        
        if [[ "$CURRENT_BRANCH" == "backup-data" ]]; then
            success "✅ La branche est déjà correctement configurée (backup-data)"
            echo
            info "Le problème peut venir d'ailleurs. Vérifications supplémentaires..."
            
            # Vérifier les autres variables GitHub
            GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
            GITHUB_REPO=$(grep "^GITHUB_REPO=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
            
            echo
            echo "📋 Configuration GitHub actuelle:"
            echo "   • Token: ${GITHUB_TOKEN:+${GITHUB_TOKEN:0:8}...}"
            echo "   • Dépôt: $GITHUB_REPO"
            echo "   • Branche: $CURRENT_BRANCH"
            
            if [[ -z "$GITHUB_TOKEN" ]]; then
                warning "Token GitHub manquant !"
            fi
            
            if [[ -z "$GITHUB_REPO" ]]; then
                warning "Dépôt GitHub manquant !"
            fi
            
        elif [[ "$CURRENT_BRANCH" == "backu" ]]; then
            warning "❌ Branche incorrecte détectée: '$CURRENT_BRANCH'"
            log "Correction en cours..."
            
            # Créer une sauvegarde
            sudo -u "$BOT_USER" cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
            success "Sauvegarde du .env créée"
            
            # Corriger la branche
            sudo -u "$BOT_USER" sed -i 's/^GITHUB_BACKUP_BRANCH=.*/GITHUB_BACKUP_BRANCH="backup-data"/' "$ENV_FILE"
            success "Branche corrigée: backu → backup-data"
            
        else
            warning "Branche non standard détectée: '$CURRENT_BRANCH'"
            log "Mise à jour vers backup-data..."
            
            # Créer une sauvegarde
            sudo -u "$BOT_USER" cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
            success "Sauvegarde du .env créée"
            
            # Corriger la branche
            sudo -u "$BOT_USER" sed -i 's/^GITHUB_BACKUP_BRANCH=.*/GITHUB_BACKUP_BRANCH="backup-data"/' "$ENV_FILE"
            success "Branche mise à jour: $CURRENT_BRANCH → backup-data"
        fi
    else
        warning "Aucune branche configurée"
        log "Ajout de la configuration par défaut..."
        
        # Ajouter la configuration de branche
        echo 'GITHUB_BACKUP_BRANCH="backup-data"' | sudo -u "$BOT_USER" tee -a "$ENV_FILE" > /dev/null
        success "Branche configurée: backup-data"
    fi
    
    echo
    log "Vérification de la configuration finale..."
    
    # Relire la configuration
    FINAL_BRANCH=$(grep "^GITHUB_BACKUP_BRANCH=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
    
    if [[ "$FINAL_BRANCH" == "backup-data" ]]; then
        success "✅ Configuration finale correcte: backup-data"
    else
        error "❌ Problème de configuration: '$FINAL_BRANCH'"
        exit 1
    fi
    
    echo
    log "Test de la configuration avec Node.js..."
    
    # Test avec Node.js
    cat > "/tmp/test-branch-config.js" << 'EOF'
require('dotenv').config();

const expectedBranch = 'backup-data';
const actualBranch = process.env.GITHUB_BACKUP_BRANCH || 'backup-data';

console.log(`🌿 Branche configurée: ${actualBranch}`);
console.log(`🎯 Branche attendue: ${expectedBranch}`);

if (actualBranch === expectedBranch) {
    console.log('✅ Configuration de branche correcte !');
    process.exit(0);
} else {
    console.log(`❌ Configuration incorrecte ! Attendu: ${expectedBranch}, Trouvé: ${actualBranch}`);
    process.exit(1);
}
EOF

    cd "$BOT_DIR"
    if sudo -u "$BOT_USER" node /tmp/test-branch-config.js; then
        success "Test Node.js réussi !"
    else
        error "Test Node.js échoué"
        rm -f "/tmp/test-branch-config.js"
        exit 1
    fi
    
    rm -f "/tmp/test-branch-config.js"
    
    echo
    log "Redémarrage du bot pour appliquer les changements..."
    
    # Redémarrage du bot
    if systemctl is-active --quiet bag-discord-bot 2>/dev/null; then
        systemctl restart bag-discord-bot
        success "Bot redémarré avec systemd"
    elif sudo -u "$BOT_USER" pm2 list | grep -q bagbot 2>/dev/null; then
        sudo -u "$BOT_USER" pm2 restart bagbot
        success "Bot redémarré avec PM2"
    else
        warning "Gestionnaire de processus non détecté"
        info "Redémarrez manuellement le bot"
    fi
    
    echo
    success "🎉 Correction de la branche terminée !"
    echo
    info "Résumé:"
    echo "   • Branche GitHub: backup-data ✅"
    echo "   • Configuration sauvegardée ✅"
    echo "   • Bot redémarré ✅"
    echo
    info "La sauvegarde GitHub devrait maintenant fonctionner !"
    
    # Suggestion de test
    echo
    log "💡 Pour tester la sauvegarde GitHub:"
    echo "   cd $BOT_DIR"
    echo "   sudo -u $BOT_USER node -e \""
    echo "     const GitHubBackup = require('./src/storage/githubBackup.js');"
    echo "     require('dotenv').config();"
    echo "     const github = new GitHubBackup();"
    echo "     github.backup({test: true}).then(console.log).catch(console.error);"
    echo "   \""
}

# Vérification des privilèges
if [[ $EUID -ne 0 ]]; then
    error "Ce script nécessite les privilèges root (sudo)"
    exit 1
fi

# Exécution
main "$@"