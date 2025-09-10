#!/bin/bash

# Script de configuration du cron pour les sauvegardes horaires

BOT_DIR="/home/bagbot/Bag-bot"
BACKUP_SCRIPT="$BOT_DIR/hourly_backup.js"
LOG_DIR="$BOT_DIR/logs"

# Créer le dossier de logs s'il n'existe pas
mkdir -p "$LOG_DIR"

# Créer une entrée cron pour les sauvegardes horaires
CRON_ENTRY="0 * * * * cd $BOT_DIR && /usr/bin/node hourly_backup.js >> $LOG_DIR/backup.log 2>&1"

echo "🔄 Configuration du système de sauvegarde horaire..."

# Vérifier si l'entrée cron existe déjà
if crontab -l 2>/dev/null | grep -q "hourly_backup.js"; then
    echo "⚠️ Entrée cron existante détectée. Suppression..."
    crontab -l 2>/dev/null | grep -v "hourly_backup.js" | crontab -
fi

# Ajouter la nouvelle entrée cron
echo "📅 Ajout de la nouvelle entrée cron..."
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

# Vérifier que l'entrée a été ajoutée
echo "✅ Vérification de l'installation..."
if crontab -l 2>/dev/null | grep -q "hourly_backup.js"; then
    echo "✅ Sauvegarde horaire configurée avec succès!"
    echo "📋 Entrée cron: $CRON_ENTRY"
    echo "📝 Logs: $LOG_DIR/backup.log"
    
    # Afficher les tâches cron actuelles
    echo ""
    echo "📅 Tâches cron actuelles:"
    crontab -l
    
    # Créer un test de sauvegarde
    echo ""
    echo "🧪 Test de sauvegarde..."
    cd "$BOT_DIR" && /usr/bin/node hourly_backup.js --status
    
else
    echo "❌ Erreur lors de la configuration du cron"
    exit 1
fi

echo ""
echo "🎉 Configuration terminée!"
echo ""
echo "ℹ️ Informations importantes:"
echo "   • Les sauvegardes s'exécutent chaque heure (minute 0)"
echo "   • 2 fichiers créés par sauvegarde (config + données users)"
echo "   • Synchronisation automatique vers /var/data/bot-backups"
echo "   • Rétention: 48h localement, 7 jours sur Freebox"
echo "   • Logs disponibles dans $LOG_DIR/backup.log"
echo ""
echo "📋 Commandes utiles:"
echo "   node hourly_backup.js          # Sauvegarde manuelle"
echo "   node hourly_backup.js --status # Statut des sauvegardes"
echo "   tail -f $LOG_DIR/backup.log    # Suivre les logs en temps réel"