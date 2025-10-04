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

// --- Challenges (unchanged) ---
const anyoneChallenges = [ /* ... */ ];
const paramedicChallenges = [ /* ... */ ];
const supervisorChallenges = [ /* ... */ ];

// --- Challenge data ---
const challengeDataFile = path.join(__dirname, 'challengeData.json');
let challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null };
function loadChallengeData() {
  if (fs.existsSync(challengeDataFile)) {
    try {
      challengeData = JSON.parse(fs.readFileSync(challengeDataFile, 'utf8'));
    } catch { challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null }; }
  }
}
function saveChallengeData() { fs.writeFileSync(challengeDataFile, JSON.stringify(challengeData, null, 2)); }

// --- Week number ---
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// --- Slash commands ---
const commands = [
  new SlashCommandBuilder().setName('challenge').setDescription('Get your weekly EMS challenge'),
  new SlashCommandBuilder().setName('setupboard').setDescription('Setup weekly challenge board')
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
        options: [{ name: 'name', description: 'Member name', type: 3, required: true }] },
      { name: 'remove', description: 'Remove a member from rotation', type: 1,
        options: [{ name: 'name', description: 'Member name', type: 3, required: true }] },
      { name: 'setchannel', description: 'Set the promo posting channel', type: 1,
        options: [{ name: 'channel', description: 'Text channel', type: 7, required: true }] },
      { name: 'loa', description: 'Manage LOA', type: 2, options: [
          { name: 'add', description: 'Put a member on LOA', type: 1,
            options: [{ name: 'name', description: 'Member name', type: 3, required: true }] },
          { name: 'remove', description: 'Remove a member from LOA', type: 1,
            options: [{ name: 'name', description: 'Member name', type: 3, required: true }] }
        ]
      },
      { name: 'list', description: 'Show rotation + LOA', type: 1 }
    ]
  }
];

// --- Discord REST registration ---
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [...commands, ...promocommands] });
    console.log('Slash commands registered ✅');
  } catch (error) { console.error(error); }
})();

// --- EMS challenge helpers ---
function getRankButtons() { /* ... unchanged ... */ }
function getChallengeList(rank) { /* ... unchanged ... */ }
async function updateChallengeBoard() { /* ... unchanged ... */ }
async function resetWeeklyChallenges() { /* ... unchanged ... */ }

// --- Client ready ---
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  loadChallengeData();
  if (challengeData.boardChannelId) await updateChallengeBoard();
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) resetWeeklyChallenges().catch(console.error);
  }, 60000);
});

// --- Interaction handler for EMS ---
client.on(Events.InteractionCreate, async interaction => { /* ... EMS challenge handler unchanged ... */ });

// --- Promo system ---
const PROMO_PATH = path.join(__dirname, 'promo.json');
function loadPromoData() {
  if (!fs.existsSync(PROMO_PATH)) fs.writeFileSync(PROMO_PATH, JSON.stringify({ rotation: [], currentIndex: 0, loa: [], promoChannelId: null, lastWeek: 0 }, null, 2));
  return JSON.parse(fs.readFileSync(PROMO_PATH, 'utf8'));
}
function savePromoData(data) { fs.writeFileSync(PROMO_PATH, JSON.stringify(data, null, 2)); }

// --- Weekly check interval for promo rotation ---
setInterval(async () => {
  const now = new Date();
  const currentWeek = getWeekNumber();
  const data = loadPromoData();
  if (data.lastWeek !== currentWeek && data.rotation.length) {
    data.lastWeek = currentWeek;
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
    if (data.promoChannelId) {
      const channel = await client.channels.fetch(data.promoChannelId).catch(() => null);
      if (channel && channel.isTextBased()) await channel.send(`📢 This week's promo duty: ${data.rotation[data.currentIndex]}`);
    }
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    savePromoData(data);
  }
}, 60000);

// --- Interaction handler for promo ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'promo') return;
  const HC_ROLE_ID = '1266827216931782737';
  if (!interaction.member.roles.cache.has(HC_ROLE_ID)) return interaction.reply({ content: '❌ This is HC-only.', ephemeral: true });

  const data = loadPromoData();
  const sub = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);

  // Ensure rotation respects LOA
  data.rotation = data.rotation.filter(n => !data.loa.includes(n));
  if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;

  // --- Commands ---
  if (sub === 'current') return interaction.reply(`📢 It’s ${data.rotation[data.currentIndex] || 'Nobody'}'s turn for promos.`);
  if (sub === 'next') {
    if (!data.rotation.length) return interaction.reply('❌ Rotation is empty.');
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    savePromoData(data);
    return interaction.reply(`➡️ Next up: ${data.rotation[data.currentIndex]}`);
  }
  if (sub === 'skip') {
    if (!data.rotation.length) return interaction.reply('❌ Rotation is empty.');
    const skipped = data.rotation[data.currentIndex];
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    savePromoData(data);
    return interaction.reply(`⚡ ${skipped} was skipped. Now: ${data.rotation[data.currentIndex]}`);
  }
  if (sub === 'add') {
    const name = interaction.options.getString('name');
    if (!data.rotation.includes(name) && !data.loa.includes(name)) data.rotation.push(name);
    savePromoData(data);
    return interaction.reply(`✅ ${name} added to rotation.`);
  }
  if (sub === 'remove') {
    const name = interaction.options.getString('name');
    data.rotation = data.rotation.filter(n => n !== name);
    data.loa = data.loa.filter(n => n !== name);
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
    savePromoData(data);
    return interaction.reply(`❌ ${name} removed from rotation.`);
  }
  if (group === 'loa') {
    const name = interaction.options.getString('name');
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
  if (sub === 'list') {
    let lines = [];
    if (!data.rotation.length) lines.push('Rotation is empty.');
    else lines = data.rotation.map((n, i) => `${i === data.currentIndex ? '➡️' : i + 1}. ${n}`);
    const loaList = data.loa.length ? data.loa.join(', ') : 'None';
    lines.push(`\nLOA: ${loaList}`);
    return interaction.reply(lines.join('\n'));
  }
  if (sub === 'setchannel') {
    const channel = interaction.options.getChannel('channel');
    if (!channel.isTextBased()) return interaction.reply('❌ Must be a text channel.');
    data.promoChannelId = channel.id;
    savePromoData(data);
    return interaction.reply(`✅ Promo channel set to ${channel}.`);
  }
});

// --- Minimal keep-alive server ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('OK'); }).listen(PORT, () => console.log(`✅ Keep-alive server running on port ${PORT}`));

// --- Login ---
client.login(token);
