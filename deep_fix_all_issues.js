const fs = require('fs');

/**
 * Correction profonde de tous les problèmes identifiés
 */

function deepFixAllIssues() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // 1. CORRIGER LE MODAL DES RÉCOMPENSES
  console.log('🔧 Correction du modal des récompenses...');
  
  // Changer la vérification du customId pour inclure les :
  content = content.replace(
    "interaction.customId === 'levels_reward_add_modal'",
    "interaction.customId.startsWith('levels_reward_add_modal:')"
  );
  
  console.log('✅ Vérification du customId modal corrigée');

  // 2. CORRIGER LE PROBLÈME DE PING - Vérifier la logique complète
  console.log('🔧 Analyse du problème de ping...');
  
  // Trouver la ligne qui génère le contenu
  const partsLineIndex = content.indexOf('const parts = [initialPartner ? String(initialPartner) : undefined];');
  
  if (partsLineIndex !== -1) {
    // Remplacer pour que le ping ne soit ajouté que si initialPartner existe ET que c'est une action qui le nécessite
    content = content.replace(
      'const parts = [initialPartner ? String(initialPartner) : undefined];',
      'const parts = [(initialPartner && (actionKey === "tromper" || actionKey === "orgie")) ? String(initialPartner) : undefined];'
    );
    console.log('✅ Logique de ping dans parts corrigée');
  } else {
    console.log('⚠️ Ligne des parts non trouvée');
  }

  // 3. AMÉLIORER LA COMMANDE /backup POUR AVOIR DES EMBEDS
  console.log('🔧 Amélioration de la commande /backup...');
  
  // Trouver l'ancienne commande backup et l'améliorer
  const backupCommandPattern = /\/\/ Enhanced backup command with embeds and logs[\s\S]*?catch \(_\) \{\s*return;\s*\}\s*\}/;
  
  const newBackupCommand = `    // Enhanced backup command with embeds and logs
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        
        await interaction.deferReply({ ephemeral: true });
        
        const startTime = Date.now();
        
        // Créer la sauvegarde avec jsonStore
        const { readConfig, backupNow } = require('./storage/jsonStore');
        const info = await backupNow();
        const cfg = await readConfig();
        
        const duration = Date.now() - startTime;
        const configSize = Math.round(JSON.stringify(cfg).length / 1024);
        const timestamp = new Date().toLocaleString('fr-FR');
        
        // Créer l'embed détaillé
        const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Sauvegarde Forcée Créée')
          .setDescription('Nouvelle sauvegarde générée avec succès')
          .addFields(
            { name: '📅 Horodatage', value: \`\\\`\${timestamp}\\\`\`, inline: true },
            { name: '📋 Taille Config', value: \`\${configSize} KB\`, inline: true },
            { name: '⏱️ Durée', value: \`\${duration}ms\`, inline: true },
            { name: '📁 Sauvegarde Locale', value: info?.local?.success ? '✅ Réussie' : '❌ Échec', inline: true },
            { name: '☁️ Sauvegarde GitHub', value: info?.github?.success ? '✅ Réussie' : '⚠️ Non configuré', inline: true },
            { name: '🔄 Créé par', value: interaction.user.toString(), inline: true }
          )
          .setColor(0x00FF00)
          .setTimestamp()
          .setFooter({ text: 'Sauvegarde manuelle forcée' });

        // Fichier téléchargeable
        const json = Buffer.from(JSON.stringify(cfg, null, 2), 'utf8');
        const attachment = new AttachmentBuilder(json, { name: \`backup-\${Date.now()}.json\` });

        // Envoyer dans les logs si configuré
        try {
          const logsConfig = await getLogsConfig(interaction.guild.id);
          if (logsConfig?.backup?.enabled && logsConfig?.backup?.channel) {
            const logChannel = interaction.guild.channels.cache.get(logsConfig.backup.channel);
            if (logChannel) {
              const logEmbed = new EmbedBuilder()
                .setTitle('📦 Sauvegarde Forcée Créée')
                .setDescription('Sauvegarde manuelle générée via Discord')
                .addFields(
                  { name: '📅 Horodatage', value: timestamp, inline: true },
                  { name: '📋 Taille', value: \`\${configSize} KB\`, inline: true },
                  { name: '⏱️ Durée', value: \`\${duration}ms\`, inline: true },
                  { name: '🔄 Créé par', value: \`\${interaction.user} (\${interaction.user.tag})\`, inline: true },
                  { name: '📊 Statut Local', value: info?.local?.success ? '✅ Réussie' : '❌ Échec', inline: true },
                  { name: '📊 Statut GitHub', value: info?.github?.success ? '✅ Réussie' : '⚠️ Non configuré', inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: \`Backup Discord • ID: \${interaction.id}\` });
              
              await logChannel.send({ embeds: [logEmbed], files: [attachment] });
              console.log('✅ Embed backup envoyé dans les logs');
            }
          }
        } catch (logError) {
          console.log('⚠️ Impossible d\\'envoyer dans les logs:', logError.message);
        }

        // Envoyer la réponse à l'utilisateur
        try {
          await sendDetailedBackupLog(interaction.guild, info, 'slash', interaction.user);
        } catch (_) {}
        
        return interaction.editReply({ 
          embeds: [embed],
          files: [attachment]
        });

      } catch (e) {
        console.error('❌ Erreur backup:', e);
        
        const { EmbedBuilder } = require('discord.js');
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erreur de Sauvegarde')
          .setDescription('Échec de la création de sauvegarde')
          .addFields(
            { name: '🔍 Erreur', value: \`\\\`\${e?.message || e}\\\`\`, inline: false },
            { name: '🔄 Demandé par', value: interaction.user.toString(), inline: true },
            { name: '📅 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
          )
          .setColor(0xFF0000)
          .setTimestamp();

        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const errorInfo = {
            local: { success: false, error: String(e?.message || e) },
            github: { success: false, configured: false, error: 'Échec avant sauvegarde' },
            details: { timestamp: new Date().toISOString() }
          };
          await sendDetailedBackupLog(interaction.guild, errorInfo, 'slash', interaction.user);
        } catch (_) {}
        
        try { 
          return await interaction.editReply({ embeds: [errorEmbed] }); 
        } catch (_) { 
          try { 
            return await interaction.followUp({ content: 'Erreur export.', ephemeral: true }); 
          } catch (_) { 
            return; 
          } 
        }
      }
    }`;

  // Remplacer l'ancienne commande backup
  if (content.match(backupCommandPattern)) {
    content = content.replace(backupCommandPattern, newBackupCommand);
    console.log('✅ Commande /backup améliorée avec embeds');
  } else {
    console.log('⚠️ Pattern de commande backup non trouvé, recherche alternative...');
    
    // Essayer de trouver une autre pattern
    const simplePattern = /if \(interaction\.isChatInputCommand\(\) && interaction\.commandName === 'backup'\) \{[\s\S]*?try \{[\s\S]*?return;[\s\S]*?\}\s*\}/;
    if (content.match(simplePattern)) {
      content = content.replace(simplePattern, newBackupCommand);
      console.log('✅ Commande /backup trouvée et améliorée');
    } else {
      console.log('❌ Impossible de trouver la commande backup');
    }
  }

  // 4. Sauvegarder et écrire
  const backupPath = botFilePath + '.backup-deep-fix';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Corrections profondes appliquées');

  return true;
}

// Vérifier les corrections
function verifyDeepFix() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    return false;
  }

  const content = fs.readFileSync(botFilePath, 'utf8');
  
  console.log('\n🔍 === VÉRIFICATION DES CORRECTIONS PROFONDES ===');
  
  // Vérifier modal
  const modalFix = content.includes("customId.startsWith('levels_reward_add_modal:')");
  console.log(`Modal récompenses: ${modalFix ? '✅' : '❌'}`);
  
  // Vérifier ping fix
  const pingFix = content.includes('actionKey === "tromper" || actionKey === "orgie"');
  console.log(`Ping fix dans parts: ${pingFix ? '✅' : '❌'}`);
  
  // Vérifier backup embed
  const backupEmbed = content.includes('Sauvegarde Forcée Créée');
  console.log(`Backup avec embed: ${backupEmbed ? '✅' : '❌'}`);
  
  return modalFix && pingFix && backupEmbed;
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Correction profonde de tous les problèmes...\n');
  
  const success = deepFixAllIssues();
  
  if (success) {
    const verified = verifyDeepFix();
    
    if (verified) {
      console.log('\n🎉 Toutes les corrections profondes appliquées avec succès !');
      console.log('\n📋 Problèmes résolus:');
      console.log('  ✅ Modal récompenses: customId.startsWith corrigé');
      console.log('  ✅ Pings: Seulement pour tromper/orgie dans parts');
      console.log('  ✅ /backup: Embeds détaillés avec logs');
      console.log('\n📋 Prochaines étapes:');
      console.log('  1. pm2 restart bagbot');
      console.log('  2. Tester /config → récompenses');
      console.log('  3. Tester actions sans cible');
      console.log('  4. Tester /backup');
    } else {
      console.log('❌ Vérification échouée');
      process.exit(1);
    }
  } else {
    console.log('❌ Échec des corrections');
    process.exit(1);
  }
}

module.exports = { deepFixAllIssues, verifyDeepFix };