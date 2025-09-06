# 🔄 Guide de Migration PM2 - BAG Discord Bot sur Freebox Delta

Ce guide vous explique comment migrer votre bot Discord BAG entre systemd et PM2 sur votre Freebox Delta.

## 📋 Table des Matières

- [Vue d'ensemble](#vue-densemble)
- [Migration vers PM2](#migration-vers-pm2)
- [Migration vers systemd](#migration-vers-systemd)
- [Comparaison systemd vs PM2](#comparaison-systemd-vs-pm2)
- [Dépannage](#dépannage)
- [Scripts disponibles](#scripts-disponibles)

## 🔍 Vue d'ensemble

### Gestionnaires de processus disponibles

| Gestionnaire | Avantages | Inconvénients |
|-------------|-----------|---------------|
| **systemd** | ✅ Intégré à Linux<br>✅ Très stable<br>✅ Logs centralisés | ❌ Interface moins conviviale<br>❌ Moins de fonctionnalités de monitoring |
| **PM2** | ✅ Interface web<br>✅ Monitoring avancé<br>✅ Rechargement sans arrêt<br>✅ Clustering facile | ❌ Dépendance externe<br>❌ Plus de ressources |

### Détection du gestionnaire actuel

Pour savoir quel gestionnaire est actuellement utilisé :

```bash
sudo ./scripts/freebox-status.sh
```

## 🚀 Migration vers PM2

### Prérequis

- Bot actuellement géré par systemd
- Accès root (sudo)
- Connexion Internet

### Étape 1 : Installation automatique

```bash
# Migration complète vers PM2
sudo ./scripts/freebox-pm2-setup.sh
```

### Étape 2 : Vérification

```bash
# Vérifier le statut PM2
sudo -u botuser pm2 status

# Monitoring avancé
sudo -u botuser pm2 monit
```

### Étape 3 : Configuration avancée (optionnel)

Éditez le fichier `ecosystem.config.js` pour personnaliser :

```javascript
module.exports = {
  apps: [{
    name: "bagbot",
    script: "./src/bot.js",
    instances: 1,                    // Nombre d'instances
    max_memory_restart: "1G",        // Redémarrage si mémoire > 1Go
    restart_delay: 5000,             // Délai entre redémarrages
    max_restarts: 5,                 // Max redémarrages par minute
    // ... autres options
  }]
};
```

### Commandes PM2 essentielles

```bash
# Statut des applications
sudo -u botuser pm2 status

# Logs en temps réel
sudo -u botuser pm2 logs bagbot

# Redémarrage
sudo -u botuser pm2 restart bagbot

# Monitoring interactif
sudo -u botuser pm2 monit

# Interface web (port 9615)
sudo -u botuser pm2 web

# Rechargement sans arrêt (si supporté)
sudo -u botuser pm2 reload bagbot
```

## 🔧 Migration vers systemd

### Prérequis

- Bot actuellement géré par PM2
- Accès root (sudo)

### Étape 1 : Migration automatique

```bash
# Migration complète vers systemd
sudo ./scripts/freebox-systemd-restore.sh

# Ou avec suppression de PM2
sudo ./scripts/freebox-systemd-restore.sh --remove-pm2
```

### Étape 2 : Vérification

```bash
# Vérifier le statut systemd
sudo systemctl status bag-discord-bot

# Logs en temps réel
sudo journalctl -u bag-discord-bot -f
```

### Commandes systemd essentielles

```bash
# Statut du service
sudo systemctl status bag-discord-bot

# Démarrer/Arrêter/Redémarrer
sudo systemctl start bag-discord-bot
sudo systemctl stop bag-discord-bot
sudo systemctl restart bag-discord-bot

# Activer/Désactiver au démarrage
sudo systemctl enable bag-discord-bot
sudo systemctl disable bag-discord-bot

# Logs
sudo journalctl -u bag-discord-bot -f     # Temps réel
sudo journalctl -u bag-discord-bot -n 50  # 50 dernières lignes
sudo journalctl -u bag-discord-bot --since "1 hour ago"
```

## ⚖️ Comparaison systemd vs PM2

### Quand utiliser systemd

✅ **Recommandé si :**
- Vous préférez la simplicité
- Vous voulez une intégration native Linux
- Vous n'avez pas besoin de monitoring avancé
- Vous voulez minimiser les dépendances

### Quand utiliser PM2

✅ **Recommandé si :**
- Vous voulez un monitoring visuel avancé
- Vous développez activement le bot
- Vous voulez des redémarrages sans arrêt
- Vous prévoyez d'utiliser le clustering
- Vous aimez les interfaces web

### Performances comparées

| Métrique | systemd | PM2 |
|----------|---------|-----|
| **Utilisation mémoire** | ~5-10 Mo | ~20-30 Mo |
| **Temps de démarrage** | ~2-3s | ~3-5s |
| **Stabilité** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Facilité d'utilisation** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## 🔧 Dépannage

### Problèmes courants avec PM2

#### Bot ne démarre pas avec PM2

```bash
# Vérifier les logs
sudo -u botuser pm2 logs bagbot

# Vérifier la configuration
cat /home/botuser/bag-discord-bot/ecosystem.config.js

# Redémarrer en mode debug
sudo -u botuser pm2 start ecosystem.config.js --env development
```

#### PM2 ne démarre pas au boot

```bash
# Reconfigurer le démarrage automatique
sudo -u botuser pm2 startup systemd
# Puis exécuter la commande affichée

# Sauvegarder la configuration
sudo -u botuser pm2 save
```

#### Logs PM2 trop volumineux

```bash
# Vider les logs
sudo -u botuser pm2 flush

# Configurer la rotation
sudo -u botuser pm2 install pm2-logrotate
sudo -u botuser pm2 set pm2-logrotate:max_size 10M
sudo -u botuser pm2 set pm2-logrotate:retain 7
```

### Problèmes courants avec systemd

#### Service ne démarre pas

```bash
# Vérifier les logs détaillés
sudo journalctl -u bag-discord-bot -n 50

# Vérifier la configuration du service
sudo systemctl cat bag-discord-bot

# Tester manuellement
sudo -u botuser bash -c 'cd /home/botuser/bag-discord-bot && node src/bot.js'
```

#### Variables d'environnement non chargées

```bash
# Vérifier le fichier .env
sudo cat /home/botuser/bag-discord-bot/.env

# Vérifier les permissions
sudo ls -la /home/botuser/bag-discord-bot/.env

# Recharger le service
sudo systemctl daemon-reload
sudo systemctl restart bag-discord-bot
```

## 📚 Scripts disponibles

### Scripts de gestion générale

| Script | Description | Usage |
|--------|-------------|--------|
| `freebox-setup.sh` | Installation initiale | `sudo ./scripts/freebox-setup.sh [--pm2\|--systemd]` |
| `freebox-status.sh` | Statut complet | `./scripts/freebox-status.sh` |
| `freebox-update.sh` | Mise à jour | `sudo ./scripts/freebox-update.sh` |

### Scripts PM2 spécifiques

| Script | Description | Usage |
|--------|-------------|--------|
| `freebox-pm2-setup.sh` | Migration vers PM2 | `sudo ./scripts/freebox-pm2-setup.sh` |
| `freebox-pm2-status.sh` | Statut PM2 détaillé | `./scripts/freebox-pm2-status.sh` |
| `freebox-pm2-restart.sh` | Redémarrage PM2 | `sudo ./scripts/freebox-pm2-restart.sh [type]` |

### Scripts systemd spécifiques

| Script | Description | Usage |
|--------|-------------|--------|
| `freebox-systemd-restore.sh` | Migration vers systemd | `sudo ./scripts/freebox-systemd-restore.sh` |
| `freebox-restart.sh` | Redémarrage systemd | `sudo ./scripts/freebox-restart.sh` |

### Raccourcis système (après installation PM2)

```bash
# Commandes raccourcies disponibles
bagbot-pm2-start    # Démarrer le bot
bagbot-pm2-stop     # Arrêter le bot
bagbot-pm2-restart  # Redémarrer le bot
bagbot-pm2-status   # Afficher le statut
```

## 🔄 Scénarios de migration courants

### Nouvelle installation avec PM2

```bash
# Installation directe avec PM2
sudo ./scripts/freebox-setup.sh --pm2
```

### Migration systemd → PM2

```bash
# 1. Vérifier l'état actuel
./scripts/freebox-status.sh

# 2. Migrer vers PM2
sudo ./scripts/freebox-pm2-setup.sh

# 3. Vérifier la migration
sudo -u botuser pm2 status
```

### Migration PM2 → systemd

```bash
# 1. Vérifier l'état actuel
./scripts/freebox-status.sh

# 2. Migrer vers systemd
sudo ./scripts/freebox-systemd-restore.sh

# 3. Vérifier la migration
sudo systemctl status bag-discord-bot
```

### Test des deux gestionnaires

```bash
# Installer avec systemd
sudo ./scripts/freebox-setup.sh --systemd

# Tester PM2
sudo ./scripts/freebox-pm2-setup.sh

# Revenir à systemd si nécessaire
sudo ./scripts/freebox-systemd-restore.sh
```

## 🛡️ Bonnes pratiques

### Sécurité

1. **Sauvegardez avant migration**
   ```bash
   sudo ./scripts/freebox-backup.sh
   ```

2. **Testez après migration**
   ```bash
   ./scripts/freebox-status.sh
   ```

3. **Surveillez les logs**
   ```bash
   # PM2
   sudo -u botuser pm2 logs bagbot
   
   # systemd
   sudo journalctl -u bag-discord-bot -f
   ```

### Performance

1. **Surveillez l'utilisation des ressources**
   ```bash
   # Avec PM2
   sudo -u botuser pm2 monit
   
   # Avec systemd
   htop  # ou top
   ```

2. **Configurez les limites mémoire**
   - PM2 : `max_memory_restart` dans `ecosystem.config.js`
   - systemd : `MemoryMax` dans le service

### Maintenance

1. **Rotation des logs automatique**
   - PM2 : Module `pm2-logrotate` installé automatiquement
   - systemd : Configuration `logrotate` créée automatiquement

2. **Mise à jour régulière**
   ```bash
   sudo ./scripts/freebox-update.sh
   ```

## 🆘 Support et aide

### Commandes de diagnostic

```bash
# Statut complet du système
./scripts/freebox-status.sh

# Logs détaillés PM2
sudo -u botuser pm2 logs bagbot --lines 50

# Logs détaillés systemd
sudo journalctl -u bag-discord-bot -n 50

# Test de connectivité
ping discord.com
```

### Ressources utiles

- [Documentation PM2](https://pm2.keymetrics.io/docs/)
- [Documentation systemd](https://www.freedesktop.org/software/systemd/man/)
- [Discord.js Guide](https://discord.js.org/)

---

*Guide créé pour le déploiement sur Freebox Delta - Décembre 2024*