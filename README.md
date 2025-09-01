## BAG Discord Bot (Node.js)

Fonctionnalités principales
- /config (Staff, AutoKick, Levels, Économie, Action/Vérité, Confessions, AutoThread, Comptage, Logs, Booster)
- Niveaux avec cartes et annonces, économie complète, musique (Lavalink), modération, logs

Configuration
- Variables requises: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
- Optionnelles: `DATABASE_URL` (Postgres), `LOCATIONIQ_TOKEN`, `LAVALINK_NODES`, `ENABLE_YTDLP_PROXY=false`, `YTDLP_BIN=/usr/bin/yt-dlp`

Scripts
- Installer: `npm ci` (ou `npm install`)
- Enregistrer les commandes (guild): `npm run register`
- Lancer le bot: `npm start`
- Migration Postgres: `npm run migrate:pg`

Déploiement Render
- Build Command: `npm run render-build`
- Start Command: `npm run render-start`
- Ajouter `DATABASE_URL` (Postgres Render) est recommandé. Au premier déploiement, la build exécutera la migration depuis `data/config.json` si présent.
 - Variables d'env:
   - `DISCORD_TOKEN`: token du bot
   - `CLIENT_ID`: application client id
   - `GUILD_ID`: serveur principal (pour `/register`)
   - `PORT`: fourni par Render (serveur HTTP keepalive intégré)
   - `DATABASE_URL` (optionnel): Postgres Render
   - `DATA_DIR` (optionnel, si pas de Postgres): chemin vers un volume monté (ex: `/var/data`)

Persistance
- Si `DATABASE_URL` est défini (et `pg` installée), la config est persistée dans Postgres (table `app_config`).
- Au démarrage Render, un script restaure la config fichier depuis Postgres vers `data/config.json` pour permettre l’édition/export via endpoints.
- Sans Postgres, la config est lue/écrite sur disque dans `DATA_DIR` (par défaut `./data`). Sur Render, créez un Volume et pointez `DATA_DIR` vers son point de montage.

Restauration
- Avec Postgres: rien à faire, les données sont conservées entre déploiements.
- Sans Postgres: assurez-vous que `DATA_DIR` persiste (Volume) et que `data/config.json` est présent. Le bot crée la structure si absente.

Sauvegarde/Restaurations manuelles
- Exporter la config (slash command ou HTTP):
  - `GET /config.json` (protégé par `CONFIG_TOKEN` si défini)
  - Dans Discord: `/config export`
- Importer/restaurer:
  - `POST /config.json` avec corps JSON compatible
  - Dans Discord: `/config import` avec pièce jointe JSON
- Snapshots: chaque écriture crée un backup dans `data/backups/` (conserve 5 derniers). En mode Postgres, une table `app_config_history` garde un historique minimal.

