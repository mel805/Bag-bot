const { REST, Routes, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Log a brief storage mode hint on registration too
try {
  const { paths } = require('./storage/jsonStore');
  console.log('[register] DATA_DIR:', paths.DATA_DIR, 'CONFIG_PATH:', paths.CONFIG_PATH);
} catch (_) {}

// Cache des commandes pour éviter les déploiements inutiles
const COMMANDS_CACHE_FILE = path.join(__dirname, '../.commands-cache.json');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID in environment');
  process.exit(2);
}

// Build /config command - visible to members with ManageGuild by default
const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer le serveur (Staff, AutoKick, Levels)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('adminxp')
    .setDescription('Gestion des niveaux et XP')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption(o => o
      .setName('action')
      .setDescription('Action à effectuer')
      .setRequired(true)
      .addChoices(
        { name: 'addxp', value: 'addxp' },
        { name: 'removexp', value: 'removexp' },
        { name: 'addlevel', value: 'addlevel' },
        { name: 'removelevel', value: 'removelevel' },
        { name: 'setlevel', value: 'setlevel' },
      )
    )
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o => o.setName('valeur').setDescription('Montant XP / Niveau selon action').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('adminkarma')
    .setDescription('Gestion du karma (charme/perversion)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption(o=>o.setName('type').setDescription('Type de karma').setRequired(true).addChoices({name:'charme', value:'charm'},{name:'perversion', value:'perversion'}))
    .addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true).addChoices({name:'ajouter', value:'add'},{name:'retirer', value:'remove'},{name:'définir', value:'set'}))
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('valeur').setDescription('Montant').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder().setName('solde').setDescription('Voir un solde').addUserOption(o=>o.setName('membre').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('travailler').setDescription('Gagner de l\'argent en travaillant').toJSON(),
  new SlashCommandBuilder().setName('daily').setDescription('Réclamer votre récompense quotidienne').toJSON(),
  new SlashCommandBuilder().setName('pêcher').setDescription('Pêcher pour gagner de l\'argent').toJSON(),
  new SlashCommandBuilder().setName('donner').setDescription('Donner de l\'argent à un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)).toJSON(),
  
  new SlashCommandBuilder().setName('voler').setDescription('Tenter de voler un membre').addUserOption(o=>o.setName('membre').setDescription('Cible').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('embrasser').setDescription('Embrasser pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('flirter').setDescription('Flirter pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('séduire').setDescription('Séduire pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('fuck').setDescription('Action perverse 😈').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('sodo').setDescription('Sodomie consentie (RP adulte) 😈').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('branler').setDescription('Branler (RP adulte) 😈').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('doigter').setDescription('Doigter (RP adulte) 😈').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('tirercheveux').setDescription('Tirer les cheveux (NSFW, consensuel)').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder()
    .setName('orgasme')
    .setDescription('Donner un orgasme (NSFW, consensuel) 😈')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('orgie')
    .setDescription('Orgie (NSFW, consensuel) 😈')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('caresser')
    .setDescription('Caresser (NSFW)')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .addStringOption(o=>o
      .setName('zone')
      .setDescription('Zone à caresser (optionnel)')
      .setRequired(false)
      .addChoices(
        { name: 'Sein', value: 'sein' },
        { name: 'Fesses', value: 'fesses' },
        { name: 'Corps', value: 'corps' },
        { name: 'Jambes', value: 'jambes' },
        { name: 'Bite', value: 'bite' },
        { name: 'Pied', value: 'pied' },
        { name: 'Nuque', value: 'nuque' },
        { name: 'Épaule', value: 'épaule' }
      )
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('lécher')
    .setDescription('Lécher pour gagner de la perversion')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .addStringOption(o=>o
      .setName('zone')
      .setDescription('Zone à cibler (optionnel)')
      .setRequired(false)
      .addChoices(
        { name: 'Seins', value: 'seins' },
        { name: 'Chatte', value: 'chatte' },
        { name: 'Cul', value: 'cul' },
        { name: 'Oreille', value: 'oreille' },
        { name: 'Ventre', value: 'ventre' },
        { name: 'Bite', value: 'bite' }
      )
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('lecher')
    .setDescription('Lécher (alias sans accent)')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .addStringOption(o=>o
      .setName('zone')
      .setDescription('Zone à cibler (optionnel)')
      .setRequired(false)
      .addChoices(
        { name: 'Seins', value: 'seins' },
        { name: 'Chatte', value: 'chatte' },
        { name: 'Cul', value: 'cul' },
        { name: 'Oreille', value: 'oreille' },
        { name: 'Ventre', value: 'ventre' },
        { name: 'Bite', value: 'bite' }
      )
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('chatouiller')
    .setDescription('Chatouiller pour gagner du charme')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .addStringOption(o=>o
      .setName('zone')
      .setDescription('Zone à cibler (optionnel)')
      .setRequired(false)
      .addChoices(
        { name: 'Côtes', value: 'côtes' },
        { name: 'Pieds', value: 'pieds' },
        { name: 'Nuque', value: 'nuque' },
        { name: 'Ventre', value: 'ventre' },
        { name: 'Aisselles', value: 'aisselles' }
      )
    )
    .toJSON(),
  new SlashCommandBuilder().setName('réanimer').setDescription('Réanimer un membre (RP secourisme) 🩺').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('reanimer').setDescription('Réanimer (alias sans accent) 🩺').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('réconforter').setDescription('Réconforter avec douceur 🤍').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('reconforter').setDescription('Réconforter (alias sans accent) 🤍').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder()
    .setName('sucer')
    .setDescription('Sucer (RP adulte) 😈')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .addStringOption(o=>o
      .setName('zone')
      .setDescription('Zone à cibler (optionnel)')
      .setRequired(false)
      .addChoices(
        { name: 'Bite', value: 'bite' },
        { name: 'Téton', value: 'téton' },
        { name: 'Oreille', value: 'oreille' }
      )
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mordre')
    .setDescription('Mordre sensuellement (NSFW, consensuel) 😈')
    .addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false))
    .addStringOption(o=>o
      .setName('zone')
      .setDescription('Zone à mordre (optionnel)')
      .setRequired(false)
      .addChoices(
        { name: 'Cou', value: 'cou' },
        { name: 'Lèvres', value: 'lèvres' },
        { name: 'Épaule', value: 'épaule' },
        { name: 'Lobe', value: 'lobe' }
      )
    )
    .toJSON(),
  new SlashCommandBuilder().setName('masser').setDescription('Masser pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('danser').setDescription('Danser pour gagner du charme').addUserOption(o=>o.setName('cible').setDescription('Danser avec (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('boutique').setDescription('Ouvrir la boutique du serveur').toJSON(),
  new SlashCommandBuilder()
    .setName('niveau')
    .setDescription('Voir votre niveau ou celui d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)').setRequired(false))
    .toJSON(),
  // English alias for convenience
  new SlashCommandBuilder()
    .setName('level')
    .setDescription('View your level or another member\'s')
    .addUserOption(o => o.setName('member').setDescription('Member (optional)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Classements')
    .setDMPermission(false)
    .addSubcommand(sc => sc
      .setName('niveau')
      .setDescription('Classement des niveaux')
      .addIntegerOption(o => o.setName('limite').setDescription('Nombre de membres à afficher (1-25)').setRequired(false).setMinValue(1).setMaxValue(25))
    )
    .addSubcommand(sc => sc
      .setName('économie')
      .setDescription('Classement économique')
      .addIntegerOption(o => o.setName('limite').setDescription('Nombre de membres à afficher (1-25)').setRequired(false).setMinValue(1).setMaxValue(25))
    )
    .toJSON(),
  new SlashCommandBuilder().setName('crime').setDescription('Commettre un crime… au risque 😈').addUserOption(o=>o.setName('complice').setDescription('Complice (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder()
    .setName('ajout')
    .setDescription('Administration: ajout de ressources')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sc => sc
      .setName('argent')
      .setDescription('Ajouter de l\'argent à un membre')
      .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o=>o.setName('montant').setDescription('Montant à ajouter').setRequired(true).setMinValue(1))
    )
    .toJSON(),
  // Backward-compatible alias for convenience
  new SlashCommandBuilder()
    .setName('ajoutargent')
    .setDescription('Admin: ajouter de l\'argent à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o=>o.setName('montant').setDescription('Montant à ajouter').setRequired(true).setMinValue(1))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('couleur')
    .setDescription('Attribuer une couleur via sélecteurs (membre ou rôle)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON(),
  new SlashCommandBuilder().setName('actionverite').setDescription('Démarrer Action ou Vérité dans ce salon autorisé').toJSON(),
  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Admin: exporter la configuration complète en JSON')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Admin: restaurer la dernière sauvegarde disponible')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),
  // Hot & Fun — catégorie
  new SlashCommandBuilder().setName('shower').setDescription('Gif douche chaude ou douche froide surprise 🚿').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('wet').setDescription('Ambiance humide, suggestive 💧').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('bed').setDescription('Invitation au lit 😏').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('undress').setDescription('Déshabillage progressif').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  // Domination / Soumission
  new SlashCommandBuilder().setName('collar').setDescription('Poser un collier, gif de soumission 🔗').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('leash').setDescription('Tenir en laisse 🐾').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('kneel').setDescription('Soumission à genoux').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('order').setDescription('Donner un ordre (RP dominant)').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('punish').setDescription('Punition sexy (fessée, corde, etc.)').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  // Séduction & RP doux
  new SlashCommandBuilder().setName('rose').setDescription('Offrir une rose 🌹').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('wine').setDescription('Partager un verre 🍷').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('pillowfight').setDescription('Bataille d’oreillers sexy/fun 🛏️').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('sleep').setDescription('S’endormir dans les bras de quelqu’un 💤').addUserOption(o=>o.setName('cible').setDescription('Membre').setRequired(true)).toJSON(),
  // Délires coquins / Jeux
  new SlashCommandBuilder().setName('oops').setDescription('Gif "oups j’ai glissé" (maladresse sexy)').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('caught').setDescription('Surpris en flagrant délit 👀').addUserOption(o=>o.setName('cible').setDescription('Membre (optionnel)').setRequired(false)).toJSON(),
  // NSFW récit: tromper
  new SlashCommandBuilder().setName('tromper').setDescription('🔞 Tromper — scénario NSFW avec tiers (pertes/gains)').addUserOption(o=>o.setName('cible').setDescription('Membre (victime, optionnel)').setRequired(false)).toJSON(),
  new SlashCommandBuilder()
    .setName('map')
    .setDescription('Définir ou voir votre localisation (ville)')
    .setDMPermission(false)
    .addStringOption(o=>o.setName('ville').setDescription('Votre ville (ex: Paris)').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('proche')
    .setDescription('Voir les membres proches (≤ 200 km) sur une carte')
    .setDMPermission(false)
    .addIntegerOption(o=>o.setName('distance').setDescription('Distance max en km (10-1000)').setRequired(false).setMinValue(10).setMaxValue(1000))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('localisation')
    .setDescription('Admin: voir la localisation des membres (carte ou par membre)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption(o=>o.setName('membre').setDescription('Membre spécifique (optionnel)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Envoyer une confession anonyme')
    .addStringOption(o=>o.setName('texte').setDescription('Votre confession (optionnel)').setRequired(false))
    .addAttachmentOption(o=>o.setName('image').setDescription('Image (optionnel)').setRequired(false))
    .toJSON(),
  // Moderation (staff-only)
  new SlashCommandBuilder().setName('ban').setDescription('Ban un membre').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(false)).toJSON(),
  new SlashCommandBuilder().setName('unban').setDescription('Déban un utilisateur').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o=>o.setName('userid').setDescription('ID utilisateur').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('kick').setDescription('Kick un membre').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('mute').setDescription('Mute un membre (timeout)').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(10080)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('warn').setDescription('Avertir un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).toJSON(),
  new SlashCommandBuilder().setName('masskick').setDescription('Kick en masse par rôle').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addStringOption(o=>o.setName('mode').setDescription('Avec ou sans le rôle').setRequired(true).addChoices({name:'sans_role', value:'without'},{name:'avec_role', value:'with'})).addRoleOption(o=>o.setName('role').setDescription('Rôle cible')).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('massban').setDescription('Ban en masse par rôle').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o=>o.setName('mode').setDescription('Avec ou sans le rôle').setRequired(true).addChoices({name:'sans_role', value:'without'},{name:'avec_role', value:'with'})).addRoleOption(o=>o.setName('role').setDescription('Rôle cible')).addStringOption(o=>o.setName('raison').setDescription('Raison')).toJSON(),
  new SlashCommandBuilder().setName('purge').setDescription('Vider le salon courant (X messages) et réinitialiser les systèmes').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o=>o.setName('nombre').setDescription('Nombre de messages à supprimer (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).toJSON(),
];

// Fonction pour vérifier si les commandes ont changé
function shouldDeployCommands() {
  try {
    const commandsHash = crypto.createHash('md5').update(JSON.stringify(commands)).digest('hex');
    const cache = JSON.parse(fs.readFileSync(COMMANDS_CACHE_FILE, 'utf8'));
    
    // Vérifier si le hash a changé ou si le cache est trop ancien (24h)
    const cacheAge = Date.now() - cache.timestamp;
    const maxCacheAge = 24 * 60 * 60 * 1000; // 24 heures
    
    if (cache.hash !== commandsHash || cacheAge > maxCacheAge) {
      console.log('📝 Commandes modifiées ou cache expiré, déploiement nécessaire');
      return { deploy: true, hash: commandsHash };
    } else {
      console.log('✅ Commandes inchangées, déploiement ignoré (gain de temps)');
      return { deploy: false, hash: commandsHash };
    }
  } catch {
    console.log('📝 Premier déploiement ou cache invalide');
    const commandsHash = crypto.createHash('md5').update(JSON.stringify(commands)).digest('hex');
    return { deploy: true, hash: commandsHash };
  }
}

async function main() {
  const startTime = Date.now();
  const rest = new REST({ version: '10' }).setToken(token);
  
  try {
    const { deploy, hash } = shouldDeployCommands();
    
    if (deploy) {
      console.log('🚀 Registering guild commands...');
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      
      // Sauvegarder le cache
      fs.writeFileSync(COMMANDS_CACHE_FILE, JSON.stringify({
        hash,
        timestamp: Date.now(),
        commandCount: commands.length
      }));
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${commands.length} commands registered for guild ${guildId} (${duration}ms)`);
    } else {
      const duration = Date.now() - startTime;
      console.log(`⚡ Command deployment skipped - no changes detected (${duration}ms)`);
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`❌ Failed to register commands (${duration}ms):`, err?.response?.data || err);
    process.exit(1);
  }
}

main();

