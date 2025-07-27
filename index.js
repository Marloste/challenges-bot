// index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- Your challenge lists ---
const anyoneChallenges = [
  "Radio Ready - use all 10 radio codes during a single shift.",
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
  "Supervisor + Switch Roles - allow lower ranks to command a scene, make decisions. (Still supervise!)",
  "Scene Commander - lead a multi-unit call with calm and clarity.",
  "Run it back - recreate a failed call as a training scenario."
];

// --- Data storage ---
const dataFile = path.join(__dirname, 'challengeData.json');
let data = { userChallenges: {}, boardMessageId: null, boardChannelId: "1397666374918344755" }; // ✅ your channel ID here

function loadData() {
  if (fs.existsSync(dataFile)) {
    try {
      data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch {
      console.log("⚠️ Failed to parse data file, starting fresh.");
    }
  }
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// --- Week number ---
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
    .setDescription('Get a weekly EMS challenge based on your rank'),
  new SlashCommandBuilder()
    .setName('setupboard')
    .setDescription('Set up or reset the weekly challenge board')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// --- Update challenge board ---
async function updateChallengeBoard() {
  if (!data.boardChannelId) return;
  const channel = await client.channels.fetch(data.boardChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  let message;
  if (data.boardMessageId) {
    message = await channel.messages.fetch(data.boardMessageId).catch(() => null);
  }
  if (!message) {
    message = await channel.send('📜 **Weekly EMS Challenges will appear here!**');
    data.boardMessageId = message.id;
    saveData();
  }

  if (Object.keys(data.userChallenges).length === 0) {
    await message.edit('📜 **No challenges assigned this week yet.**');
    return;
  }

  let content = '📜 **Current Weekly Challenges:**\n\n';
  for (const [userId, info] of Object.entries(data.userChallenges)) {
    content += `<@${userId}> → **${info.challenge}**\n`;
  }

  await message.edit(content);
}

// --- Buttons ---
function getChallengeButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('anyone')
        .setLabel('Anyone Challenge')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('paramedic')
        .setLabel('Paramedic Challenge')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('supervisor')
        .setLabel('Supervisor Challenge')
        .setStyle(ButtonStyle.Danger)
    );
}

function getChallengeList(rankId) {
  if (rankId === 'anyone') return anyoneChallenges;
  if (rankId === 'paramedic') return paramedicChallenges;
  if (rankId === 'supervisor') return supervisorChallenges;
  return [];
}

// --- Ready event ---
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  loadData();
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  await updateChallengeBoard();

  // Weekly reset every Monday 00:00
  setInterval(async () => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      data.userChallenges = {};
      saveData();
      console.log("♻️ Weekly challenges reset.");
      await updateChallengeBoard();
    }
  }, 60000);
});

// --- Slash command handler ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'challenge') {
    await interaction.reply({
      content: `🎯 **Choose your rank to get a challenge (below). You will have until next Monday to complete it!**
Possible rewards: Hall of Fame & GIF perms (maybe a new ambulance soon).
Send proof (clip) in pictures and ping Stan to claim your prize.`,
      components: [getChallengeButtons()]
    });
  }

  if (interaction.commandName === 'setupboard') {
    data.boardChannelId = interaction.channelId;
    const boardMessage = await interaction.channel.send("📜 **Weekly EMS Challenges will appear here!**");
    data.boardMessageId = boardMessage.id;
    saveData();
    await interaction.reply({ content: "✅ Challenge board set up!", ephemeral: true });
    await updateChallengeBoard();
  }
});

// --- Button handler ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;
  const currentWeek = getWeekNumber();

  if (data.userChallenges[userId]?.week === currentWeek) {
    return interaction.reply({
      content: `⏳ You've already claimed your challenge this week. Try again next Monday!`,
      ephemeral: true
    });
  }

  const challengeList = getChallengeList(interaction.customId);
  const challenge = challengeList[Math.floor(Math.random() * challengeList.length)];

  data.userChallenges[userId] = { challenge, week: currentWeek };
  saveData();

  await interaction.reply({
    content: `✅ Your challenge: **${challenge}** (Check the challenge board anytime!)`,
    ephemeral: true
  });

  await updateChallengeBoard();
});

// --- Keep alive ---
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => console.log(`✅ Keep-alive server running on port ${PORT}`));

client.login(process.env.TOKEN);
