// Script pour nettoyer le fichier bot.js et supprimer toutes les logiques complexes

const fs = require('fs');

let content = fs.readFileSync('/workspace/bot.js', 'utf8');

// Supprimer toutes les logiques complexes d'actions
const actionsToSimplify = [
  'lick', 'suck', 'nibble', 'branler', 'doigter', 'fuck', 'sodo', 'orgasme',
  'hairpull', 'shower', 'bed', 'collar', 'leash', 'kneel', 'order', 
  'punish', 'undress', 'touche', 'reveiller', 'douche'
];

// Supprimer tous les blocs if (actionKey === 'action') complexes
actionsToSimplify.forEach(action => {
  const regex = new RegExp(`\\s*if \\(actionKey === '${action}'\\) \\{[\\s\\S]*?^\\s*\\}`, 'm');
  content = content.replace(regex, '');
});

// Nettoyer les doubles espaces et lignes vides
content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

fs.writeFileSync('/workspace/bot_cleaned.js', content);
console.log('✅ Fichier nettoyé créé : bot_cleaned.js');