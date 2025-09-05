# Guide de Dépannage PM2 - Bot Discord BAG

## ✅ Problème Résolu !

Le problème de redémarrage de PM2 a été résolu. Voici ce qui a été fait :

### 🔧 Solutions Appliquées

1. **Installation de PM2** : PM2 n'était pas installé initialement
   ```bash
   npm install -g pm2
   ```

2. **Configuration PM2** : Création d'un fichier `ecosystem.config.js`
3. **Variables d'environnement** : Création des fichiers `.env` et `.env.example`
4. **Scripts de démarrage** : Création de `start-bot.sh` avec validation des variables

### 📋 Configuration Requise

Avant de démarrer le bot, vous devez configurer vos variables Discord dans le fichier `.env` :

```bash
DISCORD_TOKEN=votre_token_discord_ici
CLIENT_ID=votre_client_id_ici
GUILD_ID=votre_guild_id_ici
```

### 🚀 Commandes de Démarrage

```bash
# Méthode recommandée (avec validation)
./start-bot.sh

# Ou directement avec PM2
pm2 start ecosystem.config.js
```

### 📊 Commandes de Monitoring

```bash
pm2 status                    # Statut des processus
pm2 logs bag-discord-bot      # Voir les logs
pm2 monit                     # Monitoring en temps réel
pm2 restart bag-discord-bot   # Redémarrer
pm2 stop bag-discord-bot      # Arrêter
pm2 delete bag-discord-bot    # Supprimer
```

### 🔄 Configuration Auto-Start (Optionnel)

Pour que le bot redémarre automatiquement après un reboot :

```bash
./setup-pm2-startup.sh
pm2 save
```

## 🚨 Dépannage des Erreurs Courantes

### Erreur : "PM2 command not found"
```bash
npm install -g pm2
```

### Erreur : "Missing DISCORD_TOKEN"
1. Éditez le fichier `.env`
2. Ajoutez vos vraies clés Discord
3. Relancez avec `./start-bot.sh`

### Erreur : Bot qui redémarre constamment
1. Vérifiez les logs : `pm2 logs bag-discord-bot`
2. Vérifiez les variables d'environnement
3. Testez le bot directement : `node src/bot.js`

### Erreur : "Cannot find module"
```bash
npm install
```

### Réinitialiser PM2 Complètement
```bash
pm2 kill
pm2 start ecosystem.config.js
```

## 📝 Logs et Debugging

Les logs PM2 sont stockés dans :
- Logs généraux : `~/.pm2/logs/`
- Configuration : `~/.pm2/`

Pour voir les logs en temps réel :
```bash
pm2 logs bag-discord-bot --lines 100 -f
```

## 🆘 Support

Si vous rencontrez encore des problèmes :
1. Vérifiez que Node.js est installé : `node --version`
2. Vérifiez que PM2 est installé : `pm2 --version`
3. Testez le bot sans PM2 : `node src/bot.js`
4. Vérifiez les permissions des fichiers : `ls -la`

## 📁 Fichiers Créés/Modifiés

- `ecosystem.config.js` - Configuration PM2
- `.env` - Variables d'environnement (à configurer)
- `.env.example` - Exemple de configuration
- `start-bot.sh` - Script de démarrage avec validation
- `setup-pm2-startup.sh` - Configuration auto-start
- `logs/` - Dossier pour les logs PM2