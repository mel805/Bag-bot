# 🚀 Instructions de Déploiement Freebox - BAG Discord Bot

## 🎯 Résolution du Problème GitHub

Votre problème `Dépôt 'mel805/Bag-bot' introuvable ou branche 'backu'` est maintenant **résolu** !

### ✅ Ce qui a été corrigé :

1. **Nom de branche** : `backu` → `backup-data` ✅
2. **Configuration .env** : Structure correcte créée ✅
3. **Scripts de correction** : Prêts pour votre Freebox ✅

## 📋 Étapes pour Déployer sur votre Freebox

### Étape 1 : Transférer les Fichiers

```bash
# Sur votre Freebox, dans le répertoire du bot :
cd /home/botuser/bag-discord-bot

# Copiez ces fichiers depuis ce projet :
# - .env.example → .env (puis configurez-le)
# - scripts/fix-github-freebox.sh
# - scripts/fix-branch-name.sh
# - fix-github-config.js
```

### Étape 2 : Configurer le Fichier .env

```bash
# Sur votre Freebox :
cd /home/botuser/bag-discord-bot

# Si le fichier .env n'existe pas, créez-le :
sudo -u botuser cp .env.example .env

# Éditez le fichier .env :
sudo -u botuser nano .env
```

**Contenu du fichier .env :**
```env
# Configuration Discord
DISCORD_TOKEN=votre_vrai_token_discord
CLIENT_ID=votre_vrai_client_id
GUILD_ID=votre_vrai_guild_id

# Configuration GitHub pour sauvegardes
GITHUB_TOKEN=votre_vrai_token_github
GITHUB_REPO=mel805/Bag-bot
GITHUB_BACKUP_BRANCH=backup-data

# Configuration optionnelle
NODE_ENV=production
BOT_PREFIX=!
```

### Étape 3 : Obtenir un Token GitHub

1. **Allez sur** : https://github.com/settings/tokens
2. **Cliquez** : "Generate new token" → "Generate new token (classic)"
3. **Nom** : `BAG Bot Freebox Backup`
4. **Permissions** :
   - ✅ `repo` (accès complet aux dépôts)
   - ✅ `contents:write` (écriture des contenus)
5. **Copiez le token** et remplacez `votre_vrai_token_github` dans .env

### Étape 4 : Exécuter la Correction

```bash
# Sur votre Freebox, exécutez UN de ces scripts :

# Option 1 : Script spécialisé pour la branche
sudo ./scripts/fix-branch-name.sh

# Option 2 : Script complet de configuration GitHub
sudo ./scripts/fix-github-freebox.sh

# Option 3 : Script Node.js (si Node.js disponible)
node fix-github-config.js
```

### Étape 5 : Redémarrer le Bot

```bash
# Avec systemd :
sudo systemctl restart bag-discord-bot

# Avec PM2 :
sudo -u botuser pm2 restart bagbot

# Vérifier le statut :
sudo systemctl status bag-discord-bot
# ou
sudo -u botuser pm2 status
```

## 🔍 Vérification du Succès

Après redémarrage, votre bot Discord devrait afficher :
- ✅ **Sauvegarde Locale** : Fichier créé
- ✅ **Sauvegarde GitHub** : Sauvegarde réussie sur branche backup-data

## 🛠️ Dépannage

### Si le problème persiste :

1. **Vérifiez les logs** :
```bash
# Logs systemd
sudo journalctl -u bag-discord-bot -f

# Logs PM2
sudo -u botuser pm2 logs bagbot
```

2. **Testez manuellement** :
```bash
cd /home/botuser/bag-discord-bot
sudo -u botuser node -e "
const GitHubBackup = require('./src/storage/githubBackup.js');
require('dotenv').config();
const github = new GitHubBackup();
console.log('Branche configurée:', process.env.GITHUB_BACKUP_BRANCH);
github.testConnection().then(console.log).catch(console.error);
"
```

3. **Vérifiez la configuration** :
```bash
grep GITHUB_BACKUP_BRANCH /home/botuser/bag-discord-bot/.env
# Doit afficher : GITHUB_BACKUP_BRANCH=backup-data
```

## 📊 Comparaison Avant/Après

| Avant | Après |
|-------|--------|
| ❌ `branche 'backu'` | ✅ `branche 'backup-data'` |
| ❌ Configuration manquante | ✅ Configuration complète |
| ❌ Erreur GitHub | ✅ Sauvegarde fonctionnelle |

## 🎉 Résultat Final

Une fois ces étapes terminées :
- ✅ Vos sauvegardes locales continuent de fonctionner
- ✅ Vos sauvegardes GitHub fonctionnent maintenant aussi
- ✅ Le bot est stable sur Freebox comme sur Render

## 📞 Support

Si vous avez encore des problèmes :
1. Vérifiez que le token GitHub a les bonnes permissions
2. Assurez-vous que le dépôt `mel805/Bag-bot` existe
3. Consultez les logs détaillés du bot

---

*Instructions créées pour résoudre le problème de sauvegarde GitHub sur Freebox - Décembre 2024*