# Changelog

## 0.1.2
- **BREAKING**: Système musique complètement supprimé (Lavalink, kazagumo, shoukaku)
- Suppression des commandes musique (/play, /skip, /pause, /stop, /queue, /volume, etc.)
- Nettoyage des dépendances et fichiers de configuration musique
- Bot allégé et plus simple à déployer

## 0.1.1
- Postgres storage with JSONB + automatic bootstrap from data/config.json
- Economy: karma rules (shop/actions/grants) with UI; GIF manager; suites privées
- Booster perks: XP xN (texte/vocal), cooldown xN, boutique xN (configurable)
- Levels: premium certified card layout; fixed /niveau (defer on Render)
- Logs, moderation, confessions, action/vérité improvements
- Render fixes: no build step; lockfile sync; optional yt-dlp proxy