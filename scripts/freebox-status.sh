#!/bin/bash

# 📊 Script de Monitoring - BAG Discord Bot sur Freebox Delta
# Ce script affiche le statut complet du bot et du système

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
SERVICE_NAME="bag-discord-bot"

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
    echo -e "${BLUE}ℹ️  $1${NC}"
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
    local seconds=$1
    local days=$((seconds / 86400))
    local hours=$(((seconds % 86400) / 3600))
    local minutes=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))
    
    if [[ $days -gt 0 ]]; then
        echo "${days}j ${hours}h ${minutes}m"
    elif [[ $hours -gt 0 ]]; then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m ${secs}s"
    fi
}

# Statut du système
show_system_status() {
    header "📊 STATUT DU SYSTÈME"
    
    # Informations de base
    echo -e "${PURPLE}Hostname:${NC} $(hostname)"
    echo -e "${PURPLE}Date:${NC} $(date)"
    echo -e "${PURPLE}Uptime:${NC} $(uptime -p)"
    echo -e "${PURPLE}Utilisateurs connectés:${NC} $(who | wc -l)"
    
    echo
    
    # Charge système
    LOAD=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^[[:space:]]*//')
    echo -e "${PURPLE}Charge système:${NC} $LOAD"
    
    # Mémoire
    MEMORY_INFO=$(free -h | grep "Mem:")
    MEMORY_TOTAL=$(echo $MEMORY_INFO | awk '{print $2}')
    MEMORY_USED=$(echo $MEMORY_INFO | awk '{print $3}')
    MEMORY_FREE=$(echo $MEMORY_INFO | awk '{print $4}')
    MEMORY_PERCENT=$(free | grep "Mem:" | awk '{printf "%.1f", $3/$2 * 100.0}')
    
    echo -e "${PURPLE}Mémoire:${NC} $MEMORY_USED / $MEMORY_TOTAL utilisés (${MEMORY_PERCENT}%)"
    
    # Espace disque
    DISK_INFO=$(df -h / | tail -n1)
    DISK_USED=$(echo $DISK_INFO | awk '{print $3}')
    DISK_TOTAL=$(echo $DISK_INFO | awk '{print $2}')
    DISK_PERCENT=$(echo $DISK_INFO | awk '{print $5}')
    
    echo -e "${PURPLE}Disque (/) :${NC} $DISK_USED / $DISK_TOTAL utilisés ($DISK_PERCENT)"
    
    # Processus les plus gourmands
    echo
    echo -e "${PURPLE}Top 5 des processus (CPU):${NC}"
    ps aux --sort=-%cpu | head -n6 | tail -n5 | while read line; do
        echo "  $line" | awk '{printf "  %-10s %5s%% %5s%% %s\n", $1, $3, $4, substr($0, index($0,$11))}'
    done
}

# Détection du gestionnaire de processus
detect_process_manager() {
    # Vérifier si PM2 est installé et gère l'application
    if command -v pm2 &> /dev/null && sudo -u "$BOT_USER" pm2 list | grep -q "bagbot"; then
        echo "pm2"
    elif systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        echo "systemd"
    else
        echo "none"
    fi
}

# Statut du service
show_service_status() {
    header "🤖 STATUT DU BOT DISCORD"
    
    PROCESS_MANAGER=$(detect_process_manager)
    
    case "$PROCESS_MANAGER" in
        "pm2")
            show_pm2_status
            ;;
        "systemd")
            show_systemd_status
            ;;
        "none")
            error "Aucun gestionnaire de processus détecté pour le bot"
            warning "Le bot n'est configuré ni avec systemd ni avec PM2"
            return 1
            ;;
    esac
}

# Statut systemd
show_systemd_status() {
    info "Gestionnaire de processus: systemd"
    echo
    if ! systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        error "Service $SERVICE_NAME non trouvé"
        return 1
    fi
    
    # Statut du service
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Service actif et en cours d'exécution"
    else
        error "Service inactif"
    fi
    
    if systemctl is-enabled --quiet "$SERVICE_NAME"; then
        success "Service activé au démarrage"
    else
        warning "Service non activé au démarrage"
    fi
    
    # Informations détaillées
    echo
    echo -e "${PURPLE}Détails du service:${NC}"
    
    # PID et uptime du service
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        PID=$(systemctl show "$SERVICE_NAME" --property=MainPID --value)
        if [[ "$PID" != "0" ]] && [[ -n "$PID" ]]; then
            echo -e "  ${PURPLE}PID:${NC} $PID"
            
            # Uptime du processus
            if [[ -f "/proc/$PID/stat" ]]; then
                STARTTIME=$(awk '{print $22}' "/proc/$PID/stat")
                BOOT_TIME=$(awk '/btime/ {print $2}' /proc/stat)
                PROCESS_START=$((BOOT_TIME + STARTTIME / 100))
                CURRENT_TIME=$(date +%s)
                UPTIME_SECONDS=$((CURRENT_TIME - PROCESS_START))
                echo -e "  ${PURPLE}Uptime:${NC} $(format_uptime $UPTIME_SECONDS)"
            fi
            
            # Utilisation mémoire du processus
            if [[ -f "/proc/$PID/status" ]]; then
                MEMORY_KB=$(grep "VmRSS" "/proc/$PID/status" | awk '{print $2}')
                if [[ -n "$MEMORY_KB" ]]; then
                    MEMORY_BYTES=$((MEMORY_KB * 1024))
                    echo -e "  ${PURPLE}Mémoire:${NC} $(format_size $MEMORY_BYTES)"
                fi
            fi
            
            # CPU du processus
            CPU_PERCENT=$(ps -p "$PID" -o %cpu --no-headers 2>/dev/null | tr -d ' ')
            if [[ -n "$CPU_PERCENT" ]]; then
                echo -e "  ${PURPLE}CPU:${NC} ${CPU_PERCENT}%"
            fi
        fi
    fi
    
    # Derniers redémarrages
    echo
    echo -e "${PURPLE}Historique des redémarrages (derniers 5):${NC}"
    journalctl -u "$SERVICE_NAME" --since "7 days ago" | grep -E "(Started|Stopped)" | tail -n5 | while read line; do
        echo "  $line"
    done
}

# Statut PM2
show_pm2_status() {
    info "Gestionnaire de processus: PM2"
    echo
    
    # Version de PM2
    if command -v pm2 &> /dev/null; then
        PM2_VERSION=$(pm2 --version)
        echo -e "${PURPLE}Version PM2:${NC} $PM2_VERSION"
    fi
    
    # Statut de l'application
    if sudo -u "$BOT_USER" pm2 list | grep -q "bagbot"; then
        APP_STATUS=$(sudo -u "$BOT_USER" pm2 list | grep "bagbot" | awk '{print $12}' 2>/dev/null || echo "unknown")
        
        case "$APP_STATUS" in
            "online")
                success "Application en ligne"
                ;;
            "stopped")
                warning "Application arrêtée"
                ;;
            "errored")
                error "Application en erreur"
                ;;
            *)
                warning "Statut inconnu: $APP_STATUS"
                ;;
        esac
        
        # Informations détaillées
        echo
        echo -e "${PURPLE}Détails de l'application:${NC}"
        
        # Utilisation des ressources
        CPU_PERCENT=$(sudo -u "$BOT_USER" pm2 list | grep "bagbot" | awk '{print $13}' 2>/dev/null || echo "N/A")
        MEMORY_USAGE=$(sudo -u "$BOT_USER" pm2 list | grep "bagbot" | awk '{print $14}' 2>/dev/null || echo "N/A")
        
        echo -e "  ${PURPLE}CPU:${NC} $CPU_PERCENT"
        echo -e "  ${PURPLE}Mémoire:${NC} $MEMORY_USAGE"
        
        # Autres détails
        RESTARTS=$(sudo -u "$BOT_USER" pm2 describe "bagbot" 2>/dev/null | grep "restarts" | awk '{print $2}' || echo "0")
        UPTIME=$(sudo -u "$BOT_USER" pm2 describe "bagbot" 2>/dev/null | grep "uptime" | awk '{print $2, $3}' || echo "unknown")
        PID=$(sudo -u "$BOT_USER" pm2 describe "bagbot" 2>/dev/null | grep "pid" | awk '{print $2}' || echo "unknown")
        
        echo -e "  ${PURPLE}PID:${NC} $PID"
        echo -e "  ${PURPLE}Uptime:${NC} $UPTIME"
        echo -e "  ${PURPLE}Redémarrages:${NC} $RESTARTS"
        
    else
        error "Application bagbot non trouvée dans PM2"
        warning "Pour démarrer: sudo -u $BOT_USER pm2 start $BOT_DIR/ecosystem.config.js --env production"
    fi
}

# Statut des fichiers et configuration
show_files_status() {
    header "📁 STATUT DES FICHIERS"
    
    # Vérifier l'existence des fichiers importants
    FILES_TO_CHECK=(
        "$BOT_DIR/src/bot.js:Script principal"
        "$BOT_DIR/package.json:Configuration npm"
        "$BOT_DIR/.env:Variables d'environnement"
        "$BOT_DIR/data:Répertoire de données"
        "$BOT_DIR/logs:Répertoire de logs"
        "$BOT_DIR/backups:Répertoire de sauvegardes"
    )
    
    for file_info in "${FILES_TO_CHECK[@]}"; do
        IFS=':' read -r filepath description <<< "$file_info"
        
        if [[ -e "$filepath" ]]; then
            if [[ -f "$filepath" ]]; then
                SIZE=$(stat -c%s "$filepath" 2>/dev/null || echo "0")
                success "$description: $(format_size $SIZE)"
            elif [[ -d "$filepath" ]]; then
                COUNT=$(find "$filepath" -type f 2>/dev/null | wc -l)
                success "$description: $COUNT fichiers"
            fi
        else
            error "$description: Manquant"
        fi
    done
    
    # Permissions du répertoire
    echo
    echo -e "${PURPLE}Permissions du répertoire principal:${NC}"
    if [[ -d "$BOT_DIR" ]]; then
        PERMS=$(stat -c "%a %U:%G" "$BOT_DIR")
        echo -e "  ${PURPLE}$BOT_DIR:${NC} $PERMS"
    fi
    
    # Espace utilisé par le bot
    if [[ -d "$BOT_DIR" ]]; then
        BOT_SIZE=$(du -sh "$BOT_DIR" 2>/dev/null | cut -f1)
        echo -e "  ${PURPLE}Taille totale:${NC} $BOT_SIZE"
    fi
}

# Statut réseau et connectivité
show_network_status() {
    header "🌐 STATUT RÉSEAU"
    
    # Test de connectivité Internet
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        success "Connectivité Internet: OK"
    else
        error "Connectivité Internet: Échec"
    fi
    
    # Test de connectivité Discord
    if ping -c 1 discord.com >/dev/null 2>&1; then
        success "Connectivité Discord: OK"
    else
        error "Connectivité Discord: Échec"
    fi
    
    # Ports ouverts
    echo
    echo -e "${PURPLE}Ports réseau ouverts par Node.js:${NC}"
    if command -v netstat >/dev/null 2>&1; then
        netstat -tlnp 2>/dev/null | grep node | while read line; do
            echo "  $line"
        done
    else
        warning "netstat non disponible"
    fi
}

# Logs récents
show_recent_logs() {
    header "📋 LOGS RÉCENTS"
    
    PROCESS_MANAGER=$(detect_process_manager)
    
    case "$PROCESS_MANAGER" in
        "pm2")
            show_pm2_logs
            ;;
        "systemd")
            show_systemd_logs
            ;;
        *)
            warning "Aucun gestionnaire de processus détecté pour afficher les logs"
            ;;
    esac
}

# Logs systemd
show_systemd_logs() {
    echo -e "${PURPLE}Dernières 10 entrées du journal systemd:${NC}"
    if journalctl -u "$SERVICE_NAME" -n 10 --no-pager >/dev/null 2>&1; then
        journalctl -u "$SERVICE_NAME" -n 10 --no-pager | while read line; do
            echo "  $line"
        done
    else
        warning "Impossible de récupérer les logs du service"
    fi
    
    # Logs d'erreur récents
    echo
    echo -e "${PURPLE}Erreurs récentes (dernières 24h):${NC}"
    ERROR_COUNT=$(journalctl -u "$SERVICE_NAME" --since "24 hours ago" -p err --no-pager | wc -l)
    if [[ $ERROR_COUNT -gt 0 ]]; then
        error "$ERROR_COUNT erreurs trouvées"
        journalctl -u "$SERVICE_NAME" --since "24 hours ago" -p err --no-pager | tail -n5 | while read line; do
            echo "  $line"
        done
    else
        success "Aucune erreur dans les dernières 24h"
    fi
}

# Logs PM2
show_pm2_logs() {
    echo -e "${PURPLE}Dernières 10 entrées des logs PM2:${NC}"
    if sudo -u "$BOT_USER" pm2 logs "bagbot" --lines 10 --raw >/dev/null 2>&1; then
        sudo -u "$BOT_USER" pm2 logs "bagbot" --lines 10 --raw | while read line; do
            echo "  $line"
        done
    else
        warning "Impossible de récupérer les logs PM2"
    fi
    
    # Logs d'erreur récents PM2
    echo
    echo -e "${PURPLE}Erreurs récentes PM2:${NC}"
    PM2_ERROR_LOG="/home/$BOT_USER/.pm2/logs/bagbot-error.log"
    if [[ -f "$PM2_ERROR_LOG" ]]; then
        ERROR_COUNT=$(grep -c "$(date +%Y-%m-%d)" "$PM2_ERROR_LOG" 2>/dev/null || echo "0")
        if [[ $ERROR_COUNT -gt 0 ]]; then
            error "$ERROR_COUNT erreurs trouvées aujourd'hui"
            tail -n5 "$PM2_ERROR_LOG" | while read line; do
                echo "  $line"
            done
        else
            success "Aucune erreur aujourd'hui"
        fi
    else
        info "Fichier de log d'erreur PM2 non trouvé"
    fi
}

# Recommandations
show_recommendations() {
    header "💡 RECOMMANDATIONS"
    
    RECOMMENDATIONS=()
    
    # Vérifier la mémoire
    MEMORY_PERCENT=$(free | grep "Mem:" | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [[ $MEMORY_PERCENT -gt 80 ]]; then
        RECOMMENDATIONS+=("⚠️  Mémoire élevée (${MEMORY_PERCENT}%) - Considérez augmenter la RAM de la VM")
    fi
    
    # Vérifier l'espace disque
    DISK_PERCENT=$(df / | tail -n1 | awk '{print $5}' | sed 's/%//')
    if [[ $DISK_PERCENT -gt 80 ]]; then
        RECOMMENDATIONS+=("⚠️  Espace disque faible (${DISK_PERCENT}%) - Nettoyez les logs ou augmentez l'espace")
    fi
    
    # Vérifier le statut selon le gestionnaire de processus
    PROCESS_MANAGER=$(detect_process_manager)
    
    case "$PROCESS_MANAGER" in
        "pm2")
            # Vérifier si l'application PM2 est active
            if ! sudo -u "$BOT_USER" pm2 list | grep "bagbot" | grep -q "online"; then
                RECOMMENDATIONS+=("🔴 Application PM2 hors ligne - Démarrez avec: sudo -u $BOT_USER pm2 start bagbot")
            fi
            
            # Vérifier les redémarrages PM2
            if sudo -u "$BOT_USER" pm2 list | grep -q "bagbot"; then
                RESTARTS=$(sudo -u "$BOT_USER" pm2 describe "bagbot" 2>/dev/null | grep "restarts" | awk '{print $2}' || echo "0")
                if [[ $RESTARTS -gt 10 ]]; then
                    RECOMMENDATIONS+=("🔍 Nombreux redémarrages PM2 ($RESTARTS) - Vérifiez: sudo -u $BOT_USER pm2 logs bagbot")
                fi
            fi
            ;;
        "systemd")
            # Vérifier si le service systemd est actif
            if ! systemctl is-active --quiet "$SERVICE_NAME"; then
                RECOMMENDATIONS+=("🔴 Service systemd inactif - Démarrez avec: sudo systemctl start $SERVICE_NAME")
            fi
            
            # Vérifier les erreurs récentes systemd
            ERROR_COUNT=$(journalctl -u "$SERVICE_NAME" --since "24 hours ago" -p err --no-pager | wc -l)
            if [[ $ERROR_COUNT -gt 5 ]]; then
                RECOMMENDATIONS+=("🔍 Nombreuses erreurs récentes ($ERROR_COUNT) - Vérifiez: sudo journalctl -u $SERVICE_NAME -f")
            fi
            ;;
        "none")
            RECOMMENDATIONS+=("🚨 Aucun gestionnaire de processus détecté - Configurez systemd ou PM2")
            ;;
    esac
    
    # Vérifier la dernière mise à jour
    if [[ -d "$BOT_DIR/.git" ]]; then
        cd "$BOT_DIR"
        LAST_COMMIT=$(git log -1 --format="%cr" 2>/dev/null || echo "inconnue")
        if [[ "$LAST_COMMIT" == *"week"* ]] || [[ "$LAST_COMMIT" == *"month"* ]]; then
            RECOMMENDATIONS+=("🔄 Dernière mise à jour: $LAST_COMMIT - Considérez une mise à jour")
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
    echo -e "${CYAN}🏠 MONITORING BAG DISCORD BOT - FREEBOX DELTA${NC}"
    echo -e "${CYAN}Généré le: $(date)${NC}"
    echo
    
    show_system_status
    echo
    show_service_status
    echo
    show_files_status
    echo
    show_network_status
    echo
    show_recent_logs
    echo
    show_recommendations
    
    echo
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    PROCESS_MANAGER=$(detect_process_manager)
    
    case "$PROCESS_MANAGER" in
        "pm2")
            echo -e "${CYAN}📋 Commandes PM2 utiles:${NC}"
            echo -e "   • Monitoring:      ${YELLOW}sudo -u $BOT_USER pm2 monit${NC}"
            echo -e "   • Logs temps réel: ${YELLOW}sudo -u $BOT_USER pm2 logs bagbot${NC}"
            echo -e "   • Redémarrer:      ${YELLOW}sudo -u $BOT_USER pm2 restart bagbot${NC}"
            echo -e "   • Interface web:   ${YELLOW}sudo -u $BOT_USER pm2 web${NC}"
            echo -e "   • Statut PM2:      ${YELLOW}./scripts/freebox-pm2-status.sh${NC}"
            echo -e "   • Redémarrage:     ${YELLOW}./scripts/freebox-pm2-restart.sh${NC}"
            ;;
        "systemd")
            echo -e "${CYAN}📋 Commandes systemd utiles:${NC}"
            echo -e "   • Logs temps réel: ${YELLOW}sudo journalctl -u $SERVICE_NAME -f${NC}"
            echo -e "   • Redémarrer:      ${YELLOW}sudo systemctl restart $SERVICE_NAME${NC}"
            echo -e "   • Statut:          ${YELLOW}sudo systemctl status $SERVICE_NAME${NC}"
            echo -e "   • Migration PM2:   ${YELLOW}./scripts/freebox-pm2-setup.sh${NC}"
            ;;
        *)
            echo -e "${CYAN}📋 Scripts de configuration:${NC}"
            echo -e "   • Setup systemd:   ${YELLOW}./scripts/freebox-setup.sh${NC}"
            echo -e "   • Setup PM2:       ${YELLOW}./scripts/freebox-setup.sh --pm2${NC}"
            ;;
    esac
    
    echo -e "   • Mise à jour:     ${YELLOW}sudo ./scripts/freebox-update.sh${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Gestion des options
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Afficher cette aide"
        echo "  --service      Afficher uniquement le statut du service"
        echo "  --system       Afficher uniquement le statut système"
        echo "  --logs         Afficher uniquement les logs récents"
        echo "  --watch        Mode surveillance (rafraîchissement automatique)"
        echo
        exit 0
        ;;
    --service)
        show_service_status
        ;;
    --system)
        show_system_status
        ;;
    --logs)
        show_recent_logs
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
    *)
        main
        ;;
esac