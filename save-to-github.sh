#!/bin/bash

cd ~/Bag-bot || exit 1

# Ajout de tous les changements
git add .

# Commit avec date/heure
git commit -m "Sauvegarde automatique $(date +'%Y-%m-%d %H:%M:%S')"

# Push vers la branche main
git push origin main
