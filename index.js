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
  SlashCommandBuilder,
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Challenge lists
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
  "Supervisor + Switch Roles, allow lower ranks to command a scene, make decisions. (Still supervise so they don’t do anything wrong, you’re still in control.)",
  "Scene Commander - lead a multi-unit call with calm and clarity.",
  "Run it back - recreate a failed call as a training scenario."
];

// Data storage
const dataFile = path.join(__dirname, 'challengeData.json');
let data = { userChallenges: {}, boardMessageId: null, boardChannelId: null };

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

// ISO week number (Monday based)
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('setupboard')
    .setDescription('Setup the weekly challenge board'),
  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get your weekly EMS challenge')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error(error);
  }
}

// Update or create the challenge board message
async function updateChallengeBoard() {
  if (!data.boardChannelId) return;

  let channel;
  try {
    channel = await client.channels.fetch(data.boardChannelId);
  } catch (e) {
    console.error(`❌ Could not fetch channel ${data.boardChannelId}:`, e.message);
    return;
  }

  if (!channel || !channel.isTextBased()) {
    console.error(`❌ Channel ${data.boardChannelId} is not text-based or unavailable.`);
    return;
  }

  let message;
  if (data.boardMessageId) {
    try {
      message = await channel.messages.fetch(data.boardMessageId);
    } catch (e) {
      console.error(`❌ Could not fetch message ${data.boardMessageId} in channel ${data.boardChannelId}:`, e.message);
    }
  }

  if (!message) {
    try {
      message = await channel.send('📜 **Weekly EMS Challenges will appear here!**');
      data.boardMessageId = message.id;
      saveData();
    } catch (e) {
      console.error(`❌ Could not send challenge board message in channel ${data.boardChannelId}:`, e.message);
      return;
    }
  }

  if (Object.keys(data.userChallenges).length === 0) {
    await message.edit('📜 **No challenges assigned this week yet.**');
    return;
  }

  let content = '📜 **Current Weekly Challenges:**\n\n';
  for (const [userId, challengeObj] of Object.entries(data.userChallenges)) {
    content += `<@${userId}> → **${challengeObj.challenge}**\n`;
  }

  await message.edit(content);
}


// Buttons for ranks
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
        .setStyle(ButtonStyle.Danger),
    );
}

function getChallengeList(rankId) {
  if (rankId === 'anyone') return anyoneChallenges;
  if (rankId === 'paramedic') return paramedicChallenges;
  if (rankId === 'supervisor') return supervisorChallenges;
  return [];
}

// On bot ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  loadData();

  await registerCommands();

  if (data.boardChannelId && data.boardMessageId) {
    await updateChallengeBoard();
  }

  // Weekly reset at Monday 00:00 server time
  setInterval(async () => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      data.userChallenges = {};
      saveData();
      console.log('♻️ Weekly challenges reset.');
      await updateChallengeBoard();
    }
  }, 60000);
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setupboard') {
    const channel = await client.channels.fetch(interaction.channelId);
    const message = await channel.send('📜 **Weekly EMS Challenges will appear here!**');

    data.boardChannelId = channel.id;
    data.boardMessageId = message.id;
    saveData();

    await interaction.reply({ content: '✅ Challenge board set up!', ephemeral: true });
    await updateChallengeBoard();
  }

  if (interaction.commandName === 'challenge') {
    await interaction.reply({
      content: `🎯 **Choose your rank to get a challenge (below). You will have until next Monday to complete it!**
Possible rewards: Hall of Fame & GIF perms (maybe a new ambulance soon).
Send proof (clip) in pictures and ping Stan to claim your prize.`,
      components: [getChallengeButtons()],
      ephemeral: true
    });
  }
});

// Handle button clicks
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

  const rankId = interaction.customId;
  const challenges = getChallengeList(rankId);
  if (!challenges.length) {
    return interaction.reply({ content: `❌ Unknown challenge rank.`, ephemeral: true });
  }

  const challenge = challenges[Math.floor(Math.random() * challenges.length)];
  data.userChallenges[userId] = { challenge, week: currentWeek };
  saveData();

  await interaction.reply({
    content: `✅ Your challenge: **${challenge}**\n(Check the pinned challenge board for everyone's challenges.)`,
    ephemeral: true
  });

  await updateChallengeBoard();
});

// Keep-alive HTTP server (for hosting on Koyeb or similar)
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});

client.login(process.env.TOKEN);
