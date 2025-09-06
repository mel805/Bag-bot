# 🚀 Guide de Mise à Jour Freebox - Correction GitHub

## 🎯 Problème Résolu

Le problème de sauvegarde GitHub sur Freebox est maintenant **corrigé** et disponible sur GitHub !

```
❌ Avant: Sauvegarde GitHub: Erreur requête - branche 'backu'
✅ Après: Sauvegarde GitHub: Sauvegarde réussie sur branche backup-data
```

## 📥 Mise à Jour sur votre Freebox

### Étape 1 : Mise à jour du code

```bash
# Connectez-vous à votre Freebox en SSH
ssh botuser@votre-freebox-ip

# Allez dans le répertoire du bot
cd /home/botuser/bag-discord-bot

# Sauvegardez votre configuration actuelle
cp .env .env.backup

# Mettez à jour le code depuis GitHub
git pull origin main
```

### Étape 2 : Vérifier/Configurer le fichier .env

```bash
# Si vous n'avez pas de fichier .env, créez-le depuis l'exemple
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Fichier .env créé depuis .env.example"
fi

# Éditez votre configuration
nano .env
```

**Assurez-vous que ces lignes sont correctes dans votre .env :**
```env
# Configuration GitHub pour sauvegardes
GITHUB_TOKEN=votre_vrai_token_github
GITHUB_REPO=mel805/Bag-bot
GITHUB_BACKUP_BRANCH=backup-data
```

### Étape 3 : Corriger la configuration GitHub

```bash
# Exécutez le script de correction automatique
sudo ./scripts/fix-branch-name.sh

# Ou si vous préférez le script complet
sudo ./scripts/fix-github-freebox.sh
```

### Étape 4 : Redémarrer le bot

```bash
# Avec systemd
sudo systemctl restart bag-discord-bot

# Ou avec PM2
sudo -u botuser pm2 restart bagbot

# Vérifiez le statut
sudo systemctl status bag-discord-bot
# ou
sudo -u botuser pm2 status
```

## ✅ Vérification du Succès

Après redémarrage, votre bot Discord devrait maintenant afficher :
- ✅ **Sauvegarde Locale** : Fichier créé
- ✅ **Sauvegarde GitHub** : Sauvegarde réussie sur branche backup-data

## 🔧 Si vous avez des problèmes

### 1. Token GitHub manquant
```bash
# Obtenez un token sur https://github.com/settings/tokens
# Permissions requises: repo, contents:write
# Ajoutez-le dans votre .env
```

### 2. Vérifier les logs
```bash
# Logs systemd
sudo journalctl -u bag-discord-bot -f

# Logs PM2
sudo -u botuser pm2 logs bagbot
```

### 3. Test manuel
```bash
# Testez la configuration GitHub
node fix-github-config.js

# Testez une sauvegarde
cd /home/botuser/bag-discord-bot
sudo -u botuser node -e "
const GitHubBackup = require('./src/storage/githubBackup.js');
require('dotenv').config();
const github = new GitHubBackup();
github.backup({test: true}).then(console.log).catch(console.error);
"
```

## 📊 Nouveaux Fichiers Ajoutés

Après la mise à jour, vous aurez ces nouveaux fichiers :
- ✅ `.env.example` - Exemple de configuration
- ✅ `scripts/fix-github-freebox.sh` - Script de correction complet
- ✅ `scripts/fix-branch-name.sh` - Script de correction de branche
- ✅ `fix-github-config.js` - Test et correction Node.js
- ✅ `FREEBOX_GITHUB_FIX.md` - Guide de dépannage
- ✅ `FREEBOX_DEPLOY_INSTRUCTIONS.md` - Instructions détaillées

## 🎉 Résultat Final

Une fois la mise à jour terminée :
- ✅ Votre bot fonctionne sur Freebox comme sur Render
- ✅ Les sauvegardes GitHub fonctionnent correctement
- ✅ La branche `backup-data` est utilisée (plus d'erreur `backu`)
- ✅ Configuration automatisée avec scripts

## 📞 Support

Si vous avez encore des problèmes après la mise à jour :
1. Vérifiez que `GITHUB_BACKUP_BRANCH=backup-data` dans votre .env
2. Assurez-vous que votre token GitHub a les bonnes permissions
3. Consultez les logs détaillés du bot
4. Utilisez les scripts de diagnostic fournis

---

*Mise à jour créée pour résoudre le problème GitHub sur Freebox - Décembre 2024*