# 🔧 Guide de Correction GitHub pour Freebox - BAG Discord Bot

## 🚨 Problème Identifié

D'après l'erreur dans Discord :
```
❌ Sauvegarde GitHub: Erreur requête
GitHub: Dépôt 'mel805/Bag-bot' introuvable ou branche 'backu'
```

**Causes possibles :**
1. Variables d'environnement GitHub manquantes sur Freebox
2. Token GitHub invalide ou expiré
3. Nom de branche incorrect (`backu` au lieu de `backup-data`)
4. Permissions insuffisantes sur le dépôt

## 🛠️ Solution Rapide

### Étape 1 : Exécuter le script de correction

```bash
# Sur votre Freebox, connectez-vous en SSH et exécutez :
sudo ./scripts/fix-github-freebox.sh
```

### Étape 2 : Configuration manuelle (si nécessaire)

Si le script automatique ne fonctionne pas, voici la configuration manuelle :

#### A. Créer/Modifier le fichier .env

```bash
# Aller dans le répertoire du bot
cd /home/botuser/bag-discord-bot

# Éditer le fichier .env
sudo -u botuser nano .env
```

#### B. Ajouter les variables GitHub

```env
# Configuration GitHub pour sauvegardes
GITHUB_TOKEN="votre_token_github_ici"
GITHUB_REPO="mel805/Bag-bot"
GITHUB_BACKUP_BRANCH="backup-data"
```

#### C. Obtenir un Token GitHub

1. Allez sur https://github.com/settings/tokens
2. Cliquez sur "Generate new token" → "Generate new token (classic)"
3. Donnez un nom : `BAG Bot Freebox Backup`
4. Sélectionnez les permissions :
   - ✅ `repo` (accès complet aux dépôts)
   - ✅ `workflow` (si vous utilisez GitHub Actions)
5. Cliquez sur "Generate token"
6. **Copiez le token immédiatement** (il ne sera plus affiché)

#### D. Vérifier le dépôt GitHub

Assurez-vous que :
- Le dépôt `mel805/Bag-bot` existe
- Vous avez les permissions d'écriture
- Le dépôt n'est pas privé (ou votre token a accès aux dépôts privés)

### Étape 3 : Test de la configuration

```bash
# Test de connectivité GitHub
cd /home/botuser/bag-discord-bot
sudo -u botuser node -e "
const GitHubBackup = require('./src/storage/githubBackup.js');
require('dotenv').config();
const github = new GitHubBackup();
github.testConnection().then(r => console.log('✅ Test:', r)).catch(e => console.error('❌ Erreur:', e.message));
"
```

### Étape 4 : Redémarrer le bot

```bash
# Avec systemd
sudo systemctl restart bag-discord-bot

# Ou avec PM2
sudo -u botuser pm2 restart bagbot
```

## 🔍 Diagnostic Avancé

### Vérifier les logs du bot

```bash
# Logs systemd
sudo journalctl -u bag-discord-bot -f

# Logs PM2
sudo -u botuser pm2 logs bagbot
```

### Tester manuellement une sauvegarde

```bash
cd /home/botuser/bag-discord-bot
sudo -u botuser node -e "
const GitHubBackup = require('./src/storage/githubBackup.js');
require('dotenv').config();
const github = new GitHubBackup();
github.backup({test: true, timestamp: new Date().toISOString()})
  .then(r => console.log('✅ Sauvegarde test réussie:', r))
  .catch(e => console.error('❌ Erreur sauvegarde:', e.message));
"
```

## 🔧 Dépannage

### Erreur "Token invalide"

1. Vérifiez que le token n'a pas expiré
2. Régénérez un nouveau token si nécessaire
3. Assurez-vous qu'il a les bonnes permissions

### Erreur "Dépôt introuvable"

1. Vérifiez l'orthographe : `mel805/Bag-bot`
2. Assurez-vous que le dépôt existe
3. Vérifiez les permissions d'accès

### Erreur "Branche introuvable"

La branche sera créée automatiquement lors de la première sauvegarde.

### Permission denied

```bash
# Vérifier les permissions du fichier .env
sudo ls -la /home/botuser/bag-discord-bot/.env

# Corriger si nécessaire
sudo chown botuser:botuser /home/botuser/bag-discord-bot/.env
sudo chmod 600 /home/botuser/bag-discord-bot/.env
```

## 📋 Checklist de Vérification

- [ ] Fichier `.env` existe et contient `GITHUB_TOKEN`
- [ ] Fichier `.env` contient `GITHUB_REPO=mel805/Bag-bot`
- [ ] Fichier `.env` contient `GITHUB_BACKUP_BRANCH=backup-data`
- [ ] Token GitHub valide et non expiré
- [ ] Token a les permissions `repo`
- [ ] Dépôt GitHub accessible
- [ ] Bot redémarré après configuration
- [ ] Test de sauvegarde réussi

## 🎯 Différences Render vs Freebox

| Aspect | Render | Freebox |
|--------|--------|---------|
| **Variables d'env** | Interface web | Fichier `.env` local |
| **Persistance** | Automatique | Manuelle |
| **Accès réseau** | Optimisé | Dépend de la box |
| **Redémarrage** | Auto-deploy | Manuel |

## 📞 Support

Si le problème persiste :

1. **Vérifiez les logs** détaillés
2. **Testez la connectivité** Internet
3. **Validez le token** GitHub
4. **Contactez le support** si nécessaire

---

*Guide créé pour résoudre les problèmes de sauvegarde GitHub sur Freebox - Décembre 2024*