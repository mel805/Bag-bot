#!/bin/bash

# Script de déploiement des commandes Discord pour Render
# Ce script déploie automatiquement les commandes slash Discord

set -e  # Arrêter le script en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Fonction pour vérifier les variables d'environnement
check_env_vars() {
    log_info "Vérification des variables d'environnement..."
    
    local missing_vars=()
    
    if [ -z "$DISCORD_TOKEN" ]; then
        missing_vars+=("DISCORD_TOKEN")
    fi
    
    if [ -z "$CLIENT_ID" ]; then
        missing_vars+=("CLIENT_ID")
    fi
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Variables d'environnement manquantes:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi
    
    log_success "Variables d'environnement OK"
}

# Fonction pour installer les dépendances
install_dependencies() {
    log_info "Installation des dépendances..."
    
    if [ -f "package.json" ]; then
        npm ci
        log_success "Dépendances Node.js installées"
    else
        log_error "package.json non trouvé"
        exit 1
    fi
}

# Fonction pour déployer les commandes
deploy_commands() {
    log_info "Déploiement des commandes Discord..."
    
    if [ -f "src/deploy-commands.js" ]; then
        node src/deploy-commands.js
        log_success "Commandes déployées avec succès"
    else
        log_error "src/deploy-commands.js non trouvé"
        exit 1
    fi
}

# Fonction pour vérifier la santé du bot
health_check() {
    log_info "Vérification de la santé du bot..."
    
    # Test basique de connexion Discord
    node -e "
        require('dotenv').config();
        const { Client, GatewayIntentBits } = require('discord.js');
        const client = new Client({ intents: [GatewayIntentBits.Guilds] });
        
        client.once('ready', () => {
            console.log('✅ Bot connecté avec succès');
            process.exit(0);
        });
        
        client.on('error', (error) => {
            console.error('❌ Erreur de connexion:', error.message);
            process.exit(1);
        });
        
        setTimeout(() => {
            console.error('❌ Timeout de connexion');
            process.exit(1);
        }, 10000);
        
        client.login(process.env.DISCORD_TOKEN);
    "
    
    if [ $? -eq 0 ]; then
        log_success "Test de connexion réussi"
    else
        log_warning "Test de connexion échoué (peut être normal en environnement de build)"
    fi
}

# Fonction principale
main() {
    log_info "🚀 Début du déploiement des commandes Discord"
    echo "======================================================"
    
    # Vérifier les variables d'environnement
    check_env_vars
    
    # Installer les dépendances
    install_dependencies
    
    # Déployer les commandes
    deploy_commands
    
    # Vérification de santé (optionnelle)
    if [ "$1" = "--health-check" ]; then
        health_check
    fi
    
    echo "======================================================"
    log_success "✅ Déploiement des commandes terminé avec succès"
    
    log_info "Prochaines étapes:"
    echo "  1. Vérifiez que les commandes apparaissent dans Discord"
    echo "  2. Testez les commandes slash dans votre serveur"
    echo "  3. Surveillez les logs pour détecter d'éventuelles erreurs"
}

# Gestion des arguments
case "$1" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h           Afficher cette aide"
        echo "  --health-check       Effectuer un test de connexion après le déploiement"
        echo "  --env-check          Vérifier uniquement les variables d'environnement"
        echo ""
        echo "Variables d'environnement requises:"
        echo "  DISCORD_TOKEN        Token du bot Discord"
        echo "  CLIENT_ID           ID du client Discord"
        echo "  GUILD_ID            ID du serveur Discord (optionnel pour commandes globales)"
        echo ""
        exit 0
        ;;
    --env-check)
        check_env_vars
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac