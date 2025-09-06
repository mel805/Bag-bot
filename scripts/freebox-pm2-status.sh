#!/bin/bash

# 📊 Script de Monitoring PM2 - BAG Discord Bot sur Freebox Delta
# Ce script affiche le statut complet du bot géré par PM2

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variables de configuration
BOT_USER="botuser"
BOT_DIR="/home/$BOT_USER/bag-discord-bot"
APP_NAME="bagbot"

# Fonction d'affichage
header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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

# Fonction pour formater la taille
format_size() {
    local size=$1
    if [[ $size -gt 1073741824 ]]; then
        echo "$(( size / 1073741824 )) Go"
    elif [[ $size -gt 1048576 ]]; then
        echo "$(( size / 1048576 )) Mo"
    elif [[ $size -gt 1024 ]]; then
        echo "$(( size / 1024 )) Ko"
    else
        echo "$size octets"
    fi
}

# Fonction pour formater le temps d'uptime
format_uptime() {
    local uptime_str="$1"
    echo "$uptime_str"
}

# Vérification de PM2
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        error "PM2 n'est pas installé"
        return 1
    fi
    
    if ! id "$BOT_USER" &>/dev/null; then
        error "L'utilisateur $BOT_USER n'existe pas"
        return 1
    fi
    
    return 0
}

# Statut du système
show_system_status() {
    header "📊 STATUT DU SYSTÈME"
    
    # Informations de base
    echo -e "${PURPLE}Hostname:${NC} $(hostname)"
    echo -e "${PURPLE}Date:${NC} $(date)"
    echo -e "${PURPLE}Uptime:${NC} $(uptime -p)"
    
    # Charge système
    LOAD=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^[[:space:]]*//')
    echo -e "${PURPLE}Charge système:${NC} $LOAD"
    
    # Mémoire
    MEMORY_INFO=$(free -h | grep "Mem:")
    MEMORY_TOTAL=$(echo $MEMORY_INFO | awk '{print $2}')
    MEMORY_USED=$(echo $MEMORY_INFO | awk '{print $3}')
    MEMORY_PERCENT=$(free | grep "Mem:" | awk '{printf "%.1f", $3/$2 * 100.0}')
    
    echo -e "${PURPLE}Mémoire:${NC} $MEMORY_USED / $MEMORY_TOTAL utilisés (${MEMORY_PERCENT}%)"
    
    # Espace disque
    DISK_INFO=$(df -h / | tail -n1)
    DISK_USED=$(echo $DISK_INFO | awk '{print $3}')
    DISK_TOTAL=$(echo $DISK_INFO | awk '{print $2}')
    DISK_PERCENT=$(echo $DISK_INFO | awk '{print $5}')
    
    echo -e "${PURPLE}Disque (/) :${NC} $DISK_USED / $DISK_TOTAL utilisés ($DISK_PERCENT)"
}

# Statut général de PM2
show_pm2_general_status() {
    header "🚀 STATUT GÉNÉRAL PM2"
    
    # Version de PM2
    PM2_VERSION=$(pm2 --version)
    echo -e "${PURPLE}Version PM2:${NC} $PM2_VERSION"
    
    # Nombre total de processus
    TOTAL_PROCESSES=$(sudo -u "$BOT_USER" pm2 list | grep -c "│" | awk '{print $1-2}' 2>/dev/null || echo "0")
    echo -e "${PURPLE}Processus total:${NC} $TOTAL_PROCESSES"
    
    # Statut du daemon PM2
    if sudo -u "$BOT_USER" pm2 ping >/dev/null 2>&1; then
        success "Daemon PM2 actif"
    else
        error "Daemon PM2 inactif"
    fi
    
    echo
    
    # Liste des processus PM2
    info "Liste des processus PM2:"
    sudo -u "$BOT_USER" pm2 status 2>/dev/null || warning "Impossible d'obtenir la liste des processus"
}

# Statut détaillé de l'application
show_app_detailed_status() {
    header "🤖 STATUT DÉTAILLÉ DU BOT"
    
    # Vérifier si l'application existe
    if ! sudo -u "$BOT_USER" pm2 list | grep -q "$APP_NAME"; then
        error "Application $APP_NAME non trouvée dans PM2"
        echo
        warning "Pour démarrer l'application:"
        echo "  sudo -u $BOT_USER pm2 start $BOT_DIR/ecosystem.config.js --env production"
        return 1
    fi
    
    # Statut de base
    APP_STATUS=$(sudo -u "$BOT_USER" pm2 list | grep "$APP_NAME" | awk '{print $12}' 2>/dev/null || echo "unknown")
    
    if [[ "$APP_STATUS" == "online" ]]; then
        success "Application en ligne"
    elif [[ "$APP_STATUS" == "stopped" ]]; then
        warning "Application arrêtée"
    elif [[ "$APP_STATUS" == "errored" ]]; then
        error "Application en erreur"
    else
        warning "Statut inconnu: $APP_STATUS"
    fi
    
    echo
    
    # Détails complets de l'application
    info "Détails de l'application $APP_NAME:"
    sudo -u "$BOT_USER" pm2 describe "$APP_NAME" 2>/dev/null | grep -E "(name|version|status|pid|uptime|restarts|cpu|memory|mode|script|log path)" || warning "Impossible d'obtenir les détails"
}

# Métriques de performance
show_performance_metrics() {
    header "📈 MÉTRIQUES DE PERFORMANCE"
    
    if sudo -u "$BOT_USER" pm2 list | grep -q "$APP_NAME"; then
        # Utilisation CPU et mémoire
        info "Utilisation des ressources:"
        sudo -u "$BOT_USER" pm2 list | grep "$APP_NAME" | awk '{
            printf "  CPU: %s%%\n", $13
            printf "  Mémoire: %s\n", $14
        }' 2>/dev/null || warning "Métriques non disponibles"
        
        echo
        
        # Historique des redémarrages
        RESTARTS=$(sudo -u "$BOT_USER" pm2 describe "$APP_NAME" 2>/dev/null | grep "restarts" | awk '{print $2}' || echo "0")
        echo -e "${PURPLE}Nombre de redémarrages:${NC} $RESTARTS"
        
        # Uptime
        UPTIME=$(sudo -u "$BOT_USER" pm2 describe "$APP_NAME" 2>/dev/null | grep "uptime" | awk '{print $2, $3}' || echo "unknown")
        echo -e "${PURPLE}Temps de fonctionnement:${NC} $UPTIME"
        
        # PID
        PID=$(sudo -u "$BOT_USER" pm2 describe "$APP_NAME" 2>/dev/null | grep "pid" | awk '{print $2}' || echo "unknown")
        echo -e "${PURPLE}PID:${NC} $PID"
        
        # Mode d'exécution
        MODE=$(sudo -u "$BOT_USER" pm2 describe "$APP_NAME" 2>/dev/null | grep "mode" | awk '{print $2}' || echo "unknown")
        echo -e "${PURPLE}Mode d'exécution:${NC} $MODE"
        
    else
        warning "Application $APP_NAME non trouvée pour les métriques"
    fi
}

# Statut des logs
show_logs_status() {
    header "📁 STATUT DES LOGS"
    
    # Logs PM2 par défaut
    PM2_LOG_DIR="/home/$BOT_USER/.pm2/logs"
    if [[ -d "$PM2_LOG_DIR" ]]; then
        info "Répertoire des logs PM2: $PM2_LOG_DIR"
        
        # Taille des logs
        if [[ -f "$PM2_LOG_DIR/$APP_NAME-out.log" ]]; then
            OUT_SIZE=$(stat -c%s "$PM2_LOG_DIR/$APP_NAME-out.log" 2>/dev/null || echo "0")
            echo -e "  ${PURPLE}Log sortie:${NC} $(format_size $OUT_SIZE)"
        fi
        
        if [[ -f "$PM2_LOG_DIR/$APP_NAME-error.log" ]]; then
            ERR_SIZE=$(stat -c%s "$PM2_LOG_DIR/$APP_NAME-error.log" 2>/dev/null || echo "0")
            echo -e "  ${PURPLE}Log erreur:${NC} $(format_size $ERR_SIZE)"
        fi
    fi
    
    # Logs personnalisés
    CUSTOM_LOG_DIR="$BOT_DIR/logs"
    if [[ -d "$CUSTOM_LOG_DIR" ]]; then
        echo
        info "Répertoire des logs personnalisés: $CUSTOM_LOG_DIR"
        
        for log_file in "$CUSTOM_LOG_DIR"/*.log; do
            if [[ -f "$log_file" ]]; then
                LOG_SIZE=$(stat -c%s "$log_file" 2>/dev/null || echo "0")
                LOG_NAME=$(basename "$log_file")
                echo -e "  ${PURPLE}$LOG_NAME:${NC} $(format_size $LOG_SIZE)"
            fi
        done
    fi
    
    echo
    
    # Erreurs récentes
    info "Erreurs récentes (dernières 24h):"
    if [[ -f "$PM2_LOG_DIR/$APP_NAME-error.log" ]]; then
        ERROR_COUNT=$(grep -c "$(date +%Y-%m-%d)" "$PM2_LOG_DIR/$APP_NAME-error.log" 2>/dev/null || echo "0")
        if [[ $ERROR_COUNT -gt 0 ]]; then
            warning "$ERROR_COUNT erreurs trouvées aujourd'hui"
        else
            success "Aucune erreur aujourd'hui"
        fi
    else
        info "Fichier de log d'erreur non trouvé"
    fi
}

# Logs récents
show_recent_logs() {
    header "📋 LOGS RÉCENTS"
    
    if sudo -u "$BOT_USER" pm2 list | grep -q "$APP_NAME"; then
        echo -e "${PURPLE}Dernières 10 entrées de log:${NC}"
        sudo -u "$BOT_USER" pm2 logs "$APP_NAME" --lines 10 --raw 2>/dev/null | while read line; do
            echo "  $line"
        done
    else
        warning "Application $APP_NAME non trouvée pour afficher les logs"
    fi
}

# Configuration PM2
show_pm2_config() {
    header "⚙️ CONFIGURATION PM2"
    
    # Configuration de l'ecosystem
    if [[ -f "$BOT_DIR/ecosystem.config.js" ]]; then
        success "Fichier ecosystem.config.js trouvé"
        echo -e "${PURPLE}Localisation:${NC} $BOT_DIR/ecosystem.config.js"
        
        # Afficher quelques informations de config
        info "Configuration de l'application:"
        grep -E "(name|script|instances|max_memory_restart)" "$BOT_DIR/ecosystem.config.js" | sed 's/^/  /' 2>/dev/null || true
    else
        warning "Fichier ecosystem.config.js non trouvé"
    fi
    
    echo
    
    # Variables d'environnement PM2
    info "Variables d'environnement PM2:"
    sudo -u "$BOT_USER" pm2 describe "$APP_NAME" 2>/dev/null | grep -A 10 "env:" | head -10 | sed 's/^/  /' || warning "Variables non disponibles"
}

# Recommandations
show_recommendations() {
    header "💡 RECOMMANDATIONS"
    
    RECOMMENDATIONS=()
    
    # Vérifier si l'application est en ligne
    if ! sudo -u "$BOT_USER" pm2 list | grep "$APP_NAME" | grep -q "online"; then
        RECOMMENDATIONS+=("🔴 Application hors ligne - Démarrez avec: sudo -u $BOT_USER pm2 start $APP_NAME")
    fi
    
    # Vérifier la mémoire système
    MEMORY_PERCENT=$(free | grep "Mem:" | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [[ $MEMORY_PERCENT -gt 80 ]]; then
        RECOMMENDATIONS+=("⚠️  Mémoire élevée (${MEMORY_PERCENT}%) - Surveillez l'utilisation mémoire")
    fi
    
    # Vérifier les redémarrages
    if sudo -u "$BOT_USER" pm2 list | grep -q "$APP_NAME"; then
        RESTARTS=$(sudo -u "$BOT_USER" pm2 describe "$APP_NAME" 2>/dev/null | grep "restarts" | awk '{print $2}' || echo "0")
        if [[ $RESTARTS -gt 10 ]]; then
            RECOMMENDATIONS+=("🔍 Nombreux redémarrages ($RESTARTS) - Vérifiez les logs pour identifier les problèmes")
        fi
    fi
    
    # Vérifier l'espace disque
    DISK_PERCENT=$(df / | tail -n1 | awk '{print $5}' | sed 's/%//')
    if [[ $DISK_PERCENT -gt 80 ]]; then
        RECOMMENDATIONS+=("⚠️  Espace disque faible (${DISK_PERCENT}%) - Nettoyez les logs ou augmentez l'espace")
    fi
    
    # Vérifier les logs volumineux
    if [[ -d "/home/$BOT_USER/.pm2/logs" ]]; then
        LARGE_LOGS=$(find "/home/$BOT_USER/.pm2/logs" -name "*.log" -size +50M 2>/dev/null | wc -l)
        if [[ $LARGE_LOGS -gt 0 ]]; then
            RECOMMENDATIONS+=("📁 $LARGE_LOGS fichiers de log volumineux - Utilisez: sudo -u $BOT_USER pm2 flush")
        fi
    fi
    
    # Afficher les recommandations
    if [[ ${#RECOMMENDATIONS[@]} -eq 0 ]]; then
        success "Tout semble fonctionner correctement!"
    else
        for rec in "${RECOMMENDATIONS[@]}"; do
            echo "$rec"
        done
    fi
}

# Fonction principale
main() {
    clear
    echo -e "${CYAN}🏠 MONITORING PM2 - BAG DISCORD BOT - FREEBOX DELTA${NC}"
    echo -e "${CYAN}Généré le: $(date)${NC}"
    echo
    
    if ! check_pm2; then
        exit 1
    fi
    
    show_system_status
    echo
    show_pm2_general_status
    echo
    show_app_detailed_status
    echo
    show_performance_metrics
    echo
    show_logs_status
    echo
    show_recent_logs
    echo
    show_pm2_config
    echo
    show_recommendations
    
    echo
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}📋 Commandes PM2 utiles:${NC}"
    echo -e "   • Monitoring temps réel: ${YELLOW}sudo -u $BOT_USER pm2 monit${NC}"
    echo -e "   • Logs temps réel:       ${YELLOW}sudo -u $BOT_USER pm2 logs $APP_NAME${NC}"
    echo -e "   • Redémarrer:            ${YELLOW}sudo -u $BOT_USER pm2 restart $APP_NAME${NC}"
    echo -e "   • Interface web:         ${YELLOW}sudo -u $BOT_USER pm2 web${NC}"
    echo -e "   • Flush logs:            ${YELLOW}sudo -u $BOT_USER pm2 flush${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Gestion des options
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Afficher cette aide"
        echo "  --app          Afficher uniquement le statut de l'application"
        echo "  --system       Afficher uniquement le statut système"
        echo "  --logs         Afficher uniquement les logs récents"
        echo "  --config       Afficher uniquement la configuration"
        echo "  --watch        Mode surveillance (rafraîchissement automatique)"
        echo "  --web          Lancer l'interface web PM2"
        echo "  --monit        Lancer le monitoring temps réel PM2"
        echo
        exit 0
        ;;
    --app)
        check_pm2 || exit 1
        show_app_detailed_status
        show_performance_metrics
        ;;
    --system)
        show_system_status
        ;;
    --logs)
        check_pm2 || exit 1
        show_logs_status
        show_recent_logs
        ;;
    --config)
        check_pm2 || exit 1
        show_pm2_config
        ;;
    --watch)
        while true; do
            main
            echo
            echo "Rafraîchissement dans 30 secondes... (Ctrl+C pour arrêter)"
            sleep 30
            clear
        done
        ;;
    --web)
        if check_pm2; then
            echo "Lancement de l'interface web PM2..."
            sudo -u "$BOT_USER" pm2 web
        fi
        ;;
    --monit)
        if check_pm2; then
            echo "Lancement du monitoring temps réel PM2..."
            sudo -u "$BOT_USER" pm2 monit
        fi
        ;;
    *)
        main
        ;;
esac