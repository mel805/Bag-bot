#!/bin/bash

# 💾 Script de Sauvegarde - BAG Discord Bot sur Freebox Delta
# Ce script sauvegarde les données importantes du bot

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
BACKUP_DIR="$BOT_DIR/backups"
SERVICE_NAME="bag-discord-bot"
MAX_BACKUPS=10

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

# Vérification des prérequis
check_prerequisites() {
    log "Vérification des prérequis..."
    
    # Vérifier que le répertoire du bot existe
    if [[ ! -d "$BOT_DIR" ]]; then
        error "Répertoire du bot non trouvé: $BOT_DIR"
        exit 1
    fi
    
    # Créer le répertoire de sauvegarde s'il n'existe pas
    if [[ ! -d "$BACKUP_DIR" ]]; then
        sudo -u "$BOT_USER" mkdir -p "$BACKUP_DIR"
        success "Répertoire de sauvegarde créé: $BACKUP_DIR"
    fi
    
    success "Prérequis vérifiés"
}

# Création du nom de sauvegarde
generate_backup_name() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_type="${1:-full}"
    echo "backup_${backup_type}_${timestamp}"
}

# Sauvegarde complète
create_full_backup() {
    local backup_name=$(generate_backup_name "full")
    local backup_path="$BACKUP_DIR/$backup_name"
    
    log "Création d'une sauvegarde complète: $backup_name"
    
    # Créer le répertoire de sauvegarde
    sudo -u "$BOT_USER" mkdir -p "$backup_path"
    
    # Liste des éléments à sauvegarder
    local items_to_backup=(
        "src:Code source"
        "data:Données JSON"
        "logs:Fichiers de log"
        ".env:Variables d'environnement"
        "package.json:Configuration npm"
        "package-lock.json:Dépendances verrouillées"
    )
    
    local total_size=0
    
    for item_info in "${items_to_backup[@]}"; do
        IFS=':' read -r item_name description <<< "$item_info"
        local source_path="$BOT_DIR/$item_name"
        
        if [[ -e "$source_path" ]]; then
            log "Sauvegarde de $description..."
            
            if [[ -f "$source_path" ]]; then
                sudo -u "$BOT_USER" cp "$source_path" "$backup_path/"
                local size=$(stat -c%s "$source_path" 2>/dev/null || echo "0")
                total_size=$((total_size + size))
                success "$description sauvegardé ($(format_size $size))"
            elif [[ -d "$source_path" ]]; then
                sudo -u "$BOT_USER" cp -r "$source_path" "$backup_path/"
                local size=$(du -sb "$source_path" 2>/dev/null | cut -f1 || echo "0")
                total_size=$((total_size + size))
                success "$description sauvegardé ($(format_size $size))"
            fi
        else
            warning "$description non trouvé: $source_path"
        fi
    done
    
    # Informations sur la sauvegarde
    local info_file="$backup_path/backup_info.txt"
    cat > "$info_file" << EOF
Sauvegarde créée le: $(date)
Hostname: $(hostname)
Service actif: $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inconnu")
Version Node.js: $(node --version 2>/dev/null || echo "inconnue")
Taille totale: $(format_size $total_size)
Type: Sauvegarde complète
EOF
    
    sudo -u "$BOT_USER" chown "$BOT_USER:$BOT_USER" "$info_file"
    
    # Créer une archive compressée
    log "Compression de la sauvegarde..."
    cd "$BACKUP_DIR"
    sudo -u "$BOT_USER" tar -czf "${backup_name}.tar.gz" "$backup_name"
    sudo -u "$BOT_USER" rm -rf "$backup_name"
    
    local archive_size=$(stat -c%s "${backup_name}.tar.gz" 2>/dev/null || echo "0")
    success "Sauvegarde complète terminée: ${backup_name}.tar.gz ($(format_size $archive_size))"
    
    echo "$backup_path.tar.gz"
}

# Sauvegarde rapide (données uniquement)
create_quick_backup() {
    local backup_name=$(generate_backup_name "quick")
    local backup_path="$BACKUP_DIR/$backup_name"
    
    log "Création d'une sauvegarde rapide: $backup_name"
    
    # Créer le répertoire de sauvegarde
    sudo -u "$BOT_USER" mkdir -p "$backup_path"
    
    # Sauvegarder uniquement les données essentielles
    local items_to_backup=(
        "data:Données JSON"
        ".env:Variables d'environnement"
    )
    
    local total_size=0
    
    for item_info in "${items_to_backup[@]}"; do
        IFS=':' read -r item_name description <<< "$item_info"
        local source_path="$BOT_DIR/$item_name"
        
        if [[ -e "$source_path" ]]; then
            if [[ -f "$source_path" ]]; then
                sudo -u "$BOT_USER" cp "$source_path" "$backup_path/"
                local size=$(stat -c%s "$source_path" 2>/dev/null || echo "0")
                total_size=$((total_size + size))
            elif [[ -d "$source_path" ]]; then
                sudo -u "$BOT_USER" cp -r "$source_path" "$backup_path/"
                local size=$(du -sb "$source_path" 2>/dev/null | cut -f1 || echo "0")
                total_size=$((total_size + size))
            fi
            success "$description sauvegardé"
        fi
    done
    
    # Informations sur la sauvegarde
    local info_file="$backup_path/backup_info.txt"
    cat > "$info_file" << EOF
Sauvegarde créée le: $(date)
Hostname: $(hostname)
Type: Sauvegarde rapide (données uniquement)
Taille totale: $(format_size $total_size)
EOF
    
    sudo -u "$BOT_USER" chown "$BOT_USER:$BOT_USER" "$info_file"
    
    # Créer une archive compressée
    cd "$BACKUP_DIR"
    sudo -u "$BOT_USER" tar -czf "${backup_name}.tar.gz" "$backup_name"
    sudo -u "$BOT_USER" rm -rf "$backup_name"
    
    local archive_size=$(stat -c%s "${backup_name}.tar.gz" 2>/dev/null || echo "0")
    success "Sauvegarde rapide terminée: ${backup_name}.tar.gz ($(format_size $archive_size))"
    
    echo "$backup_path.tar.gz"
}

# Nettoyage des anciennes sauvegardes
cleanup_old_backups() {
    log "Nettoyage des anciennes sauvegardes (garder les $MAX_BACKUPS plus récentes)..."
    
    cd "$BACKUP_DIR"
    
    # Compter les sauvegardes existantes
    local backup_count=$(sudo -u "$BOT_USER" ls -1 backup_*.tar.gz 2>/dev/null | wc -l || echo "0")
    
    if [[ $backup_count -gt $MAX_BACKUPS ]]; then
        local to_delete=$((backup_count - MAX_BACKUPS))
        
        # Supprimer les plus anciennes
        sudo -u "$BOT_USER" ls -1t backup_*.tar.gz | tail -n $to_delete | while read backup; do
            log "Suppression de l'ancienne sauvegarde: $backup"
            sudo -u "$BOT_USER" rm -f "$backup"
        done
        
        success "$to_delete anciennes sauvegardes supprimées"
    else
        success "Aucun nettoyage nécessaire ($backup_count/$MAX_BACKUPS sauvegardes)"
    fi
}

# Lister les sauvegardes existantes
list_backups() {
    log "Liste des sauvegardes disponibles:"
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        warning "Aucun répertoire de sauvegarde trouvé"
        return
    fi
    
    cd "$BACKUP_DIR"
    local backups=($(sudo -u "$BOT_USER" ls -1t backup_*.tar.gz 2>/dev/null || true))
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        warning "Aucune sauvegarde trouvée"
        return
    fi
    
    echo
    printf "%-30s %-15s %-20s\n" "NOM" "TAILLE" "DATE"
    echo "────────────────────────────────────────────────────────────────────"
    
    for backup in "${backups[@]}"; do
        local size=$(stat -c%s "$backup" 2>/dev/null || echo "0")
        local date=$(stat -c%y "$backup" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1 || echo "inconnue")
        printf "%-30s %-15s %-20s\n" "$backup" "$(format_size $size)" "$date"
    done
    
    echo
    info "Total: ${#backups[@]} sauvegardes"
}

# Restauration d'une sauvegarde
restore_backup() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        error "Nom de sauvegarde requis"
        list_backups
        return 1
    fi
    
    local backup_path="$BACKUP_DIR/$backup_file"
    
    if [[ ! -f "$backup_path" ]]; then
        error "Sauvegarde non trouvée: $backup_path"
        list_backups
        return 1
    fi
    
    warning "⚠️  ATTENTION: Cette opération va remplacer les données actuelles!"
    echo "Sauvegarde à restaurer: $backup_file"
    echo
    read -p "Êtes-vous sûr de vouloir continuer? [y/N] " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Restauration annulée"
        return 0
    fi
    
    log "Restauration de la sauvegarde: $backup_file"
    
    # Arrêter le service
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "Arrêt du service..."
        systemctl stop "$SERVICE_NAME"
    fi
    
    # Créer une sauvegarde de sécurité avant restauration
    log "Création d'une sauvegarde de sécurité avant restauration..."
    local safety_backup=$(create_quick_backup)
    success "Sauvegarde de sécurité créée: $(basename $safety_backup)"
    
    # Extraire la sauvegarde
    log "Extraction de la sauvegarde..."
    cd "$BACKUP_DIR"
    local temp_dir="restore_temp_$(date +%s)"
    sudo -u "$BOT_USER" mkdir "$temp_dir"
    sudo -u "$BOT_USER" tar -xzf "$backup_file" -C "$temp_dir"
    
    # Restaurer les fichiers
    local extracted_dir=$(sudo -u "$BOT_USER" ls "$temp_dir" | head -n1)
    if [[ -n "$extracted_dir" ]]; then
        log "Restauration des fichiers..."
        sudo -u "$BOT_USER" cp -r "$temp_dir/$extracted_dir/"* "$BOT_DIR/"
        success "Fichiers restaurés"
    else
        error "Impossible de trouver les fichiers extraits"
        return 1
    fi
    
    # Nettoyer
    sudo -u "$BOT_USER" rm -rf "$temp_dir"
    
    # Redémarrer le service
    log "Redémarrage du service..."
    systemctl start "$SERVICE_NAME"
    
    success "Restauration terminée avec succès!"
    warning "Sauvegarde de sécurité disponible: $(basename $safety_backup)"
}

# Vérification de l'intégrité des sauvegardes
verify_backups() {
    log "Vérification de l'intégrité des sauvegardes..."
    
    cd "$BACKUP_DIR"
    local backups=($(sudo -u "$BOT_USER" ls -1 backup_*.tar.gz 2>/dev/null || true))
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        warning "Aucune sauvegarde à vérifier"
        return
    fi
    
    local corrupted=0
    
    for backup in "${backups[@]}"; do
        if sudo -u "$BOT_USER" tar -tzf "$backup" >/dev/null 2>&1; then
            success "$backup: OK"
        else
            error "$backup: CORROMPU"
            corrupted=$((corrupted + 1))
        fi
    done
    
    if [[ $corrupted -eq 0 ]]; then
        success "Toutes les sauvegardes sont intègres"
    else
        warning "$corrupted sauvegarde(s) corrompue(s) détectée(s)"
    fi
}

# Fonction principale
main() {
    echo "💾 Sauvegarde du BAG Discord Bot sur Freebox Delta"
    echo "================================================="
    echo
    
    case "${1:-full}" in
        full)
            check_prerequisites
            create_full_backup
            cleanup_old_backups
            ;;
        quick)
            check_prerequisites
            create_quick_backup
            cleanup_old_backups
            ;;
        list)
            list_backups
            ;;
        restore)
            restore_backup "$2"
            ;;
        verify)
            verify_backups
            ;;
        *)
            echo "Usage: $0 [command] [options]"
            echo
            echo "Commandes:"
            echo "  full          Sauvegarde complète (défaut)"
            echo "  quick         Sauvegarde rapide (données uniquement)"
            echo "  list          Lister les sauvegardes disponibles"
            echo "  restore FILE  Restaurer une sauvegarde"
            echo "  verify        Vérifier l'intégrité des sauvegardes"
            echo
            echo "Exemples:"
            echo "  $0                                    # Sauvegarde complète"
            echo "  $0 quick                             # Sauvegarde rapide"
            echo "  $0 list                              # Lister les sauvegardes"
            echo "  $0 restore backup_full_20241208.tar.gz  # Restaurer"
            echo "  $0 verify                            # Vérifier l'intégrité"
            echo
            exit 0
            ;;
    esac
}

# Vérification des privilèges pour les opérations qui le nécessitent
case "${1:-full}" in
    restore)
        if [[ $EUID -ne 0 ]]; then
            error "La restauration nécessite les privilèges root (sudo)"
            exit 1
        fi
        ;;
esac

# Exécution du script principal
main "$@"