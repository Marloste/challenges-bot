require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');

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
  "Supervisor + Switch Roles, allow lower ranks to command a scene, make decisions. (Still supervise so they don’t do anything wrong, you’re still in control.)",
  "Scene Commander - lead a multi-unit call with calm and clarity.",
  "Run it back - recreate a failed call as a training scenario."
];

// --- Data storage setup ---
const dataFile = path.join(__dirname, 'challengeData.json');
let data = { userChallenges: {}, boardMessageId: null, boardChannelId: null };

// Load data from file or create new file
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

// --- Utility: get ISO week number ---
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil(((d - yearStart) / 86400000 + 1)/7);
}

// --- Slash command registration ---
const commands = [
  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get a weekly EMS challenge based on your rank')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(client.user?.id || 'your_client_id_here'), // Replace or dynamically set after login
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

// --- Challenge board message creator/updater ---
async function updateChallengeBoard() {
  if (!data.boardChannelId) return; // no channel saved yet

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
  for (const [userId, challenge] of Object.entries(data.userChallenges)) {
    content += `<@${userId}> → **${challenge}**\n`;
  }

  await message.edit(content);
}

// --- Button row for challenge selection ---
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

// --- Map customId to challenge list ---
function getChallengeList(rankId) {
  if (rankId === 'anyone') return anyoneChallenges;
  if (rankId === 'paramedic') return paramedicChallenges;
  if (rankId === 'supervisor') return supervisorChallenges;
  return [];
}

// --- Bot ready event ---
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  loadData();

  // If we don't have a saved challenge board channel ID, ask you to set it
  if (!data.boardChannelId) {
    console.log('❗ Challenge board channel not set yet.');
    // You need to set this manually or via command
  } else {
    await updateChallengeBoard();
  }

  // Register slash commands now that we have client.user.id
  await registerCommands();

  // Weekly reset checker (runs every minute)
  setInterval(async () => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      // Monday 00:00 reset
      data.userChallenges = {};
      saveData();
      console.log('♻️ Weekly challenges reset.');
      await updateChallengeBoard();
    }
  }, 60000);
});

// --- Slash command handler ---
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'challenge') {
      // Save the channel where board should be
      if (!data.boardChannelId) {
        data.boardChannelId = interaction.channelId;
        saveData();
        console.log(`📌 Set challenge board channel to ${interaction.channelId}`);
      }

      await interaction.reply({
        content: `🎯 **Choose your rank to get a challenge (below). You will have until next Monday to complete it!**
Possible rewards: Hall of Fame & GIF perms (maybe a new ambulance soon).
Send proof (clip) in pictures and ping Stan to claim your prize.`,
        components: [getChallengeButtons()]
      });
    }
  }
});

// --- Button interaction handler ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const currentWeek = getWeekNumber();

  // Check if user already has a challenge this week
  if (data.userChallenges[userId]?.week === currentWeek) {
    return interaction.reply({
      content: `⏳ You've already claimed your challenge this week. Try again next Monday!`,
      ephemeral: true
    });
  }

  const rankId = interaction.customId;
  const challengeList = getChallengeList(rankId);

  if (!challengeList.length) {
    return interaction.reply({ content: `❌ Unknown challenge rank.`, ephemeral: true });
  }

  // Pick random challenge
  const challenge = challengeList[Math.floor(Math.random() * challengeList.length)];

  // Save challenge with week
  data.userChallenges[userId] = { challenge, week: currentWeek };
  saveData();

  await interaction.reply({
    content: `✅ Your challenge: **${challenge}**\n(Check the pinned challenge board for everyone's challenges.)`,
    ephemeral: true
  });

  await updateChallengeBoard();
});

// --- Keep-alive minimal HTTP server ---
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  loadData();

  // FORCE the board to create if not present
  if (!data.boardChannelId) {
    data.boardChannelId = "1397666374918344755"; // replace with the channel ID
    saveData();
    console.log(`📌 Force-set challenge board channel to ${data.boardChannelId}`);
  }

  await updateChallengeBoard();
  await registerCommands();

  // Weekly reset remains unchanged
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


client.login(process.env.TOKEN);

