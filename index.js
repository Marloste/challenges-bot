require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  Events, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  REST, 
  Routes, 
  SlashCommandBuilder 
} = require('discord.js');

// --- Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// --- Challenge Data ---
const challengeDataFile = path.join(__dirname, 'challengeData.json');
let challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null };
function loadChallengeData() {
  if (fs.existsSync(challengeDataFile)) {
    try {
      challengeData = JSON.parse(fs.readFileSync(challengeDataFile, 'utf8'));
    } catch (e) {
      console.error('Failed to parse challengeData.json:', e);
      challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null };
    }
  }
}
function saveChallengeData() {
  fs.writeFileSync(challengeDataFile, JSON.stringify(challengeData, null, 2));
}

// --- Challenges ---
const anyoneChallenges = [
  "Radio Ready - use 10 radio codes during a single shift.",
  "Field Medic - treat 3 patients back-to-back without returning to station.",
  "Team Player - assist another medic, let them lead.",
  "Do a full workout in the gym.",
  "Get a buddy - convince a friend to try out EMS.",
  "Clean Sweep - clean the entire station & restock your ambulance.",
  "Key Master - get all the keys from HC.",
  "Pitch Perfect - create a suggestion which gets approved.",
  "Roleplay Rockstar - fully RP an entire call with emotion, realism, and depth.",
  "Scene Snapper - take an awesome RP photo during a scene and post it in pictures."
];
const paramedicChallenges = [
  "Medicine Master - use 3 different medications in a single scene.",
  "Shockwave - use an AED.",
  "IV Genius - place 3 IV’s in one shift."
];
const supervisorChallenges = [
  "Supervisor + Switch Roles, allow lower ranks to command a scene, make decisions. (Still supervise so they don’t do anything wrong, you’re still in control.)",
  "Scene Commander - lead a multi-unit call with calm and clarity.",
  "Run it back - recreate a failed call as a training scenario."
];

// --- Week number ---
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// --- Challenge buttons ---
function getRankButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('anyone').setLabel('Anyone').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('paramedic').setLabel('Paramedic').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('supervisor').setLabel('Supervisor').setStyle(ButtonStyle.Danger)
    );
}
function getChallengeList(rank) {
  if (rank === 'anyone') return anyoneChallenges;
  if (rank === 'paramedic') return paramedicChallenges;
  if (rank === 'supervisor') return supervisorChallenges;
  return [];
}

// --- Update challenge board ---
async function updateChallengeBoard() {
  if (!challengeData.boardChannelId) return;
  const channel = await client.channels.fetch(challengeData.boardChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  let message = null;
  if (challengeData.boardMessageId) {
    message = await channel.messages.fetch(challengeData.boardMessageId).catch(() => null);
  }
  if (!message) {
    message = await channel.send('📜 **Weekly EMS Challenges will appear here!**');
    challengeData.boardMessageId = message.id;
    saveChallengeData();
  }

  const currentWeek = getWeekNumber();
  let content = `📜 **Weekly EMS Challenges (Week ${currentWeek})**\n\n`;
  if (Object.keys(challengeData.userChallenges).length === 0) content += '*No challenges assigned yet.*';
  else {
    for (const [userId, entry] of Object.entries(challengeData.userChallenges)) {
      if (entry.week === currentWeek) content += `<@${userId}> → **${entry.challenge}**\n`;
    }
  }
  await message.edit(content);
}

// --- Reset weekly ---
async function resetWeeklyChallenges() {
  const currentWeek = getWeekNumber();
  for (const userId in challengeData.userChallenges) {
    if (challengeData.userChallenges[userId].week !== currentWeek) delete challengeData.userChallenges[userId];
  }
  saveChallengeData();
  await updateChallengeBoard();
}

// --- Promo Data ---
const PROMO_FILE = path.join(__dirname, 'promo.json');
function loadPromoData() {
  if (!fs.existsSync(PROMO_FILE)) {
    fs.writeFileSync(PROMO_FILE, JSON.stringify({
      rotation: [], currentIndex: 0, loa: [], promoChannelId: null, lastWeek: 0
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8'));
}
function savePromoData(data) {
  fs.writeFileSync(PROMO_FILE, JSON.stringify(data, null, 2));
}

// --- Slash Commands ---
const commands = [
  new SlashCommandBuilder().setName('challenge').setDescription('Get your weekly EMS challenge'),
  new SlashCommandBuilder().setName('setupboard').setDescription('Set up the weekly challenge board'),
  new SlashCommandBuilder()
    .setName('promo')
    .setDescription('Manage promo rotation')
    .addSubcommand(sub => sub.setName('current').setDescription('Show current person'))
    .addSubcommand(sub => sub.setName('next').setDescription('Move to next person'))
    .addSubcommand(sub => sub.setName('skip').setDescription('Skip current person'))
    .addSubcommand(sub => sub.setName('add').setDescription('Add a name to rotation').addStringOption(opt => opt.setName('name').setDescription('Name to add').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a name from rotation').addStringOption(opt => opt.setName('name').setDescription('Name to remove').setRequired(true)))
    .addSubcommand(sub => sub.setName('setchannel').setDescription('Set promo channel').addChannelOption(opt => opt.setName('channel').setDescription('Text channel').setRequired(true)))
    .addSubcommandGroup(group =>
      group.setName('loa')
        .setDescription('Manage LOA')
        .addSubcommand(sub => sub.setName('add').setDescription('Add name to LOA').addStringOption(opt => opt.setName('name').setDescription('Name to add to LOA').setRequired(true)))
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove name from LOA').addStringOption(opt => opt.setName('name').setDescription('Name to remove from LOA').setRequired(true)))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('Show rotation and LOA'))
].map(cmd => cmd.toJSON());

// --- Register commands ---
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Slash commands registered ✅');
  } catch (err) { console.error(err); }
})();

// --- Client Ready ---
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  loadChallengeData();
  if (challengeData.boardChannelId) await updateChallengeBoard();

  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      resetWeeklyChallenges().catch(console.error);
    }
  }, 60 * 1000);

  // Weekly promo rotation
  setInterval(async () => {
    const data = loadPromoData();
    const currentWeek = getWeekNumber();
    if (data.lastWeek !== currentWeek && data.rotation.length) {
      data.lastWeek = currentWeek;
      if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
      if (data.promoChannelId) {
        const channel = await client.channels.fetch(data.promoChannelId).catch(() => null);
        if (channel?.isTextBased()) await channel.send(`📢 This week's promo duty: ${data.rotation[data.currentIndex]}`);
      }
      data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
      savePromoData(data);
    }
  }, 60 * 1000);
});

// --- Interaction Handler ---
client.on(Events.InteractionCreate, async interaction => {
  // --- Challenge commands ---
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'challenge') {
      if (!challengeData.boardChannelId) { challengeData.boardChannelId = interaction.channelId; saveChallengeData(); }
      await interaction.reply({ content: '🎯 Choose your rank for a weekly EMS challenge.', components: [getRankButtons()], ephemeral: true });
      return;
    }
    if (interaction.commandName === 'setupboard') {
      if (!interaction.member.permissions.has('ManageChannels')) return interaction.reply({ content: '❌ Manage Channels required', ephemeral: true });
      challengeData.boardChannelId = interaction.channelId;
      saveChallengeData();
      await updateChallengeBoard();
      return interaction.reply({ content: '✅ Challenge board set up!', ephemeral: true });
    }
    // --- Promo commands ---
    if (interaction.commandName === 'promo') {
      const data = loadPromoData();
      const sub = interaction.options.getSubcommand(false);
      const group = interaction.options.getSubcommandGroup(false);
      const name = interaction.options.getString('name');

      // LOA add/remove
      if (group === 'loa') {
        if (sub === 'add') {
          if (!data.loa.includes(name)) data.loa.push(name);
          data.rotation = data.rotation.filter(n => n !== name);
          if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
          savePromoData(data);
          return interaction.reply(`🛌 ${name} added to LOA.`);
        }
        if (sub === 'remove') {
          data.loa = data.loa.filter(n => n !== name);
          if (!data.rotation.includes(name)) data.rotation.push(name);
          savePromoData(data);
          return interaction.reply(`✅ ${name} removed from LOA.`);
        }
      }

      // Other subcommands
      switch (sub) {
        case 'current':
          return interaction.reply(data.rotation.length ? `📢 It’s ${data.rotation[data.currentIndex]}'s turn.` : 'Rotation empty.');
        case 'next':
          if (!data.rotation.length) return interaction.reply('Rotation empty.');
          data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
          savePromoData(data);
          return interaction.reply(`➡️ Next: ${data.rotation[data.currentIndex]}.`);
        case 'skip':
          if (!data.rotation.length) return interaction.reply('Rotation empty.');
          const skipped = data.rotation[data.currentIndex];
          data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
          savePromoData(data);
          return interaction.reply(`⚡ ${skipped} skipped. Now: ${data.rotation[data.currentIndex]}.`);
        case 'add':
          if (!data.rotation.includes(name) && !data.loa.includes(name)) data.rotation.push(name);
          savePromoData(data);
          return interaction.reply(`✅ ${name} added to rotation.`);
        case 'remove':
          data.rotation = data.rotation.filter(n => n !== name);
          data.loa = data.loa.filter(n => n !== name);
          if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
          savePromoData(data);
          return interaction.reply(`❌ ${name} removed from rotation.`);
        case 'setchannel':
          const channel = interaction.options.getChannel('channel');
          if (!channel?.isTextBased()) return interaction.reply('❌ Must be a text channel.');
          data.promoChannelId = channel.id;
          savePromoData(data);
          return interaction.reply(`✅ Promo channel set to ${channel}.`);
        case 'list':
          const rotLines = data.rotation.map((n,i)=>i===data.currentIndex?`➡️ ${n}`:`${i+1}. ${n}`);
          const loaList = data.loa.length ? data.loa.join(', ') : 'None';
          return interaction.reply([...rotLines, `\nLOA: ${loaList}`].join('\n'));
      }
    }
  }

  // --- Challenge buttons ---
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const currentWeek = getWeekNumber();
    if (challengeData.userChallenges[userId]?.week === currentWeek)
      return interaction.reply({ content: '⏳ Already has challenge this week.', ephemeral: true });

    const rank = interaction.customId;
    const challengeList = getChallengeList(rank);
    if (!challengeList.length) return interaction.reply({ content: '❌ Invalid rank.', ephemeral: true });

    const challenge = challengeList[Math.floor(Math.random() * challengeList.length)];
    challengeData.userChallenges[userId] = { challenge, week: currentWeek };
    saveChallengeData();
    await interaction.reply({ content: `✅ Your challenge: **${challenge}**`, ephemeral: true });
    await updateChallengeBoard();
  }
});

// --- Keep-alive server ---
http.createServer((req,res)=>{ res.writeHead(200); res.end('OK'); }).listen(process.env.PORT||3000);

// --- Login ---
client.login(process.env.DISCORD_TOKEN);
