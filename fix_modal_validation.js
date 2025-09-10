const fs = require('fs');

/**
 * Correction du problème de validation des modals pour les récompenses de niveaux
 */

function fixModalValidation() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    console.error('❌ Fichier bot.js introuvable');
    return false;
  }

  let content = fs.readFileSync(botFilePath, 'utf8');
  
  // Problème identifié:
  // Le customId du modal est: `levels_reward_add_modal:${roleId}`
  // Mais le code essaie de récupérer getTextInputValue('roleId') qui n'existe pas
  // Il faut extraire le roleId du customId du modal
  
  const oldModalHandler = `    if (interaction.isModalSubmit() && interaction.customId === 'levels_reward_add_modal') {
      const roleId = interaction.fields.getTextInputValue('roleId');
      const lvl = Number(interaction.fields.getTextInputValue('level'));
      if (!Number.isFinite(lvl) || lvl < 1) return interaction.reply({ content: 'Niveau invalide (>=1).', ephemeral: true });
      const cfg = await getLevelsConfig(interaction.guild.id);
      const rewards = { ...(cfg.rewards || {}) };
      rewards[String(Math.round(lvl))] = roleId;
      await updateLevelsConfig(interaction.guild.id, { rewards });
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLevelsRewardsRows(interaction.guild);
      try { await interaction.editReply({ embeds: [embed], components: [...rows] }); } catch (_) {
        try { await interaction.followUp({ embeds: [embed], components: [...rows], ephemeral: true }); } catch (_) {}
      }
      return;
    }`;

  const newModalHandler = `    if (interaction.isModalSubmit() && interaction.customId.startsWith('levels_reward_add_modal:')) {
      // Extraire le roleId du customId (format: levels_reward_add_modal:roleId)
      const roleId = interaction.customId.split(':')[1];
      const lvl = Number(interaction.fields.getTextInputValue('level'));
      
      if (!roleId) {
        return interaction.reply({ content: '❌ Erreur: ID du rôle manquant.', ephemeral: true });
      }
      
      if (!Number.isFinite(lvl) || lvl < 1) {
        return interaction.reply({ content: '❌ Niveau invalide (doit être >= 1).', ephemeral: true });
      }
      
      try {
        const cfg = await getLevelsConfig(interaction.guild.id);
        const rewards = { ...(cfg.rewards || {}) };
        
        // Vérifier si le niveau est déjà utilisé
        const existingRoleForLevel = rewards[String(Math.round(lvl))];
        if (existingRoleForLevel && existingRoleForLevel !== roleId) {
          const existingRole = interaction.guild.roles.cache.get(existingRoleForLevel);
          return interaction.reply({ 
            content: \`❌ Le niveau \${Math.round(lvl)} est déjà associé au rôle \${existingRole || 'Inconnu'}.\`, 
            ephemeral: true 
          });
        }
        
        // Vérifier si le rôle existe
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          return interaction.reply({ content: '❌ Rôle introuvable.', ephemeral: true });
        }
        
        rewards[String(Math.round(lvl))] = roleId;
        await updateLevelsConfig(interaction.guild.id, { rewards });
        
        try { 
          await interaction.deferReply({ ephemeral: true }); 
        } catch (_) {}
        
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildLevelsRewardsRows(interaction.guild);
        
        try { 
          await interaction.editReply({ embeds: [embed], components: [...rows] }); 
        } catch (_) {
          try { 
            await interaction.followUp({ embeds: [embed], components: [...rows], ephemeral: true }); 
          } catch (_) {}
        }
        
        console.log(\`✅ Récompense niveau configurée: Niveau \${Math.round(lvl)} → Rôle \${role.name} par \${interaction.user.tag}\`);
        
      } catch (error) {
        console.error('❌ Erreur configuration récompense niveau:', error);
        return interaction.reply({ content: '❌ Erreur lors de la configuration.', ephemeral: true });
      }
      
      return;
    }`;

  // Rechercher et remplacer l'ancien gestionnaire de modal
  if (content.includes("interaction.customId === 'levels_reward_add_modal'")) {
    content = content.replace(
      /if \(interaction\.isModalSubmit\(\) && interaction\.customId === 'levels_reward_add_modal'\) \{[\s\S]*?return;\s*\}/,
      newModalHandler.trim()
    );
    
    console.log('✅ Gestionnaire de modal des récompenses corrigé');
  } else {
    console.log('⚠️ Gestionnaire de modal non trouvé avec le pattern exact');
    
    // Essayer de trouver avec un pattern plus large
    const modalPattern = /if \(interaction\.isModalSubmit\(\).*levels_reward_add_modal.*\) \{[\s\S]*?return;\s*\}/;
    if (content.match(modalPattern)) {
      content = content.replace(modalPattern, newModalHandler.trim());
      console.log('✅ Gestionnaire de modal trouvé et corrigé avec pattern large');
    } else {
      console.log('❌ Impossible de trouver le gestionnaire de modal');
      return false;
    }
  }

  // Sauvegarder le fichier modifié
  const backupPath = botFilePath + '.backup-modal-fix';
  fs.copyFileSync(botFilePath, backupPath);
  console.log(`💾 Sauvegarde créée: ${backupPath}`);

  fs.writeFileSync(botFilePath, content);
  console.log('✅ Correction modal appliquée');

  return true;
}

// Vérifier la correction
function verifyModalFix() {
  const botFilePath = './src/bot.js';
  
  if (!fs.existsSync(botFilePath)) {
    return { fixed: false, reason: 'Fichier introuvable' };
  }

  const content = fs.readFileSync(botFilePath, 'utf8');
  
  const checks = {
    hasStartsWith: content.includes("customId.startsWith('levels_reward_add_modal:')"),
    hasSplit: content.includes("customId.split(':')[1]"),
    hasValidation: content.includes("ID du rôle manquant"),
    hasRoleCheck: content.includes("Rôle introuvable")
  };

  const fixed = Object.values(checks).every(Boolean);
  
  return { fixed, checks };
}

// Si exécuté directement
if (require.main === module) {
  console.log('🔧 Correction du problème de validation des modals...\n');
  
  const success = fixModalValidation();
  
  if (success) {
    const verification = verifyModalFix();
    
    console.log('\n🔍 === VÉRIFICATION DE LA CORRECTION ===');
    console.log(`Correction appliquée: ${verification.fixed ? '✅' : '❌'}`);
    
    if (verification.checks) {
      console.log('\nDétails:');
      console.log(`  CustomId startsWith: ${verification.checks.hasStartsWith ? '✅' : '❌'}`);
      console.log(`  Extraction roleId: ${verification.checks.hasSplit ? '✅' : '❌'}`);
      console.log(`  Validation roleId: ${verification.checks.hasValidation ? '✅' : '❌'}`);
      console.log(`  Vérification rôle: ${verification.checks.hasRoleCheck ? '✅' : '❌'}`);
    }
    
    if (verification.fixed) {
      console.log('\n🎉 Correction appliquée avec succès !');
      console.log('\n📋 Problème résolu:');
      console.log('  ✅ Extraction correcte du roleId depuis le customId');
      console.log('  ✅ Validation améliorée des champs');
      console.log('  ✅ Vérification de l\'existence du rôle');
      console.log('  ✅ Gestion des conflits de niveaux');
      console.log('  ✅ Messages d\'erreur explicites');
      console.log('\n📋 Prochaines étapes:');
      console.log('  1. pm2 restart bagbot');
      console.log('  2. Tester /config → Économie → Récompenses');
    } else {
      console.log('❌ Vérification échouée');
      process.exit(1);
    }
  } else {
    console.log('❌ Échec de la correction');
    process.exit(1);
  }
}

module.exports = { fixModalValidation, verifyModalFix };