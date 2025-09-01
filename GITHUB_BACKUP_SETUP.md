# 🔄 Configuration Sauvegarde GitHub

## Vue d'ensemble

Le bot BAG dispose maintenant d'un système de sauvegarde automatique sur GitHub qui :
- ✅ Sauvegarde **TOUTES** les données (config, argent, niveaux, karma, etc.)
- ✅ Restaure automatiquement lors des déploiements Render
- ✅ Priorité GitHub > PostgreSQL > Fichiers locaux

## 🛠️ Configuration requise

### 1. Token GitHub

Créez un **Personal Access Token** sur GitHub :
1. Allez sur https://github.com/settings/tokens
2. Cliquez "Generate new token (classic)"
3. Nom: `BAG-Bot-Backup`
4. Permissions requises :
   - ✅ `repo` (accès complet aux dépôts)
   - ✅ `contents:write` (écriture des fichiers)

### 2. Variables d'environnement Render

Ajoutez ces variables dans votre service Render :

```env
GITHUB_TOKEN=ghp_votre_token_ici
GITHUB_REPO=mel805/Bag-bot
GITHUB_BACKUP_BRANCH=backup-data
```

## 🚀 Fonctionnement

### Sauvegarde automatique

La commande `/backup` fait maintenant :
1. **Sauvegarde locale** (PostgreSQL/fichier)
2. **Sauvegarde GitHub** automatique
3. **Logs détaillés** du statut

### Restauration prioritaire

Au démarrage de Render :
1. **GitHub** (priorité 1) 🐙
2. **PostgreSQL** (fallback) 🐘  
3. **Fichiers locaux** (dernier recours) 📁

### Nouvelles commandes

#### `/github-backup test`
- Teste la connexion GitHub
- Vérifie les permissions

#### `/github-backup list`
- Liste les 10 dernières sauvegardes
- Affiche SHA et dates

#### `/github-backup force-backup`
- Force une sauvegarde immédiate sur GitHub

#### `/github-backup force-restore`
- Force une restauration depuis GitHub

## 📊 Données sauvegardées

**TOUTES** les données du bot sont incluses :

### Par serveur Discord :
- 👥 **Staff** : Rôles staff configurés
- 🚪 **AutoKick** : Configuration et membres en attente  
- 🎯 **Niveaux** : XP, niveaux de tous les utilisateurs
- 💰 **Économie** : Argent, karma (charme/perversion), cooldowns
- 🛒 **Boutique** : Articles, rôles, achats
- 💕 **Suites** : Locations actives
- 📝 **Logs** : Configuration des canaux de logs
- 🎲 **Action/Vérité** : Prompts personnalisés
- 🤫 **Confessions** : Configuration
- 🧵 **Auto-threads** : Configuration
- 🔢 **Comptage** : État actuel
- 📍 **Géolocalisation** : Positions des utilisateurs
- ⚠️ **Modération** : Avertissements

## 🔧 Dépannage

### GitHub non configuré
```
❌ GitHub non configuré, sauvegarde locale uniquement
```
→ Ajoutez `GITHUB_TOKEN` et `GITHUB_REPO`

### Erreurs de permissions
```
❌ GitHub API Error 403: Bad credentials
```
→ Vérifiez votre token GitHub

### Branche manquante
Le système crée automatiquement la branche `backup-data` si elle n'existe pas.

## 📈 Avantages

1. **Redondance** : Données sauvées sur GitHub + PostgreSQL + fichiers
2. **Automatique** : Chaque `/backup` sauvegarde sur GitHub
3. **Historique** : Tous les commits sont conservés
4. **Fiable** : Restauration automatique au démarrage Render
5. **Visible** : Logs détaillés du statut de sauvegarde

## ⚡ Test rapide

1. Configurez les variables d'environnement
2. Redéployez sur Render  
3. Utilisez `/github-backup test` pour vérifier
4. Utilisez `/backup` pour tester la sauvegarde complète
5. Vérifiez les logs dans Discord

Les données sont maintenant **100% protégées** ! 🛡️