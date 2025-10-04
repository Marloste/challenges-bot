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
  intents: [GatewayIntentBits.Guilds]
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

// --- Challenge Data ---
const challengeDataFile = path.join(__dirname, 'challengeData.json');
let challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null };
function loadChallengeData() {
  if (fs.existsSync(challengeDataFile)) {
    try { challengeData = JSON.parse(fs.readFileSync(challengeDataFile, 'utf8')); }
    catch { challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null }; }
  }
}
function saveChallengeData() {
  fs.writeFileSync(challengeDataFile, JSON.stringify(challengeData, null, 2));
}

// --- Week Number ---
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// --- Slash commands ---
const commands = [
  new SlashCommandBuilder().setName('challenge').setDescription('Get your weekly EMS challenge'),
  new SlashCommandBuilder().setName('setupboard').setDescription('Create/move weekly challenge board')
].map(c => c.toJSON());

// --- Promo system ---
const PROMO_PATH = path.join(__dirname, 'promo.json');
async function loadPromoData() {
  if (!fs.existsSync(PROMO_PATH)) {
    fs.writeFileSync(PROMO_PATH, JSON.stringify({
      rotation: [],
      currentIndex: 0,
      loa: [],
      promoChannelId: null,
      lastWeek: 0
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(PROMO_PATH, 'utf8'));
}
async function savePromoData(data) {
  fs.writeFileSync(PROMO_PATH, JSON.stringify(data, null, 2));
}

// --- Register slash commands ---
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✅ Slash commands registered');
  } catch (error) { console.error(error); }
})();

// --- Challenge board ---
async function updateChallengeBoard() {
  if (!challengeData.boardChannelId) return;
  const channel = await client.channels.fetch(challengeData.boardChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

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
  if (challengeData.boardChannelId) await updateChallengeBoard();

  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      resetWeeklyChallenges().catch(console.error);
    }
  }, 60000);
});

// --- Interaction handler ---
client.on(Events.InteractionCreate, async interaction => {
  // --- Challenge commands ---
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'challenge') {
      if (!challengeData.boardChannelId) {
        challengeData.boardChannelId = interaction.channelId;
        saveChallengeData();
      }
      await interaction.reply({
        content: `🎯 **Choose your rank to get a weekly EMS challenge.**`,
        ephemeral: true
      });
    } else if (interaction.commandName === 'setupboard') {
      if (!interaction.member.permissions.has('ManageChannels')) return interaction.reply({ content: '❌ You need Manage Channels permission.', ephemeral: true });
      challengeData.boardChannelId = interaction.channelId;
      saveChallengeData();
      await updateChallengeBoard();
      await interaction.reply({ content: '✅ Challenge board set/updated.', ephemeral: true });
    } else if (interaction.commandName === 'promo') {
      const data = await loadPromoData();
      const sub = interaction.options.getSubcommand(false);
      const group = interaction.options.getSubcommandGroup(false);

      // --- LOA commands ---
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
          if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
          await savePromoData(data);
          return interaction.reply(`✅ ${name} removed from LOA.`);
        }
      }

      // --- Add/Remove rotation names ---
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

      // --- List ---
      if (sub === 'list') {
        const lines = data.rotation.length
          ? data.rotation.map((n,i) => `${i===data.currentIndex?'➡️':`${i+1}.`} ${n}`)
          : ['Rotation is empty.'];
        lines.push(`\nLOA: ${data.loa.length ? data.loa.join(', ') : 'None'}`);
        return interaction.reply(lines.join('\n'));
      }

      // --- Set channel ---
      if (sub === 'setchannel') {
        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) return interaction.reply('❌ Must be a text channel.');
        data.promoChannelId = channel.id;
        await savePromoData(data);
        return interaction.reply(`✅ Promo channel set to ${channel}.`);
      }
    }
  }
});

// --- Weekly promo rotation ---
setInterval(async () => {
  const now = new Date();
  const currentWeek = getWeekNumber();
  const data = await loadPromoData();

  if (data.lastWeek !== currentWeek && data.rotation.length) {
    data.lastWeek = currentWeek;
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
    if (data.promoChannelId) {
      const channel = await client.channels.fetch(data.promoChannelId).catch(()=>null);
      if (channel?.isTextBased()) await channel.send(`📢 This week's promo duty: ${data.rotation[data.currentIndex]}`);
    }
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    await savePromoData(data);
  }
}, 60*1000);

// --- Keep-alive ---
const PORT = process.env.PORT || 3000;
http.createServer((req,res)=>{ res.writeHead(200); res.end('OK'); }).listen(PORT);

// --- Login ---
client.login(token);

