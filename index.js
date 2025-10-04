require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { 
  Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  REST, Routes, SlashCommandBuilder
} = require('discord.js');

// --- Client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// --- Challenge data ---
const anyoneChallenges = ["Radio Ready - use 10 radio codes...", "..."];
const paramedicChallenges = ["Medicine Master - use 3 different medications...", "..."];
const supervisorChallenges = ["Supervisor + Switch Roles...", "..."];
const challengeDataFile = path.join(__dirname, 'challengeData.json');
let challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null };

function loadChallengeData() {
  if (fs.existsSync(challengeDataFile)) {
    try { challengeData = JSON.parse(fs.readFileSync(challengeDataFile, 'utf8')); }
    catch (e) { console.error(e); challengeData = { userChallenges: {}, boardChannelId: null, boardMessageId: null }; }
  }
}
function saveChallengeData() { fs.writeFileSync(challengeDataFile, JSON.stringify(challengeData, null, 2)); }

function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

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

// --- Update board ---
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
      if (entry.week === currentWeek) content += `${entry.name || `<@${userId}>`} → **${entry.challenge}**\n`;
    }
  }
  await message.edit(content);
}

async function resetWeeklyChallenges() {
  const currentWeek = getWeekNumber();
  for (const userId in challengeData.userChallenges) {
    if (challengeData.userChallenges[userId].week !== currentWeek) delete challengeData.userChallenges[userId];
  }
  saveChallengeData();
  await updateChallengeBoard();
}

// --- Promo system ---
const PROMO_PATH = path.join(__dirname, 'promo.json');
function loadPromoData() {
  if (!fs.existsSync(PROMO_PATH)) fs.writeFileSync(PROMO_PATH, JSON.stringify({ rotation: [], currentIndex: 0, loa: [], promoChannelId: null, lastWeek: 0 }, null, 2));
  return JSON.parse(fs.readFileSync(PROMO_PATH, 'utf8'));
}
function savePromoData(data) { fs.writeFileSync(PROMO_PATH, JSON.stringify(data, null, 2)); }

setInterval(async () => {
  const now = new Date();
  const currentWeek = getWeekNumber();
  const data = loadPromoData();
  if (data.lastWeek !== currentWeek && data.rotation.length) {
    data.lastWeek = currentWeek;
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;
    if (data.promoChannelId) {
      const channel = await client.channels.fetch(data.promoChannelId).catch(() => null);
      if (channel && channel.isTextBased()) channel.send(`📢 This week's promo duty: ${data.rotation[data.currentIndex]}`);
    }
    data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
    savePromoData(data);
  }
}, 60*1000);

// --- Single InteractionCreate handler ---
client.on(Events.InteractionCreate, async interaction => {
  // --- EMS challenge ---
  if (interaction.isChatInputCommand() && (interaction.commandName === 'challenge' || interaction.commandName === 'setupboard')) {
    if (interaction.commandName === 'challenge') {
      if (!challengeData.boardChannelId) { challengeData.boardChannelId = interaction.channelId; saveChallengeData(); }
      return interaction.reply({ content: `🎯 Choose your rank for this week's EMS challenge.`, components: [getRankButtons()], ephemeral: true });
    }
    if (interaction.commandName === 'setupboard') {
      if (!interaction.member.permissions.has('ManageChannels')) return interaction.reply({ content: '❌ You need Manage Channels permission.', ephemeral: true });
      challengeData.boardChannelId = interaction.channelId;
      saveChallengeData();
      await updateChallengeBoard();
      return interaction.reply({ content: '✅ Challenge board updated.', ephemeral: true });
    }
  }

  // --- EMS challenge buttons ---
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const currentWeek = getWeekNumber();
    if (challengeData.userChallenges[userId]?.week === currentWeek) return interaction.reply({ content: '⏳ Already got a challenge this week.', ephemeral: true });

    const rank = interaction.customId;
    const challengeList = getChallengeList(rank);
    if (!challengeList.length) return interaction.reply({ content: '❌ Invalid rank.', ephemeral: true });

    const challenge = challengeList[Math.floor(Math.random() * challengeList.length)];
    challengeData.userChallenges[userId] = { challenge, week: currentWeek, name: interaction.user.username };
    saveChallengeData();

    await interaction.reply({ content: `✅ Your challenge: **${challenge}**`, ephemeral: true });
    await updateChallengeBoard();
  }

  // --- Promo commands ---
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'promo') return;
  const HC_ROLE_ID = '1266827216931782737';
  if (!interaction.member.roles.cache.has(HC_ROLE_ID)) return interaction.reply({ content: '❌ HC-only.', ephemeral: true });
  const data = loadPromoData();
  const sub = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);

  // filter out LOA from rotation
  data.rotation = data.rotation.filter(name => !data.loa.includes(name));
  if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;

  if (sub === 'current') return interaction.reply(`📢 It’s ${data.rotation[data.currentIndex]}'s turn.`);
  if (sub === 'next') { data.currentIndex = (data.currentIndex + 1) % data.rotation.length; savePromoData(data); return interaction.reply(`➡️ Next: ${data.rotation[data.currentIndex]}.`); }
  if (sub === 'skip') { const skipped = data.rotation[data.currentIndex]; data.currentIndex = (data.currentIndex + 1) % data.rotation.length; savePromoData(data); return interaction.reply(`⚡ ${skipped} skipped. Now: ${data.rotation[data.currentIndex]}.`); }
  if (sub === 'add') { const name = interaction.options.getString('name'); if (!data.rotation.includes(name) && !data.loa.includes(name)) data.rotation.push(name); savePromoData(data); return interaction.reply(`✅ ${name} added.`); }
  if (sub === 'remove') { const name = interaction.options.getString('name'); data.rotation = data.rotation.filter(n => n!==name); data.loa = data.loa.filter(n => n!==name); if (data.currentIndex>=data.rotation.length) data.currentIndex=0; savePromoData(data); return interaction.reply(`❌ ${name} removed.`); }
  if (group === 'loa') {
    const name = interaction.options.getString('name');
    if (sub === 'add') { if (!data.loa.includes(name)) data.loa.push(name); data.rotation=data.rotation.filter(n=>n!==name); if(data.currentIndex>=data.rotation.length)data.currentIndex=0; savePromoData(data); return interaction.reply(`🛌 ${name} added to LOA.`); }
    if (sub === 'remove') { data.loa=data.loa.filter(n=>n!==name); if(!data.rotation.includes(name)) data.rotation.push(name); savePromoData(data); return interaction.reply(`✅ ${name} removed from LOA.`); }
  }
  if (sub === 'list') { const lines = data.rotation.map((n,i)=>i===data.currentIndex?'➡️ '+n:`${i+1}. ${n}`); lines.push(`\nLOA: ${data.loa.join(', ')||'None'}`); return interaction.reply(lines.join('\n')); }
  if (sub === 'setchannel') { const channel=interaction.options.getChannel('channel'); if(!channel.isTextBased()) return interaction.reply('❌ Must be text channel.'); data.promoChannelId=channel.id; savePromoData(data); return interaction.reply(`✅ Promo channel set to ${channel}.`); }
});

// --- Ready ---
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  loadChallengeData();
  if (!challengeData.boardChannelId) console.log('❗ Challenge board channel not set.');
  else await updateChallengeBoard();

  setInterval(() => {
    const now = new Date();
    if (now.getDay()===1 && now.getHours()===0 && now.getMinutes()===0) resetWeeklyChallenges().catch(console.error);
  }, 60000);
});

// --- Keep-alive server ---
const PORT = process.env.PORT || 3000;
http.createServer((req,res)=>{ res.writeHead(200); res.end('OK'); }).listen(PORT,()=>console.log(`✅ Keep-alive server on port ${PORT}`));

// --- Login ---
client.login(process.env.DISCORD_TOKEN);
