# Guide de Dépannage - Système Musique

## Problèmes Courants

### ❌ "nœud non connecté" / "Lecteur temporairement indisponible"

**Causes possibles :**
- Aucun serveur Lavalink disponible
- Problème de connexion réseau
- Serveurs Lavalink publics surchargés

**Solutions :**

1. **Vérifier le statut** avec `/music-status`
2. **Redémarrer le bot** si tous les nœuds sont déconnectés
3. **Configurer des nœuds personnalisés** via la variable d'environnement `LAVALINK_NODES`

### 🔧 Configuration des Nœuds

#### Option 1: Nœuds Publics (par défaut)
Le bot utilise automatiquement des serveurs publics si aucune configuration n'est fournie.
Il tentera d'abord de charger le fichier `lavalink-nodes.stable.json` à la racine du projet (ex: `/workspace/lavalink-nodes.stable.json`).
À défaut, il utilise des nœuds publics stables intégrés (TLS 443) : `lava-v3.ajieblogs.eu.org:443`, `lavalink.oops.wtf:443`.

#### Option 2: Nœuds Personnalisés
Définir la variable d'environnement `LAVALINK_NODES` :

```json
[
  {
    "identifier": "mon-lavalink",
    "host": "lavalink.monserveur.com",
    "port": 443,
    "password": "motdepasse",
    "secure": true,
    "retryAmount": 5,
    "retryDelay": 30000
  }
]
```

#### Option 3: Lavalink Local
Activer avec `ENABLE_LOCAL_LAVALINK=true`

### 🔍 Diagnostic

#### Commandes utiles :
- `/music-status` - Statut des nœuds
- Logs du bot pour voir les connexions/déconnexions

#### Logs à surveiller :
```
[Music] ✅ Node connected: lavalink-eu:443
[Music] ❌ Node disconnected: lavalink-us:443 - Reason: Connection lost
[Music] 🔄 Node reconnecting: lavalink-backup:80
[Music] 📊 Node status: 2/3 connected
```

### 🚀 Améliorations Apportées

1. **Nœuds de Secours** : Plusieurs serveurs configurés automatiquement
2. **Reconnexion Automatique** : Le bot tente de se reconnecter toutes les 30 secondes
3. **Messages d'Erreur Améliorés** : Indications claires sur le problème
4. **Monitoring** : Vérification périodique de l'état des nœuds
5. **Commande de Statut** : `/music-status` pour diagnostiquer

### 🔧 Configuration Avancée

#### Variables d'Environnement :
- `LAVALINK_NODES` : Configuration JSON des nœuds
- `LAVALINK_PASSWORD` : Mot de passe pour Lavalink local
- `ENABLE_LOCAL_LAVALINK` : Activer Lavalink local (true/false)

#### Fichier application.yml (Lavalink local) :
```yaml
server:
  port: 2333
lavalink:
  server:
    password: "votre-mot-de-passe"
    sources:
      youtube: true
      soundcloud: true
      bandcamp: true
      twitch: true
      vimeo: true
      http: true
```

### 📞 Support

Si le problème persiste :
1. Vérifier les logs du bot
2. Tester avec `/music-status`
3. Redémarrer le service
4. Contacter l'administrateur système