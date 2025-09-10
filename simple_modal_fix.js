const fs = require('fs');

// Correction simple et sûre du modal
const content = fs.readFileSync('./src/bot.js', 'utf8');

// Remplacer seulement la ligne problématique
const fixedContent = content.replace(
  "const roleId = interaction.fields.getTextInputValue('roleId');",
  "const roleId = interaction.customId.split(':')[1];"
);

// Sauvegarder
fs.copyFileSync('./src/bot.js', './src/bot.js.backup-before-simple-fix');
fs.writeFileSync('./src/bot.js', fixedContent);

console.log('✅ Correction simple appliquée');
console.log('💾 Sauvegarde créée: ./src/bot.js.backup-before-simple-fix');