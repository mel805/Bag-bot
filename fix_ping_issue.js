const fs = require('fs');

// Lire le fichier bot.js
const botPath = './src/bot.js';
let content = fs.readFileSync(botPath, 'utf8');

// Trouver et remplacer la logique de sélection automatique
const oldLogic = `    if (actionsWithTarget.includes(actionKey)) {
      // Only get the target if user actually provided one
      initialPartner = interaction.options.getUser('cible', false);
      // If not provided, auto-pick a random non-bot member (prefer same channel audience)
      if (!initialPartner) {
        try {
          let pick = null;
          // Prefer channel members for relevance
          try {
            const chMembers = interaction.channel?.members?.filter?.(m => !m.user.bot && m.user.id !== interaction.user.id);
            if (chMembers && chMembers.size > 0) {
              const arr = Array.from(chMembers.values());
              pick = arr[Math.floor(Math.random() * arr.length)];
            }
          } catch (_) {}
          // Fallback to guild cache
          if (!pick) {
            const candidates = interaction.guild.members.cache.filter(m => !m.user.bot && m.user.id !== interaction.user.id);
            if (candidates.size > 0) {
              const arr = Array.from(candidates.values());
              pick = arr[Math.floor(Math.random() * arr.length)];
            }
          }
          // Final fallback: attempt a fast fetch of members (requires Member intent)
          if (!pick) {
            try {
              const fetchedAll = await interaction.guild.members.fetch().catch(()=>null);
              if (fetchedAll) {
                const filtered = fetchedAll.filter(m => !m.user.bot && m.user.id !== interaction.user.id);
                if (filtered.size > 0) {
                  const arr = Array.from(filtered.values());
                  pick = arr[Math.floor(Math.random() * arr.length)];
                }
              }
            } catch (_) {}
          }
          if (pick) initialPartner = pick.user;
        } catch (_) {}
      }`;

const newLogic = `    if (actionsWithTarget.includes(actionKey)) {
      // Only get the target if user actually provided one
      initialPartner = interaction.options.getUser('cible', false);
      
      // Auto-pick random partner ONLY for tromper and orgie actions
      if (!initialPartner && (actionKey === 'tromper' || actionKey === 'orgie')) {
        try {
          let pick = null;
          // Prefer channel members for relevance
          try {
            const chMembers = interaction.channel?.members?.filter?.(m => !m.user.bot && m.user.id !== interaction.user.id);
            if (chMembers && chMembers.size > 0) {
              const arr = Array.from(chMembers.values());
              pick = arr[Math.floor(Math.random() * arr.length)];
            }
          } catch (_) {}
          // Fallback to guild cache
          if (!pick) {
            const candidates = interaction.guild.members.cache.filter(m => !m.user.bot && m.user.id !== interaction.user.id);
            if (candidates.size > 0) {
              const arr = Array.from(candidates.values());
              pick = arr[Math.floor(Math.random() * arr.length)];
            }
          }
          // Final fallback: attempt a fast fetch of members (requires Member intent)
          if (!pick) {
            try {
              const fetchedAll = await interaction.guild.members.fetch().catch(()=>null);
              if (fetchedAll) {
                const filtered = fetchedAll.filter(m => !m.user.bot && m.user.id !== interaction.user.id);
                if (filtered.size > 0) {
                  const arr = Array.from(filtered.values());
                  pick = arr[Math.floor(Math.random() * arr.length)];
                }
              }
            } catch (_) {}
          }
          if (pick) initialPartner = pick.user;
        } catch (_) {}
      }`;

// Remplacer le contenu
content = content.replace(oldLogic, newLogic);

// Écrire le fichier modifié
fs.writeFileSync(botPath, content, 'utf8');

console.log('✅ Correction appliquée: Les pings automatiques ne se feront plus que pour tromper et orgie');