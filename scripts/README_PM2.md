# 🚀 Scripts PM2 - BAG Discord Bot sur Freebox Delta

Ce document décrit les scripts spécifiques à PM2 pour la gestion du bot Discord BAG sur Freebox Delta.

## 📋 Scripts disponibles

### Scripts de configuration

| Script | Description | Usage |
|--------|-------------|--------|
| `freebox-setup.sh --pm2` | Installation initiale avec PM2 | `sudo ./scripts/freebox-setup.sh --pm2` |
| `freebox-pm2-setup.sh` | Migration vers PM2 | `sudo ./scripts/freebox-pm2-setup.sh` |
| `freebox-systemd-restore.sh` | Migration vers systemd | `sudo ./scripts/freebox-systemd-restore.sh` |

### Scripts de gestion PM2

| Script | Description | Usage |
|--------|-------------|--------|
| `freebox-pm2-status.sh` | Statut détaillé PM2 | `./scripts/freebox-pm2-status.sh` |
| `freebox-pm2-restart.sh` | Redémarrage PM2 avancé | `sudo ./scripts/freebox-pm2-restart.sh [type]` |

### Scripts de monitoring

| Script | Description | Usage |
|--------|-------------|--------|
| `freebox-status.sh` | Statut hybride (PM2/systemd) | `./scripts/freebox-status.sh` |

## 🔧 Installation et configuration

### Installation complète avec PM2

```bash
# Installation directe avec PM2
sudo ./scripts/freebox-setup.sh --pm2
```

### Migration depuis systemd

```bash
# Migration automatique vers PM2
sudo ./scripts/freebox-pm2-setup.sh
```

## 📊 Monitoring et gestion

### Commandes de base

```bash
# Statut complet
./scripts/freebox-pm2-status.sh

# Redémarrage normal
sudo ./scripts/freebox-pm2-restart.sh

# Redémarrage zero-downtime
sudo ./scripts/freebox-pm2-restart.sh reload

# Redémarrage forcé
sudo ./scripts/freebox-pm2-restart.sh force
```

### Commandes PM2 directes

```bash
# Via npm scripts
npm run pm2:status
npm run pm2:logs
npm run pm2:monit

# Directement avec PM2
sudo -u botuser pm2 status
sudo -u botuser pm2 logs bagbot
sudo -u botuser pm2 monit
```

### Raccourcis système

Après installation, ces commandes sont disponibles globalement :

```bash
bagbot-pm2-start    # Démarrer
bagbot-pm2-stop     # Arrêter
bagbot-pm2-restart  # Redémarrer
bagbot-pm2-status   # Statut
```

## 🧪 Tests et validation

### Test de configuration

```bash
# Test complet de la configuration PM2
node test-pm2-config.js

# Ou via npm
npm run test:pm2
```

### Validation manuelle

```bash
# Vérifier le statut
sudo -u botuser pm2 status

# Vérifier les logs
sudo -u botuser pm2 logs bagbot --lines 20

# Monitoring temps réel
sudo -u botuser pm2 monit
```

## 🔄 Types de redémarrage

Le script `freebox-pm2-restart.sh` supporte plusieurs types de redémarrage :

| Type | Description | Usage |
|------|-------------|--------|
| `normal` | Redémarrage standard | `sudo ./scripts/freebox-pm2-restart.sh` |
| `reload` | Zero-downtime reload | `sudo ./scripts/freebox-pm2-restart.sh reload` |
| `graceful` | Arrêt propre puis redémarrage | `sudo ./scripts/freebox-pm2-restart.sh graceful` |
| `force` | Suppression et recréation | `sudo ./scripts/freebox-pm2-restart.sh force` |

## 📁 Structure des fichiers

```
/home/botuser/bag-discord-bot/
├── ecosystem.config.js          # Configuration PM2
├── logs/                        # Logs personnalisés
│   ├── combined.log
│   ├── out.log
│   └── error.log
└── backups/                     # Sauvegardes automatiques

/home/botuser/.pm2/
├── logs/                        # Logs PM2 par défaut
│   ├── bagbot-out.log
│   └── bagbot-error.log
├── pids/                        # Fichiers PID
└── dump.pm2                     # Configuration sauvegardée
```

## ⚙️ Configuration avancée

### Fichier ecosystem.config.js

Le fichier de configuration PM2 inclut :

- **Gestion des ressources** : Limite mémoire, redémarrage automatique
- **Logs** : Rotation automatique, formats personnalisés
- **Performance** : Options Node.js optimisées
- **Monitoring** : Intégration PMX
- **Environnements** : Production/développement

### Variables d'environnement

```javascript
env: {
  NODE_ENV: "production",
  PM2_SERVE_PATH: ".",
  PM2_SERVE_PORT: 8080
},

env_development: {
  NODE_ENV: "development",
  LOG_LEVEL: "debug"
}
```

### Limites de ressources

```javascript
max_memory_restart: "1G",        // Redémarrage si > 1Go
max_restarts: 5,                 // Max 5 redémarrages/minute
min_uptime: "10s",               // Temps minimum avant redémarrage
restart_delay: 5000,             // Délai entre redémarrages
```

## 🛠️ Dépannage

### Problèmes courants

#### Bot ne démarre pas

```bash
# Vérifier les logs
sudo -u botuser pm2 logs bagbot --lines 50

# Vérifier la configuration
node test-pm2-config.js

# Démarrage en mode debug
sudo -u botuser pm2 start ecosystem.config.js --env development
```

#### PM2 ne démarre pas au boot

```bash
# Reconfigurer le startup
sudo -u botuser pm2 startup systemd
# Exécuter la commande affichée

# Sauvegarder
sudo -u botuser pm2 save
```

#### Logs trop volumineux

```bash
# Vider les logs
sudo -u botuser pm2 flush

# Vérifier la configuration de rotation
sudo -u botuser pm2 conf pm2-logrotate
```

### Commandes de diagnostic

```bash
# Statut détaillé
./scripts/freebox-pm2-status.sh --app

# Description complète
sudo -u botuser pm2 describe bagbot

# Monitoring système
./scripts/freebox-pm2-status.sh --system
```

## 🔒 Sécurité

### Permissions

- Le bot s'exécute sous l'utilisateur `botuser`
- Les fichiers de configuration ont des permissions restrictives
- Les logs sont accessibles uniquement par l'utilisateur du bot

### Isolation

- Utilisation de `ReadWritePaths` pour limiter l'accès aux fichiers
- Variables d'environnement sécurisées dans `.env`
- Pas de privilèges root pour l'exécution

## 📚 Ressources

### Documentation

- [Guide de migration PM2](../FREEBOX_PM2_MIGRATION_GUIDE.md)
- [Documentation Freebox](../FREEBOX_DEPLOYMENT.md)
- [Documentation PM2 officielle](https://pm2.keymetrics.io/docs/)

### Scripts connexes

- `freebox-backup.sh` : Sauvegarde des données
- `freebox-update.sh` : Mise à jour du bot
- `freebox-status.sh` : Monitoring hybride

## 🆘 Support

En cas de problème :

1. **Vérifiez les logs** : `sudo -u botuser pm2 logs bagbot`
2. **Testez la configuration** : `npm run test:pm2`
3. **Consultez le monitoring** : `./scripts/freebox-pm2-status.sh`
4. **Vérifiez la connectivité** : `ping discord.com`

---

*Documentation créée pour les scripts PM2 - Décembre 2024*