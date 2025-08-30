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

