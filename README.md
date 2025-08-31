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
- Build Command: `npm ci`
- Start Command: `node src/bot.js`
- Ajouter `DATABASE_URL` si Postgres (recommandé). Lancer ensuite `npm run migrate:pg` une fois.
 - Variables d'env:
   - `DISCORD_TOKEN`: token du bot
   - `CLIENT_ID`: application client id
   - `GUILD_ID`: serveur principal (pour `/register`)
   - `PORT`: fourni par Render (serveur HTTP keepalive intégré)
   - `DATABASE_URL` (optionnel): Postgres Render
   - `DATA_DIR` (optionnel, si pas de Postgres): chemin vers un volume monté (ex: `/var/data`)

Persistance
- Si `DATABASE_URL` est défini (et `pg` installée), la config est persistée dans Postgres (table `app_config`). Au premier run, si vide, bootstrap depuis `data/config.json` s'il existe.
- Sinon, la config est lue/écrite sur disque dans `DATA_DIR` (par défaut `./data`). Sur Render, créez un Volume et pointez `DATA_DIR` vers son point de montage.

Restauration
- Avec Postgres: rien à faire, les données sont conservées entre déploiements.
- Sans Postgres: assurez-vous que `DATA_DIR` persiste (Volume) et que `data/config.json` est présent. Le bot crée la structure si absente.

