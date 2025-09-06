#!/bin/bash

# 🚀 Script de Déploiement Freebox - BAG Discord Bot
# Ce script prépare tous les fichiers nécessaires pour corriger le problème GitHub

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Fonctions d'affichage
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${PURPLE}ℹ️  $1${NC}"; }

echo "🚀 Préparation du Déploiement Freebox - BAG Discord Bot"
echo "======================================================"
echo

log "Vérification des fichiers de correction..."

# Liste des fichiers nécessaires
files_to_check=(
    "scripts/fix-github-freebox.sh:Script de correction GitHub complet"
    "scripts/fix-branch-name.sh:Script de correction de branche spécialisé"
    "fix-github-config.js:Script Node.js de test et correction"
    ".env.example:Exemple de configuration"
    "FREEBOX_DEPLOY_INSTRUCTIONS.md:Instructions de déploiement"
    "FREEBOX_GITHUB_FIX.md:Guide de dépannage GitHub"
)

all_files_ok=true

for file_info in "${files_to_check[@]}"; do
    IFS=':' read -r file_path description <<< "$file_info"
    
    if [[ -f "$file_path" ]]; then
        success "$description trouvé"
    else
        error "$description manquant: $file_path"
        all_files_ok=false
    fi
done

if [[ "$all_files_ok" != true ]]; then
    error "Certains fichiers sont manquants"
    exit 1
fi

echo
log "Création du package de déploiement..."

# Créer un répertoire de déploiement
DEPLOY_DIR="freebox-github-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DEPLOY_DIR"

# Copier les fichiers nécessaires
cp scripts/fix-github-freebox.sh "$DEPLOY_DIR/"
cp scripts/fix-branch-name.sh "$DEPLOY_DIR/"
cp fix-github-config.js "$DEPLOY_DIR/"
cp .env.example "$DEPLOY_DIR/"
cp FREEBOX_DEPLOY_INSTRUCTIONS.md "$DEPLOY_DIR/"
cp FREEBOX_GITHUB_FIX.md "$DEPLOY_DIR/"

# Créer un script d'installation automatique
cat > "$DEPLOY_DIR/install.sh" << 'EOF'
#!/bin/bash

# 📦 Installation automatique de la correction GitHub - BAG Discord Bot

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

BOT_DIR="/home/botuser/bag-discord-bot"

echo "📦 Installation de la Correction GitHub"
echo "======================================"
echo

# Vérifier que nous sommes sur la Freebox
if [[ ! -d "$BOT_DIR" ]]; then
    error "Répertoire du bot non trouvé: $BOT_DIR"
    echo "Ce script doit être exécuté sur votre Freebox"
    exit 1
fi

log "Copie des scripts de correction..."

# Créer le répertoire scripts s'il n'existe pas
sudo -u botuser mkdir -p "$BOT_DIR/scripts"

# Copier les scripts
sudo -u botuser cp fix-github-freebox.sh "$BOT_DIR/scripts/"
sudo -u botuser cp fix-branch-name.sh "$BOT_DIR/scripts/"
sudo -u botuser cp fix-github-config.js "$BOT_DIR/"

# Rendre les scripts exécutables
sudo -u botuser chmod +x "$BOT_DIR/scripts/fix-github-freebox.sh"
sudo -u botuser chmod +x "$BOT_DIR/scripts/fix-branch-name.sh"
sudo -u botuser chmod +x "$BOT_DIR/fix-github-config.js"

success "Scripts installés"

# Copier .env.example si .env n'existe pas
if [[ ! -f "$BOT_DIR/.env" ]]; then
    log "Création du fichier .env depuis .env.example..."
    sudo -u botuser cp .env.example "$BOT_DIR/.env"
    success "Fichier .env créé"
    warning "N'oubliez pas de configurer vos tokens dans $BOT_DIR/.env"
else
    success "Fichier .env existant conservé"
fi

echo
success "🎉 Installation terminée !"
echo
echo "📋 Prochaines étapes :"
echo "   1. Configurez vos tokens dans $BOT_DIR/.env"
echo "   2. Exécutez: sudo $BOT_DIR/scripts/fix-branch-name.sh"
echo "   3. Redémarrez votre bot"
echo
echo "📖 Consultez les guides :"
echo "   • FREEBOX_DEPLOY_INSTRUCTIONS.md"
echo "   • FREEBOX_GITHUB_FIX.md"

EOF

chmod +x "$DEPLOY_DIR/install.sh"

# Créer un README pour le package
cat > "$DEPLOY_DIR/README.md" << 'EOF'
# 🔧 Package de Correction GitHub - BAG Discord Bot

## 🎯 Objectif

Ce package corrige le problème de sauvegarde GitHub sur Freebox :
```
❌ Sauvegarde GitHub: Erreur requête
GitHub: Dépôt 'mel805/Bag-bot' introuvable ou branche 'backu'
```

## 📦 Contenu du Package

- `install.sh` - Script d'installation automatique
- `fix-github-freebox.sh` - Correction complète GitHub
- `fix-branch-name.sh` - Correction spécialisée branche
- `fix-github-config.js` - Test et correction Node.js
- `.env.example` - Exemple de configuration
- `FREEBOX_DEPLOY_INSTRUCTIONS.md` - Instructions détaillées
- `FREEBOX_GITHUB_FIX.md` - Guide de dépannage

## 🚀 Installation Rapide

```bash
# 1. Transférez ce package sur votre Freebox
# 2. Exécutez l'installation :
sudo ./install.sh

# 3. Configurez vos tokens :
nano /home/botuser/bag-discord-bot/.env

# 4. Corrigez le problème :
sudo /home/botuser/bag-discord-bot/scripts/fix-branch-name.sh

# 5. Redémarrez le bot :
sudo systemctl restart bag-discord-bot
```

## ✅ Résultat Attendu

Après correction, votre bot affichera :
- ✅ Sauvegarde Locale : Fichier créé
- ✅ Sauvegarde GitHub : Sauvegarde réussie sur branche backup-data

---

*Package créé pour résoudre le problème GitHub sur Freebox*
EOF

# Créer une archive
log "Création de l'archive..."
tar -czf "${DEPLOY_DIR}.tar.gz" "$DEPLOY_DIR"

success "Package créé: ${DEPLOY_DIR}.tar.gz"

# Nettoyer
rm -rf "$DEPLOY_DIR"

echo
echo "🎉 DÉPLOIEMENT FREEBOX PRÉPARÉ"
echo "=============================="
echo
info "Package créé : ${DEPLOY_DIR}.tar.gz"
echo
echo "📋 Instructions pour votre Freebox :"
echo "   1. Transférez ${DEPLOY_DIR}.tar.gz sur votre Freebox"
echo "   2. Extrayez : tar -xzf ${DEPLOY_DIR}.tar.gz"
echo "   3. Exécutez : sudo ./${DEPLOY_DIR}/install.sh"
echo "   4. Suivez les instructions dans le README.md"
echo
success "Problème GitHub résolu et prêt pour déploiement !"

# Afficher le contenu de l'archive
echo
log "Contenu de l'archive :"
tar -tzf "${DEPLOY_DIR}.tar.gz" | sed 's/^/   • /'

echo