const fs = require('fs');

// Corriger le chemin d'import
const content = fs.readFileSync('./src/bot.js', 'utf8');

const fixedContent = content.replace(
  "const SimpleBackupCommands = require('./simple_backup_commands');",
  "const SimpleBackupCommands = require('./src/simple_backup_commands');"
);

fs.writeFileSync('./src/bot.js', fixedContent);

console.log('✅ Chemin d\'import corrigé');