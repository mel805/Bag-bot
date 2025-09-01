# 📜 Scripts de Déploiement

Ce dossier contient les scripts automatisés pour le déploiement du bot Discord BAG sur Render.

## 📁 Contenu

### `deploy-commands.sh`
Script spécialisé pour le déploiement des commandes Discord slash.

**Utilisation :**
```bash
./scripts/deploy-commands.sh [OPTIONS]
```

**Options :**
- `--help, -h` : Afficher l'aide
- `--health-check` : Effectuer un test de connexion
- `--env-check` : Vérifier uniquement les variables d'environnement

**Fonctionnalités :**
- ✅ Vérification des variables d'environnement
- 📦 Installation des dépendances
- 🚀 Déploiement des commandes Discord
- 🔍 Test de connexion optionnel

### `render-deploy.sh`
Script complet pour le déploiement sur Render avec toutes les vérifications.

**Utilisation :**
```bash
./scripts/render-deploy.sh [OPTIONS]
```

**Options :**
- `--help, -h` : Afficher l'aide
- `--skip-tests` : Ignorer les tests
- `--skip-build` : Ignorer le build
- `--no-tag` : Ne pas créer de tag Git
- `--check-only` : Vérifications uniquement

**Fonctionnalités :**
- 🔍 Vérifications complètes (Git, prérequis, etc.)
- 🧪 Exécution des tests
- 🏗️ Construction du projet
- 🏷️ Création automatique de tags Git
- 🚀 Déclenchement du déploiement Render

## 🚀 Utilisation Rapide

```bash
# Déployer uniquement les commandes
npm run deploy:commands

# Déploiement complet
npm run deploy:render

# Vérifications seulement
npm run deploy:check

# Déploiement rapide
npm run deploy:fast
```

## 📋 Prérequis

- Node.js >= 18.17
- Git configuré
- Variables d'environnement configurées sur Render
- Repository Git avec remote configuré

## 🔧 Configuration

Les scripts utilisent la configuration depuis :
- `package.json` (version, scripts)
- `render.yaml` (configuration Render)
- Variables d'environnement Render
- `.env` (pour tests locaux)

## 📊 Monitoring

Après déploiement, surveillez :
- [Dashboard Render](https://dashboard.render.com/)
- Logs de déploiement
- Fonctionnement des commandes Discord
- Métriques de performance

---

Pour plus de détails, consultez [DEPLOYMENT.md](../DEPLOYMENT.md)