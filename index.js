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
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// --- EMS Challenges ---
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
  new SlashCommandBuilder().setName('challenge').setDescription('Get your weekly EMS challenge'),
  new SlashCommandBuilder().setName('setupboard').setDescription('Create or move the weekly challenge board to this channel (admin only)')
].map(cmd => cmd.toJSON());

// --- Promo commands ---
const promoCommands = [
  new SlashCommandBuilder()
    .setName('promo')
    .setDescription('Promo rotation management')
    .addSubcommand(sub => sub.setName('current').setDescription('See whose turn it is'))
    .addSubcommand(sub => sub.setName('next').setDescription('Advance to next person'))
    .addSubcommand(sub => sub.setName('skip').setDescription('Skip the current person'))
    .addSubcommand(sub => sub.setName('add')
      .setDescription('Add a name to rotation')
      .addStringOption(opt => opt.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove')
      .setDescription('Remove a name from rotation')
      .addStringOption(opt => opt.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('Show rotation + LOA'))
    .addSubcommand(sub => sub.setName('setchannel')
      .setDescription('Set the promo posting channel')
      .addChannelOption(opt => opt.setName('channel').setDescription('Text channel').setRequired(true)))
    .addSubcommandGroup(group => group.setName('loa').setDescription('Manage LOA')
      .addSubcommand(sub => sub.setName('add').setDescription('Add a name to LOA')
        .addStringOption(opt => opt.setName('name').setDescription('Name').setRequired(true)))
      .addSubcommand(sub => sub.setName('remove').setDescription('Remove a name from LOA')
        .addStringOption(opt => opt.setName('name').setDescription('Name').setRequired(true))))
].map(cmd => cmd.toJSON());

// --- Discord REST registration ---
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [...commands, ...promoCommands] });
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
      new ButtonBuilder().setCustomId('supervisor').setLabel('Supervisor').setStyle(ButtonStyle.Danger)
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
  if (!Object.keys(challengeData.userChallenges).length) content += '*No challenges assigned yet.*';
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

  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      resetWeeklyChallenges().catch(console.error);
    }
  }, 60000);
});

// --- Interaction handler ---
client.on(Events.InteractionCreate, async interaction => {
  // --- EMS challenges ---
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'challenge') {
      if (!challengeData.boardChannelId) {
        challengeData.boardChannelId = interaction.channelId;
        saveChallengeData();
      }
      await interaction.reply({
        content: `🎯 **Choose your rank to get a weekly EMS challenge:**\nYou can only get *one* challenge per week.\n\nRewards: Hall of Fame & GIF perms.\nSend proof in pictures and ping Stan to claim your prize.`,
        components: [getRankButtons()],
        ephemeral: true
      });
    } else if (interaction.commandName === 'setupboard') {
      if (!interaction.member.permissions.has('ManageChannels')) return interaction.reply({ content: '❌ You need Manage Channels permission.', ephemeral: true });
      challengeData.boardChannelId = interaction.channelId;
      saveChallengeData();
      await updateChallengeBoard();
      await interaction.reply({ content: '✅ Challenge board set up/updated.', ephemeral: true });
    }
  }

  // --- EMS buttons ---
  else if (interaction.isButton()) {
    const userId = interaction.user.id;
    const currentWeek = getWeekNumber();
    if (challengeData.userChallenges[userId]?.week === currentWeek) {
      return interaction.reply({ content: '⏳ You already have a challenge this week.', ephemeral: true });
    }

    const rank = interaction.customId;
    const challengeList = getChallengeList(rank);
    if (!challengeList.length) return interaction.reply({ content: '❌ Invalid challenge rank.', ephemeral: true });

    const challenge = challengeList[Math.floor(Math.random() * challengeList.length)];
    challengeData.userChallenges[userId] = { challenge, week: currentWeek };
    saveChallengeData();
    await interaction.reply({ content: `✅ Your challenge: **${challenge}**`, ephemeral: true });
    await updateChallengeBoard();
  }

  // --- Promo system ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'promo') {
    const HC_ROLE_ID = '1266827216931782737';
    if (!interaction.member.roles.cache.has(HC_ROLE_ID)) return interaction.reply({ content: '❌ HC only.', ephemeral: true });

    const data = JSON.parse(fs.readFileSync(path.join(__dirname,'promo.json'),'utf8'));
    const sub = interaction.options.getSubcommand(false);
    const group = interaction.options.getSubcommandGroup(false);

    // Ensure rotation respects LOA
    data.rotation = data.rotation.filter(n => !data.loa.includes(n));
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;

    const name = interaction.options.getString('name');

    // --- Subcommands ---
    if (sub === 'current') return interaction.reply(`📢 It’s ${data.rotation[data.currentIndex] || 'N/A'}'s turn.`);
    if (sub === 'next') { data.currentIndex = (data.currentIndex + 1) % data.rotation.length; fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2)); return interaction.reply(`➡️ Next: ${data.rotation[data.currentIndex]}`); }
    if (sub === 'skip') { const skipped = data.rotation[data.currentIndex]; data.currentIndex = (data.currentIndex + 1) % data.rotation.length; fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2)); return interaction.reply(`⚡ ${skipped} skipped. Now: ${data.rotation[data.currentIndex]}`); }
    if (sub === 'add') { if (name && !data.rotation.includes(name) && !data.loa.includes(name)) data.rotation.push(name); fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2)); return interaction.reply(`✅ ${name} added.`); }
    if (sub === 'remove') { data.rotation = data.rotation.filter(n => n !== name); data.loa = data.loa.filter(n => n !== name); if (data.currentIndex >= data.rotation.length) data.currentIndex=0; fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2)); return interaction.reply(`❌ ${name} removed.`); }
    if (group === 'loa') { 
      if (sub === 'add') { if (!data.loa.includes(name)) data.loa.push(name); data.rotation = data.rotation.filter(n => n !== name); fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2)); return interaction.reply(`🛌 ${name} added to LOA.`); }
      if (sub === 'remove') { data.loa = data.loa.filter(n => n !== name); if (!data.rotation.includes(name)) data.rotation.push(name); fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2)); return interaction.reply(`✅ ${name} removed from LOA.`); }
    }
    if (sub === 'list') { const lines = data.rotation.map((n,i)=>`${i===data.currentIndex?'➡️':i+1}. ${n}`); lines.push(`\nLOA: ${data.loa.join(', ')||'None'}`); return interaction.reply(lines.join('\n')); }
    if (sub === 'setchannel') { const channel = interaction.options.getChannel('channel'); if (!channel.isTextBased()) return interaction.reply('❌ Must be text channel.'); data.promoChannelId = channel.id; fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2)); return interaction.reply(`✅ Promo channel set to ${channel}.`);}
  }
});

// --- Weekly promo rotation check ---
setInterval(async () => {
  const now = new Date();
  const currentWeek = getWeekNumber();
  const data = JSON.parse(fs.readFileSync(path.join(__dirname,'promo.json'),'utf8'));
  if (data.lastWeek !== currentWeek && data.rotation.length) {
    data.lastWeek = currentWeek;
    if (data.currentIndex >= data.rotation.length) data.currentIndex=0;
    if (data.promoChannelId) {
      const channel = await client.channels.fetch(data.promoChannelId).catch(()=>null);
      if(channel && channel.isTextBased()) await channel.send(`📢 This week's promo duty: ${data.rotation[data.currentIndex]}`);
    }
    data.currentIndex = (data.currentIndex +1)%data.rotation.length;
    fs.writeFileSync(path.join(__dirname,'promo.json'), JSON.stringify(data,null,2));
  }
}, 60*1000);

// --- Keep-alive server ---
http.createServer((req, res) => { res.writeHead(200); res.end('OK'); }).listen(process.env.PORT||3000,()=>console.log('✅ Keep-alive server running'));

// --- Login ---
client.login(token);
