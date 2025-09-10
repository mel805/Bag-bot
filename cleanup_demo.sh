#!/bin/bash

# Script de nettoyage des fichiers de démonstration

echo "🧹 Nettoyage des fichiers de démonstration..."

# Supprimer les anciens fichiers de sauvegarde au mauvais format
rm -f data/backups/config-*.json
echo "✅ Anciens fichiers config supprimés"

# Nettoyer les fichiers temporaires
rm -f *.backup-*
rm -f fix_ping_issue.js
rm -f setup_cron.sh
echo "✅ Fichiers temporaires supprimés"

# Afficher le statut final
echo ""
echo "📊 État final des sauvegardes:"
ls -la data/backups/ | grep -E "(bot-config|user-data)" | wc -l
echo "sauvegardes valides trouvées"

echo ""
echo "✅ Nettoyage terminé!"
echo ""
echo "📋 Système de sauvegarde opérationnel:"
echo "   • Rétention: 7 jours (168 sauvegardes)"
echo "   • Sauvegarde automatique: chaque heure"
echo "   • Sélecteur paginé: node restore_with_selector.js"
echo "   • Statut détaillé: node hourly_backup_7days.js --status"