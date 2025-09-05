#!/bin/bash

echo "🔧 Configuration de PM2 pour le démarrage automatique..."

# Générer et installer le script de démarrage PM2
pm2 startup

echo ""
echo "📋 Instructions:"
echo "1. Copiez et exécutez la commande sudo affichée ci-dessus"
echo "2. Ensuite, lancez: pm2 save"
echo "3. Votre bot redémarrera automatiquement après un reboot système"

echo ""
echo "🚀 Pour sauvegarder la configuration actuelle:"
echo "   pm2 save"

echo ""
echo "🗑️ Pour désactiver le démarrage automatique:"
echo "   pm2 unstartup"