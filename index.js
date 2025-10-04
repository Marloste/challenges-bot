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

// --- Client with correct intents ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,       // For slash commands
    GatewayIntentBits.GuildMembers  // For role checks
  ]
});

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

// --- Challenge data persistence ---
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

// --- ISO week number ---
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// --- Slash commands ---
const commands = [
  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get your weekly EMS challenge'),
  new SlashCommandBuilder()
    .setName('setupboard')
    .setDescription('Create or move the weekly challenge board to this channel (admin only)')
].map(cmd => cmd.toJSON());

// --- Promo commands ---
const promocommands = [
  {
    name: 'promo',
    description: 'Promo rotation management',
    options: [
      { name: 'current', description: 'See whose turn it is', type: 1 },
      { name: 'next', description: 'Advance to next person', type: 1 },
      { name: 'skip', description: 'Skip the current person', type: 1 },
      { name: 'add', description: 'Add a member to rotation', type: 1,
        options: [{ name: 'user', description: 'The member', type: 6, required: true }] },
      { name: 'remove', description: 'Remove a member from rotation', type: 1,
        options: [{ name: 'user', description: 'The member', type: 6, required: true }] },
      { name: 'setchannel', description: 'Set the promo posting channel', type: 1,
        options: [{ name: 'channel', description: 'Text channel', type: 7, required: true }] },
      { name: 'loa', description: 'Manage LOA', type: 2, options: [
          { name: 'add', description: 'Put a member on LOA', type: 1,
            options: [{ name: 'user', description: 'The member', type: 6, required: true }] },
          { name: 'remove', description: 'Remove a member from LOA', type: 1,
            options: [{ name: 'user', description: 'The member', type: 6, required: true }] }
        ]
      },
      { name: 'list', description: 'Show rotation + LOA', type: 1 }
    ]
  }
];

// --- Discord REST registration ---
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN; // <-- fixed
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [...commands, ...promocommands] },
    );
    console.log('Slash commands registered ✅');
  } catch (error) {
    console.error(error);
  }
})();

// --- EMS challenge helpers ---
function getRankButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('anyone').setLabel('Anyone').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('paramedic').setLabel('Paramedic').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('supervisor').setLabel('Supervisor').setStyle(ButtonStyle.Danger),
    );
}
function getChallengeList(rank) {
  if (rank === 'anyone') return anyoneChallenges;
  if (rank === 'paramedic') return paramedicChallenges;
  if (rank === 'supervisor') return supervisorChallenges;
  return [];
}

// --- Update EMS challenge board ---
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

// --- Weekly reset ---
async function resetWeeklyChallenges() {
  const currentWeek = getWeekNumber();
  for (const userId in challengeData.userChallenges) {
    if (challengeData.userChallenges[userId].week !== currentWeek) delete challengeData.userChallenges[userId];
  }
  saveChallengeData();
  await updateChallengeBoard();
}

// --- Client ready ---
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  loadChallengeData();

  if (!challengeData.boardChannelId) {
    console.log('❗ Challenge board channel not set. Use /setupboard in the desired channel.');
  } else {
    await updateChallengeBoard();
  }

  // Weekly reset at Monday 00:00
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      resetWeeklyChallenges().catch(console.error);
    }
  }, 60000);
});

// --- Interaction handler ---
client.on(Events.InteractionCreate, async interaction => {
  // --- EMS challenge commands ---
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'challenge') {
      if (!challengeData.boardChannelId) {
        challengeData.boardChannelId = interaction.channelId;
        saveChallengeData();
      }
      await interaction.reply({
        content: `🎯 **Choose your rank to get a weekly EMS challenge:**\nYou can only get *one* challenge per week.\n\nPossible rewards: Hall of Fame & GIF perms.\nSend proof in pictures and ping Stan to claim your prize.`,
        components: [getRankButtons()],
        ephemeral: true
      });
    } else if (interaction.commandName === 'setupboard') {
      if (!interaction.member.permissions.has('ManageChannels')) {
        return interaction.reply({ content: '❌ You need Manage Channels permission to use this.', ephemeral: true });
      }
      challengeData.boardChannelId = interaction.channelId;
      saveChallengeData();
      await updateChallengeBoard();
      await interaction.reply({ content: '✅ Challenge board has been set up/updated in this channel.', ephemeral: true });
    }
  }

  // --- EMS challenge buttons ---
  else if (interaction.isButton()) {
    const userId = interaction.user.id;
    const currentWeek = getWeekNumber();

    if (challengeData.userChallenges[userId]?.week === currentWeek) {
      return interaction.reply({ content: '⏳ You already have a challenge this week. Try again next Monday!', ephemeral: true });
    }

    const rank = interaction.customId;
    const challengeList = getChallengeList(rank);
    if (!challengeList.length) return interaction.reply({ content: '❌ Invalid challenge rank selected.', ephemeral: true });

    const challenge = challengeList[Math.floor(Math.random() * challengeList.length)];
    challengeData.userChallenges[userId] = { challenge, week: currentWeek };
    saveChallengeData();

    await interaction.reply({ content: `✅ Your challenge: **${challenge}**\nCheck the challenge board for everyone's challenges!`, ephemeral: true });
    await updateChallengeBoard();
  }

 // --- Promo system (names only, no pings) ---
const DATA_PATH = path.join(__dirname, 'promo.json');

// --- Load / Save promo.json ---
async function loadPromoData() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({
      rotation: [], 
      currentIndex: 0, 
      loa: [], 
      promoChannelId: null, 
      lastWeek: 0 
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

async function savePromoData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// --- Weekly check interval for rotation ---
setInterval(async () => {
  const now = new Date();
  const currentWeek = getWeekNumber();
  const data = await loadPromoData();

  // Check if week changed
  if (data.lastWeek !== currentWeek && data.rotation.length) {
    data.lastWeek = currentWeek;
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;

    if (data.promoChannelId) {
      const channel = await client.channels.fetch(data.promoChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.send(`📢 This week's promo duty: ${data.rotation[data.currentIndex]}`);
      }
    }

    // Move to next person for next week
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    await savePromoData(data);
  }
}, 60 * 1000); // checks every minute

// --- Interaction handler for promo commands ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'promo') return;

  const HC_ROLE_ID = '1266827216931782737';
  const member = interaction.member;

  if (!member.roles.cache.has(HC_ROLE_ID)) {
    return interaction.reply({ content: '❌ This is HC-only.', ephemeral: true });
  }

  const data = await loadPromoData();
  const sub = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);

  // Ensure rotation respects LOA
  data.rotation = data.rotation.filter(name => !data.loa.includes(name));
  if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;

  // --- Commands ---
  if (sub === 'current') {
    if (!data.rotation.length) return interaction.reply('❌ Rotation is empty.');
    return interaction.reply(`📢 It’s ${data.rotation[data.currentIndex]}'s turn for promos.`);
  }

  if (sub === 'next') {
    if (!data.rotation.length) return interaction.reply('❌ Rotation is empty.');
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    await savePromoData(data);
    return interaction.reply(`➡️ Next up: ${data.rotation[data.currentIndex]}.`);
  }

  if (sub === 'skip') {
    if (!data.rotation.length) return interaction.reply('❌ Rotation is empty.');
    const skipped = data.rotation[data.currentIndex];
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    await savePromoData(data);
    return interaction.reply(`⚡ ${skipped} was skipped. Now: ${data.rotation[data.currentIndex]}.`);
  }

  if (sub === 'add') {
    const name = interaction.options.getString('name');
    if (!data.rotation.includes(name) && !data.loa.includes(name)) data.rotation.push(name);
    await savePromoData(data);
    return interaction.reply(`✅ ${name} added to rotation.`);
  }

  if (sub === 'remove') {
    const name = interaction.options.getString('name');
    data.rotation = data.rotation.filter(n => n !== name);
    data.loa = data.loa.filter(n => n !== name);
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
    await savePromoData(data);
    return interaction.reply(`❌ ${name} removed from rotation.`);
  }

  if (group === 'loa') {
    const name = interaction.options.getString('name');
    if (sub === 'add') {
      if (!data.loa.includes(name)) data.loa.push(name);
      data.rotation = data.rotation.filter(n => n !== name);
      if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
      await savePromoData(data);
      return interaction.reply(`🛌 ${name} added to LOA.`);
    }
    if (sub === 'remove') {
      data.loa = data.loa.filter(n => n !== name);
      if (!data.rotation.includes(name)) data.rotation.push(name);
      await savePromoData(data);
      return interaction.reply(`✅ ${name} removed from LOA.`);
    }
  }

  if (sub === 'list') {
    let lines = [];
    if (!data.rotation.length) lines.push('Rotation is empty.');
    else lines = data.rotation.map((n, i) => `${i === data.currentIndex ? '➡️' : `${i + 1}.`} ${n}`);
    const loaList = data.loa.join(', ') || 'None';
    lines.push(`\nLOA: ${loaList}`);
    return interaction.reply(lines.join('\n'));
  }

  if (sub === 'setchannel') {
    const channel = interaction.options.getChannel('channel');
    if (!channel.isTextBased()) return interaction.reply('❌ Must be a text channel.');
    data.promoChannelId = channel.id;
    await savePromoData(data);
    return interaction.reply(`✅ Promo channel set to ${channel}.`);
  }
});

// --- Keep-alive server ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});

// --- Login ---
client.login(token);
