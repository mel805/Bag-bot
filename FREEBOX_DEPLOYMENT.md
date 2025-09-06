# 🏠 Déploiement sur Freebox Delta - BAG Discord Bot

Ce guide vous explique comment déployer votre bot Discord BAG sur votre Freebox Delta en utilisant une machine virtuelle (VM).

## 📋 Table des Matières

- [Prérequis](#prérequis)
- [Configuration de la VM Freebox](#configuration-de-la-vm-freebox)
- [Installation et Configuration](#installation-et-configuration)
- [Scripts de Déploiement](#scripts-de-déploiement)
- [Service Systemd](#service-systemd)
- [Monitoring et Maintenance](#monitoring-et-maintenance)
- [Dépannage](#dépannage)

## 🔧 Prérequis

### Matériel Requis
- **Freebox Delta** avec au moins 4 Go de RAM disponible
- **Connexion Internet** stable
- **Accès administrateur** à Freebox OS

### Ressources Recommandées pour la VM
- **CPU** : 2 cœurs
- **RAM** : 2 Go minimum (4 Go recommandé)
- **Stockage** : 20 Go minimum
- **OS** : Ubuntu 22.04 LTS ou Debian 12

## 🖥️ Configuration de la VM Freebox

### 1. Création de la VM

1. **Accéder à Freebox OS** : 
   - Ouvrez votre navigateur et allez sur `http://mafreebox.freebox.fr`
   - Connectez-vous avec vos identifiants

2. **Créer une nouvelle VM** :
   - Cliquez sur l'icône "VMs" dans le menu principal
   - Cliquez sur le bouton "+" pour ajouter une nouvelle VM

3. **Configuration de la VM** :
   ```
   Nom: bag-discord-bot
   CPU: 2 cœurs
   RAM: 4096 Mo (4 Go)
   Stockage: 25 Go
   OS: Ubuntu 22.04 LTS
   ```

4. **Configuration Réseau** :
   - Activez l'accès SSH
   - Notez l'adresse IP attribuée (ex: 192.168.1.100)
   - Configurez un port forwarding si nécessaire

### 2. Première Connexion

```bash
# Connexion SSH à la VM (remplacez IP par l'IP de votre VM)
ssh ubuntu@192.168.1.100

# Mise à jour du système
sudo apt update && sudo apt upgrade -y
```

## 🚀 Installation et Configuration

### 1. Installation de Node.js

```bash
# Installation de Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Vérification
node --version
npm --version
```

### 2. Installation des Dépendances Système

```bash
# Dépendances pour @napi-rs/canvas
sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Outils utiles
sudo apt install -y git curl wget htop nano
```

### 3. Création de l'Utilisateur du Bot

```bash
# Créer un utilisateur dédié pour le bot
sudo useradd -m -s /bin/bash botuser
sudo usermod -aG sudo botuser

# Passer à l'utilisateur botuser
sudo su - botuser
```

### 4. Clonage et Configuration du Projet

```bash
# Cloner le repository (remplacez par votre URL)
git clone https://github.com/votre-username/bag-discord-bot.git
cd bag-discord-bot

# Installation des dépendances
npm install

# Configuration des variables d'environnement
cp .env.example .env
nano .env
```

### 5. Configuration du Fichier .env

```env
# Discord Configuration
DISCORD_TOKEN=votre_token_discord_ici
CLIENT_ID=votre_client_id_ici
GUILD_ID=votre_guild_id_ici

# Database Configuration (optionnel pour JSON storage)
# DATABASE_URL=postgresql://user:password@localhost:5432/bag_bot

# Bot Configuration
NODE_ENV=production
BOT_PREFIX=!
```

## 📜 Scripts de Déploiement

### Script d'Installation Automatique

Le script suivant sera créé pour automatiser l'installation :

```bash
# Utilisation du script d'installation
./scripts/freebox-setup.sh
```

### Script de Mise à Jour

```bash
# Mise à jour du bot
./scripts/freebox-update.sh
```

## 🔄 Service Systemd

### Configuration du Service

Le service systemd permettra de gérer automatiquement le bot :

```ini
[Unit]
Description=BAG Discord Bot
After=network.target

[Service]
Type=simple
User=botuser
WorkingDirectory=/home/botuser/bag-discord-bot
ExecStart=/usr/bin/node src/bot.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Commandes de Gestion

```bash
# Activer le service au démarrage
sudo systemctl enable bag-discord-bot

# Démarrer le service
sudo systemctl start bag-discord-bot

# Vérifier le statut
sudo systemctl status bag-discord-bot

# Voir les logs
sudo journalctl -u bag-discord-bot -f
```

## 📊 Monitoring et Maintenance

### Script de Monitoring

```bash
# Vérifier l'état du bot
./scripts/freebox-status.sh

# Redémarrer le bot si nécessaire
./scripts/freebox-restart.sh
```

### Logs et Debugging

```bash
# Voir les logs du service
sudo journalctl -u bag-discord-bot -n 50

# Voir les logs en temps réel
sudo journalctl -u bag-discord-bot -f

# Logs détaillés avec timestamps
sudo journalctl -u bag-discord-bot --since "1 hour ago"
```

### Sauvegarde Automatique

```bash
# Script de sauvegarde des données
./scripts/freebox-backup.sh
```

## 🔧 Dépannage

### Problèmes Courants

#### 1. Bot ne démarre pas
```bash
# Vérifier les logs
sudo journalctl -u bag-discord-bot -n 20

# Vérifier les variables d'environnement
sudo systemctl show bag-discord-bot --property=Environment
```

#### 2. Problèmes de mémoire
```bash
# Vérifier l'utilisation de la mémoire
htop

# Redimensionner la VM si nécessaire
# (via Freebox OS)
```

#### 3. Problèmes de réseau
```bash
# Tester la connectivité
ping discord.com

# Vérifier les ports
netstat -tlnp | grep node
```

### Commandes Utiles

```bash
# Redémarrage complet
sudo systemctl restart bag-discord-bot

# Mise à jour du code
cd /home/botuser/bag-discord-bot
git pull
npm install
sudo systemctl restart bag-discord-bot

# Vérification de l'état système
df -h  # Espace disque
free -h  # Mémoire
top  # Processus
```

## 🚨 Sécurité

### Recommandations

1. **Firewall** : Configurez iptables ou ufw
2. **SSH** : Utilisez des clés SSH au lieu de mots de passe
3. **Mise à jour** : Maintenez le système à jour
4. **Sauvegarde** : Sauvegardez régulièrement vos données

### Configuration Firewall Basique

```bash
# Installation et configuration d'ufw
sudo apt install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw enable
```

## 📚 Ressources Utiles

- [Documentation Freebox OS](https://dev.freebox.fr/sdk/os/)
- [Discord.js Guide](https://discord.js.org/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Systemd Documentation](https://www.freedesktop.org/software/systemd/man/)

## 🆘 Support

En cas de problème :

1. **Vérifiez les logs** : `sudo journalctl -u bag-discord-bot -f`
2. **Consultez la documentation** Discord.js
3. **Vérifiez la connectivité** réseau
4. **Surveillez les ressources** système

---

*Guide créé pour le déploiement sur Freebox Delta - Décembre 2024*