#!/bin/bash

# Script de monitoring des performances post-déploiement
# Usage: ./monitor-performance.sh [--duration=60]

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    local status=$1
    local message=$2
    case $status in
        "success") echo -e "${GREEN}✅ $message${NC}" ;;
        "warning") echo -e "${YELLOW}⚠️  $message${NC}" ;;
        "error") echo -e "${RED}❌ $message${NC}" ;;
        "info") echo -e "${BLUE}ℹ️  $message${NC}" ;;
    esac
}

# Durée de monitoring (défaut: 60 secondes)
DURATION=60
if [[ $1 == --duration=* ]]; then
    DURATION=${1#*=}
fi

echo "📊 Monitoring des performances - Durée: ${DURATION}s"
echo "=================================================="

# Fonction pour analyser les logs
analyze_logs() {
    local logfile=$1
    local duration=$2
    
    if [ ! -f "$logfile" ]; then
        print_status "warning" "Fichier de log non trouvé: $logfile"
        return
    fi
    
    print_status "info" "Analyse des logs: $logfile"
    
    # Analyser les logs des dernières minutes
    local since_time=$(date -d "$duration seconds ago" '+%Y-%m-%d %H:%M:%S')
    
    # Compter les actions tromper/orgie
    local tromper_count=$(grep -c "\[Tromper\]" "$logfile" 2>/dev/null || echo 0)
    local orgie_count=$(grep -c "\[Orgie\]" "$logfile" 2>/dev/null || echo 0)
    local tromper_success=$(grep -c "\[Tromper\].*completed successfully" "$logfile" 2>/dev/null || echo 0)
    local orgie_success=$(grep -c "\[Orgie\].*completed successfully" "$logfile" 2>/dev/null || echo 0)
    
    # Compter les timeouts et erreurs
    local timeouts=$(grep -c "timeout\|Timeout" "$logfile" 2>/dev/null || echo 0)
    local emergency_fallbacks=$(grep -c "emergency fallback" "$logfile" 2>/dev/null || echo 0)
    local defer_errors=$(grep -c "defer.*failed\|Failed.*defer" "$logfile" 2>/dev/null || echo 0)
    
    echo ""
    echo "📈 Statistiques des actions:"
    echo "   Tromper: $tromper_count exécutions, $tromper_success succès"
    echo "   Orgie: $orgie_count exécutions, $orgie_success succès"
    
    echo ""
    echo "🚨 Indicateurs d'erreur:"
    echo "   Timeouts: $timeouts"
    echo "   Fallbacks d'urgence: $emergency_fallbacks"
    echo "   Erreurs defer: $defer_errors"
    
    # Calculer le taux de succès
    local total_actions=$((tromper_count + orgie_count))
    local total_success=$((tromper_success + orgie_success))
    
    if [ $total_actions -gt 0 ]; then
        local success_rate=$(( (total_success * 100) / total_actions ))
        echo ""
        echo "🎯 Taux de succès global: $success_rate% ($total_success/$total_actions)"
        
        if [ $success_rate -ge 90 ]; then
            print_status "success" "Excellent taux de succès !"
        elif [ $success_rate -ge 70 ]; then
            print_status "warning" "Taux de succès acceptable"
        else
            print_status "error" "Taux de succès faible - investigation nécessaire"
        fi
    else
        print_status "info" "Aucune action tromper/orgie détectée dans les logs"
    fi
}

# Fonction pour surveiller les performances en temps réel
monitor_realtime() {
    local duration=$1
    
    print_status "info" "Surveillance en temps réel pendant ${duration}s..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    
    local tromper_count=0
    local orgie_count=0
    local error_count=0
    
    while [ $(date +%s) -lt $end_time ]; do
        # Chercher les nouveaux logs (dernières 5 secondes)
        local recent_logs=$(find . -name "*.log" -newermt "5 seconds ago" 2>/dev/null)
        
        if [ -n "$recent_logs" ]; then
            for logfile in $recent_logs; do
                # Compter les nouvelles actions
                local new_tromper=$(tail -n 50 "$logfile" 2>/dev/null | grep -c "\[Tromper\]" || echo 0)
                local new_orgie=$(tail -n 50 "$logfile" 2>/dev/null | grep -c "\[Orgie\]" || echo 0)
                local new_errors=$(tail -n 50 "$logfile" 2>/dev/null | grep -c "error\|Error\|ERROR" || echo 0)
                
                tromper_count=$((tromper_count + new_tromper))
                orgie_count=$((orgie_count + new_orgie))
                error_count=$((error_count + new_errors))
            done
        fi
        
        # Affichage en temps réel
        local elapsed=$(($(date +%s) - start_time))
        local remaining=$((duration - elapsed))
        
        printf "\r⏱️  Temps restant: ${remaining}s | Actions: T:$tromper_count O:$orgie_count | Erreurs: $error_count"
        
        sleep 2
    done
    
    echo ""
    print_status "success" "Surveillance terminée"
}

# Fonction pour générer un rapport de santé
health_check() {
    print_status "info" "Vérification de l'état du système..."
    
    # Vérifier si le bot est en cours d'exécution
    if pgrep -f "node.*bot.js" > /dev/null; then
        print_status "success" "Bot en cours d'exécution"
        
        # Obtenir l'utilisation CPU et mémoire
        local bot_pid=$(pgrep -f "node.*bot.js" | head -1)
        local cpu_usage=$(ps -p $bot_pid -o %cpu --no-headers 2>/dev/null || echo "N/A")
        local mem_usage=$(ps -p $bot_pid -o %mem --no-headers 2>/dev/null || echo "N/A")
        
        echo "   CPU: ${cpu_usage}%"
        echo "   Mémoire: ${mem_usage}%"
    else
        print_status "error" "Bot non détecté en cours d'exécution"
    fi
    
    # Vérifier l'espace disque
    local disk_usage=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ $disk_usage -lt 80 ]; then
        print_status "success" "Espace disque OK (${disk_usage}% utilisé)"
    else
        print_status "warning" "Espace disque faible (${disk_usage}% utilisé)"
    fi
    
    # Vérifier la charge système
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    print_status "info" "Charge système: $load_avg"
}

# Fonction principale
main() {
    echo ""
    health_check
    echo ""
    
    # Chercher les fichiers de log
    local logfiles=(
        "bot.log"
        "logs/bot.log" 
        "/var/log/bot.log"
        "$(find . -name "*.log" -type f 2>/dev/null | head -1)"
    )
    
    local found_log=""
    for logfile in "${logfiles[@]}"; do
        if [ -f "$logfile" ]; then
            found_log="$logfile"
            break
        fi
    done
    
    if [ -n "$found_log" ]; then
        analyze_logs "$found_log" "$DURATION"
    else
        print_status "warning" "Aucun fichier de log trouvé"
        print_status "info" "Vérifiez les emplacements: bot.log, logs/bot.log, /var/log/bot.log"
    fi
    
    echo ""
    print_status "info" "Surveillance en temps réel activée"
    monitor_realtime "$DURATION"
    
    echo ""
    echo "📋 Recommandations post-monitoring:"
    echo "=================================="
    echo ""
    echo "1. Si taux de succès < 90%:"
    echo "   - Vérifiez les logs d'erreur détaillés"
    echo "   - Augmentez les timeouts si nécessaire"
    echo ""
    echo "2. Si nombreux fallbacks d'urgence:"
    echo "   - Vérifiez la connectivité réseau"
    echo "   - Analysez la charge du serveur Discord"
    echo ""
    echo "3. Si erreurs de defer persistantes:"
    echo "   - Redémarrez le bot"
    echo "   - Vérifiez les permissions Discord"
    echo ""
    
    print_status "success" "Monitoring terminé - consultez les résultats ci-dessus"
}

# Exécution
main