# 🚀 Guide de Déploiement - BAG Discord Bot

Ce guide explique comment utiliser les scripts de déploiement automatisés pour déployer le bot Discord BAG sur Render.

## 📋 Table des Matières

- [Prérequis](#prérequis)
- [Scripts Disponibles](#scripts-disponibles)
- [Configuration](#configuration)
- [Déploiement des Commandes](#déploiement-des-commandes)
- [Déploiement Complet](#déploiement-complet)
- [Variables d'Environnement](#variables-denvironnement)
- [Dépannage](#dépannage)
- [Bonnes Pratiques](#bonnes-pratiques)

## 🔧 Prérequis

Avant d'utiliser les scripts de déploiement, assurez-vous d'avoir :

- **Node.js** >= 18.17
- **npm** ou **yarn**
- **Git** configuré avec votre repository
- Un compte **Render** avec votre service configuré
- Les **variables d'environnement** configurées sur Render

## 📜 Scripts Disponibles

### Scripts NPM

```bash
# Déployer uniquement les commandes Discord
npm run deploy:commands

# Déploiement complet sur Render
npm run deploy:render

# Vérifier les prérequis de déploiement
npm run deploy:check

# Déploiement rapide (sans tests ni build)
npm run deploy:fast
```

### Scripts Shell Directs

```bash
# Script de déploiement des commandes
./scripts/deploy-commands.sh [OPTIONS]

# Script de déploiement complet
./scripts/render-deploy.sh [OPTIONS]
```

## ⚙️ Configuration

### 1. Configuration Render

Votre fichier `render.yaml` est déjà configuré avec :

```yaml
services:
  - type: web
    name: bag-discord-bot
    env: node
    autoDeploy: true
    buildCommand: npm run render-build
    startCommand: npm run render-start
```

### 2. Variables d'Environnement

Configurez ces variables dans le dashboard Render :

| Variable | Description | Requis |
|----------|-------------|--------|
| `DISCORD_TOKEN` | Token du bot Discord | ✅ |
| `CLIENT_ID` | ID du client Discord | ✅ |
| `GUILD_ID` | ID du serveur Discord | ⚠️ |
| `DATABASE_URL` | URL de la base de données | ✅ |
| `GITHUB_TOKEN` | Token GitHub pour les backups | ⚠️ |

## 🎯 Déploiement des Commandes

### Utilisation Basique

```bash
# Déployer les commandes slash
npm run deploy:commands
```

### Options Avancées

```bash
# Vérifier les variables d'environnement
./scripts/deploy-commands.sh --env-check

# Déployer avec test de connexion
./scripts/deploy-commands.sh --health-check

# Aide
./scripts/deploy-commands.sh --help
```

### Ce que fait le script :

1. ✅ Vérifie les variables d'environnement
2. 📦 Installe les dépendances
3. 🚀 Déploie les commandes Discord
4. 🔍 Test de connexion (optionnel)

## 🌐 Déploiement Complet

### Utilisation Basique

```bash
# Déploiement complet avec toutes les vérifications
npm run deploy:render
```

### Options Avancées

```bash
# Vérifications uniquement
npm run deploy:check

# Déploiement rapide
npm run deploy:fast

# Déploiement sans tests
./scripts/render-deploy.sh --skip-tests

# Déploiement sans tag Git
./scripts/render-deploy.sh --no-tag
```

### Processus de Déploiement

Le script de déploiement complet effectue :

1. **🔍 Vérifications Préliminaires**
   - Prérequis système
   - Statut Git
   - Structure du projet

2. **🧪 Tests et Construction**
   - Exécution des tests (si disponibles)
   - Installation des dépendances
   - Build du projet

3. **🏷️ Versioning**
   - Création d'un tag Git automatique
   - Format : `deploy-v{version}-{timestamp}`

4. **🚀 Déploiement**
   - Push vers le repository Git
   - Déclenchement du déploiement automatique Render

5. **📊 Suivi**
   - Affichage des informations de déploiement
   - Instructions post-déploiement

## 🔐 Variables d'Environnement

### Configuration Locale (.env)

Pour les tests locaux, créez un fichier `.env` :

```env
DISCORD_TOKEN=votre_token_discord
CLIENT_ID=votre_client_id
GUILD_ID=votre_guild_id
DATABASE_URL=votre_database_url
```

### Configuration Render

Les variables sont configurées automatiquement via `render.yaml` et le dashboard Render.

## 🚨 Dépannage

### Erreurs Communes

#### 1. Variables d'Environnement Manquantes

```bash
[ERROR] Variables d'environnement manquantes:
  - DISCORD_TOKEN
  - CLIENT_ID
```

**Solution :** Configurez les variables dans le dashboard Render.

#### 2. Erreur de Connexion Discord

```bash
❌ Erreur de connexion: Invalid token
```

**Solution :** Vérifiez que le token Discord est valide et correctement configuré.

#### 3. Changements Non Commitées

```bash
[WARNING] Il y a des changements non commitées
```

**Solution :** Commitez vos changements ou utilisez `--skip-git-check`.

#### 4. Échec du Build

```bash
[ERROR] npm run build failed
```

**Solution :** Vérifiez les logs d'erreur et corrigez les problèmes de build.

### Logs et Monitoring

```bash
# Voir les logs Render (si CLI installée)
render logs --service bag-discord-bot

# Redémarrer le service
render restart --service bag-discord-bot
```

## ✅ Bonnes Pratiques

### 1. Avant le Déploiement

- ✅ Testez localement vos modifications
- ✅ Commitez tous vos changements
- ✅ Vérifiez les variables d'environnement
- ✅ Exécutez `npm run deploy:check`

### 2. Déploiement

- 🚀 Utilisez `npm run deploy:render` pour un déploiement complet
- ⚡ Utilisez `npm run deploy:fast` pour des déploiements rapides
- 🎯 Utilisez `npm run deploy:commands` pour mettre à jour uniquement les commandes

### 3. Après le Déploiement

- 📊 Surveillez les logs de déploiement
- 🧪 Testez les commandes dans Discord
- 🔍 Vérifiez les métriques de performance
- 💾 Sauvegardez la base de données si nécessaire

### 4. Versioning

Les tags Git sont créés automatiquement avec le format :
```
deploy-v0.1.1-20241208-143022
```

Cela permet de :
- 📝 Tracer les déploiements
- 🔄 Revenir à une version précédente si nécessaire
- 📊 Suivre l'historique des releases

## 🆘 Support

En cas de problème :

1. **Vérifiez les logs** : Dashboard Render → Logs
2. **Consultez la documentation** : [Render Docs](https://render.com/docs)
3. **Vérifiez Discord Developer Portal** pour les problèmes de bot
4. **Utilisez les options de debug** des scripts

## 📚 Ressources Utiles

- [Dashboard Render](https://dashboard.render.com/)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Documentation Discord.js](https://discord.js.org/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

*Dernière mise à jour : Décembre 2024*