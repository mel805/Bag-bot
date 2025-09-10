#!/bin/bash

# Script de monitoring des sauvegardes du bot Discord

BOT_DIR="/home/bagbot/Bag-bot"
LOG_FILE="$BOT_DIR/logs/backup.log"

echo "🔍 === MONITORING DES SAUVEGARDES BOT DISCORD ==="
echo ""

# Vérifier si le fichier de log existe
if [ ! -f "$LOG_FILE" ]; then
    echo "⚠️ Fichier de log introuvable: $LOG_FILE"
    echo "💡 Les sauvegardes n'ont peut-être pas encore commencé"
    exit 1
fi

# Afficher les informations de base
echo "📂 Fichier de log: $LOG_FILE"
echo "📅 Dernière modification: $(stat -c %y "$LOG_FILE")"
echo "📊 Taille du fichier: $(du -h "$LOG_FILE" | cut -f1)"
echo ""

# Afficher les dernières lignes du log
echo "📝 === DERNIÈRES ACTIVITÉS DE SAUVEGARDE ==="
tail -20 "$LOG_FILE"
echo ""

# Compter les sauvegardes réussies aujourd'hui
TODAY=$(date +%Y-%m-%d)
SUCCESS_COUNT=$(grep -c "SAUVEGARDE HORAIRE TERMINÉE.*$TODAY" "$LOG_FILE" 2>/dev/null || echo "0")
echo "✅ Sauvegardes réussies aujourd'hui ($TODAY): $SUCCESS_COUNT"

# Compter les erreurs aujourd'hui
ERROR_COUNT=$(grep -c -E "(❌|Erreur|Error).*$TODAY" "$LOG_FILE" 2>/dev/null || echo "0")
echo "❌ Erreurs aujourd'hui: $ERROR_COUNT"

# Afficher la dernière sauvegarde réussie
LAST_SUCCESS=$(grep "SAUVEGARDE HORAIRE TERMINÉE" "$LOG_FILE" | tail -1 | grep -o "[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}T[0-9]\{2\}:[0-9]\{2\}:[0-9]\{2\}" || echo "Inconnue")
echo "🕐 Dernière sauvegarde réussie: $LAST_SUCCESS"

echo ""
echo "📋 === STATUT DES SAUVEGARDES ==="
cd "$BOT_DIR" && node hourly_backup.js --status

echo ""
echo "📅 === TÂCHE CRON ACTIVE ==="
crontab -l | grep hourly_backup.js || echo "❌ Aucune tâche cron trouvée"

echo ""
echo "💡 === COMMANDES UTILES ==="
echo "   tail -f $LOG_FILE                    # Suivre les logs en temps réel"
echo "   cd $BOT_DIR && node hourly_backup.js           # Sauvegarde manuelle"
echo "   cd $BOT_DIR && node restore_backup.js --list   # Lister les sauvegardes"
echo "   cd $BOT_DIR && node restore_backup.js --latest # Restaurer la plus récente"