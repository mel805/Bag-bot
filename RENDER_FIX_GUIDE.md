# 🚀 Guide de Déblocage Render - SOLUTION RAPIDE

## 🔥 PROBLÈME IDENTIFIÉ

Votre déploiement Render est bloqué car **les variables d'environnement Discord ne sont pas configurées**.

### Symptômes observés :
- ❌ Déploiement reste en statut "Building" ou "Deploying" indéfiniment
- ❌ Service n'atteint jamais le statut "Live" 
- ❌ Logs montrent : `Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID`

## ⚡ SOLUTION EN 3 ÉTAPES (5 minutes)

### ÉTAPE 1: Accéder au Dashboard Render
1. Allez sur https://dashboard.render.com
2. Connectez-vous à votre compte
3. Sélectionnez le service `bag-discord-bot`

### ÉTAPE 2: Configurer les Variables d'Environnement
1. Cliquez sur l'onglet **"Environment"**
2. Ajoutez ces 3 variables CRITIQUES :

```
Nom: DISCORD_TOKEN
Valeur: <votre_token_discord_bot>

Nom: CLIENT_ID  
Valeur: <votre_client_id_discord>

Nom: GUILD_ID
Valeur: <votre_guild_id_discord>
```

> 💡 **Où trouver ces valeurs ?**
> - DISCORD_TOKEN & CLIENT_ID : https://discord.com/developers/applications → Votre bot → Bot/General Information
> - GUILD_ID : Discord → Votre serveur → Clic droit → "Copier l'ID du serveur"

### ÉTAPE 3: Redéployer
1. Cliquez sur l'onglet **"Deploys"**
2. Cliquez sur **"Manual Deploy"** 
3. Sélectionnez **"Deploy Latest Commit"**
4. Attendez 2-3 minutes ⏳

## ✅ VÉRIFICATION DU SUCCÈS

Dans l'onglet **"Logs"**, vous devriez voir :

```
✅ [register] DATA_DIR: /opt/render/project/src/data
✅ Commands deployed successfully
✅ Logged in as [Nom_de_votre_bot]
✅ Ready! Logged in as [Nom_de_votre_bot]
```

Le statut du service passera à **"Live" (vert)**.

## 🛠️ DIAGNOSTIC AUTOMATIQUE

Pour vérifier votre configuration localement :

```bash
./scripts/render-debug.sh
```

## 🆘 SI ÇA NE MARCHE TOUJOURS PAS

1. **Vérifiez la base de données** :
   - Dashboard Render → Databases → Vérifiez que `bag-bot-db` est "Available"
   - La variable `DATABASE_URL` devrait être automatiquement ajoutée

2. **Vérifiez les logs détaillés** :
   - Onglet "Logs" → Recherchez les erreurs spécifiques

3. **Variables optionnelles** (ajoutez si nécessaire) :
   ```
   GITHUB_TOKEN=<votre_token_github>
   LOCATIONIQ_TOKEN=<votre_token_locationiq>
   LEVEL_CARD_LOGO_URL=<url_de_votre_logo>
   ```

## 📞 Support

Si le problème persiste après avoir suivi ce guide :
1. Partagez les logs Render complets
2. Vérifiez que votre bot Discord a les permissions nécessaires
3. Testez localement avec un fichier `.env`

---
*Guide créé le $(date) - Version 1.0*