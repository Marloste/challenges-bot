require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- Challenges for each rank ---
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

// --- Data persistence ---
const dataFile = path.join(__dirname, 'challengeData.json');
let data = { userChallenges: {}, boardChannelId: null, boardMessageId: null };

function loadData() {
  if (fs.existsSync(dataFile)) {
    try {
      data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch (e) {
      console.error('Failed to parse challengeData.json:', e);
      data = { userChallenges: {}, boardChannelId: null, boardMessageId: null };
    }
  }
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// --- Utility: get ISO week number (Monday based) ---
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// --- Slash commands definition ---
const commands = [
  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get your weekly EMS challenge'),
  new SlashCommandBuilder()
    .setName('setupboard')
    .setDescription('Create or move the weekly challenge board to this channel (admin only)')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands(clientId, guildId) {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// --- Helper: get buttons for ranks ---
function getRankButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('anyone').setLabel('Anyone').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('paramedic').setLabel('Paramedic').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('supervisor').setLabel('Supervisor').setStyle(ButtonStyle.Danger),
    );
}

// --- Helper: get challenge list by rank ---
function getChallengeList(rank) {
  if (rank === 'anyone') return anyoneChallenges;
  if (rank === 'paramedic') return paramedicChallenges;
  if (rank === 'supervisor') return supervisorChallenges;
  return [];
}

// --- Update or create the challenge board message ---
async function updateChallengeBoard() {
  if (!data.boardChannelId) {
    console.log('No challenge board channel set, skipping update.');
    return;
  }
  const channel = await client.channels.fetch(data.boardChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.log('Challenge board channel invalid or inaccessible.');
    return;
  }

  let message = null;
  if (data.boardMessageId) {
    message = await channel.messages.fetch(data.boardMessageId).catch(() => null);
  }

  if (!message) {
    message = await channel.send('📜 **Weekly EMS Challenges will appear here!**');
    data.boardMessageId = message.id;
    saveData();
  }

  const currentWeek = getWeekNumber();
  let content = `📜 **Weekly EMS Challenges (Week ${currentWeek})**\n\n`;

  if (Object.keys(data.userChallenges).length === 0) {
    content += '*No challenges assigned yet.*';
  } else {
    for (const [userId, entry] of Object.entries(data.userChallenges)) {
      if (entry.week === currentWeek) {
        content += `<@${userId}> → **${entry.challenge}**\n`;
      }
    }
  }

  await message.edit(content);
  console.log('Challenge board updated.');
}

// --- Weekly reset function ---
async function resetWeeklyChallenges() {
  const currentWeek = getWeekNumber();
  // Remove old weeks' challenges
  for (const userId in data.userChallenges) {
    if (data.userChallenges[userId].week !== currentWeek) {
      delete data.userChallenges[userId];
    }
  }
  saveData();
  await updateChallengeBoard();
  console.log('Weekly challenges reset.');
}

// --- Client ready event ---
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  loadData();

  if (!data.boardChannelId) {
    console.log('❗ Challenge board channel not set. Use /setupboard in the desired channel.');
  } else {
    await updateChallengeBoard();
  }

  // Register slash commands for your guild only (for faster testing)
  await registerCommands(client.user.id, process.env.GUILD_ID);

  // Reset weekly challenges every minute check
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      resetWeeklyChallenges().catch(console.error);
    }
  }, 60000);
});

// --- Interaction handler ---
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'challenge') {
      if (!data.boardChannelId) {
        // Save the channel where the board will be created
        data.boardChannelId = interaction.channelId;
        saveData();
        console.log(`Set challenge board channel to ${interaction.channelId}`);
      }

      await interaction.reply({
        content: `🎯 **Choose your rank to get a weekly EMS challenge:**\nYou can only get *one* challenge per week.\n\nPossible rewards: Hall of Fame & GIF perms.\nSend proof in pictures and ping Stan to claim your prize.`,
        components: [getRankButtons()],
        ephemeral: true
      });
    } else if (interaction.commandName === 'setupboard') {
      // Check admin permissions
      if (!interaction.member.permissions.has('ManageChannels')) {
        return interaction.reply({ content: '❌ You need Manage Channels permission to use this.', ephemeral: true });
      }
      data.boardChannelId = interaction.channelId;
      saveData();

      // Create or update board message
      const channel = await client.channels.fetch(data.boardChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({ content: '❌ Invalid channel.', ephemeral: true });
      }

      let message = null;
      if (data.boardMessageId) {
        message = await channel.messages.fetch(data.boardMessageId).catch(() => null);
      }
      if (!message) {
        message = await channel.send('📜 **Weekly EMS Challenges will appear here!**');
        data.boardMessageId = message.id;
        saveData();
      }

      await updateChallengeBoard();

      await interaction.reply({ content: '✅ Challenge board has been set up/updated in this channel.', ephemeral: true });
    }
  } else if (interaction.isButton()) {
    const userId = interaction.user.id;
    const currentWeek = getWeekNumber();

    if (data.userChallenges[userId]?.week === currentWeek) {
      return interaction.reply({ content: '⏳ You already have a challenge this week. Try again next Monday!', ephemeral: true });
    }

    const rank = interaction.customId;
    const challengeList = getChallengeList(rank);
    if (!challengeList.length) {
      return interaction.reply({ content: '❌ Invalid challenge rank selected.', ephemeral: true });
    }

    const challenge = challengeList[Math.floor(Math.random() * challengeList.length)];
    data.userChallenges[userId] = { challenge, week: currentWeek };
    saveData();

    await interaction.reply({ content: `✅ Your challenge: **${challenge}**\nCheck the challenge board for everyone's challenges!`, ephemeral: true });

    await updateChallengeBoard();
  }
});

// --- Minimal keep-alive HTTP server ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});


// Hardcoded HC role
const HC_ROLE_ID = '1266827216931782737';
const DATA_PATH = path.join(__dirname, '..', 'data', 'promo.json');

async function ensureDataFile() {
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify({ rotation: [], currentIndex: 0, loa: [] }, null, 2));
  }
}

async function loadData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

async function saveData(data) {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
}

function mention(id) {
  return `<@${id}>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promo')
    .setDescription('Manage promo duty rotation (HC only)')
    .addSubcommand(s => s.setName('current').setDescription('Show who is up for promos'))
    .addSubcommand(s => s.setName('next').setDescription('Advance to next person'))
    .addSubcommand(s => s.setName('skip').setDescription('Skip the current person'))
    .addSubcommand(s => s.setName('list').setDescription('Show full rotation and LOA list'))
    .addSubcommandGroup(g => g.setName('loa').setDescription('Manage leave of absence')
      .addSubcommand(s => s.setName('add').setDescription('Add a member to LOA')
        .addUserOption(o => o.setName('user').setDescription('User to put on LOA').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a member from LOA')
        .addUserOption(o => o.setName('user').setDescription('User to remove from LOA').setRequired(true)))),

  async execute(interaction) {
    const member = interaction.member;
    if (!member.roles.cache.has(HC_ROLE_ID)) {
      return interaction.reply({ content: 'This is HC-only.', ephemeral: true });
    }

    const data = await loadData();
    const guild = interaction.guild;

    // Build rotation based on HC role, minus LOA
    const role = guild.roles.cache.get(HC_ROLE_ID);
    const hcMembers = Array.from(role.members.keys());
    const allowed = hcMembers.filter(id => !data.loa.includes(id));

    // Sync order
    data.rotation = data.rotation.filter(id => allowed.includes(id));
    for (const id of allowed) {
      if (!data.rotation.includes(id)) data.rotation.push(id);
    }
    if (!allowed.length) data.currentIndex = 0;
    if (data.currentIndex >= data.rotation.length) data.currentIndex = 0;

    const sub = interaction.options.getSubcommand(false);
    const group = interaction.options.getSubcommandGroup(false);

    // --- Commands ---
    if (sub === 'current') {
      if (!data.rotation.length) return interaction.reply('No one available in rotation.');
      return interaction.reply(`It’s ${mention(data.rotation[data.currentIndex])}’s turn for promos.`);
    }

    if (sub === 'next') {
      if (!data.rotation.length) return interaction.reply('Rotation is empty.');
      data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
      await saveData(data);
      return interaction.reply(`Next up: ${mention(data.rotation[data.currentIndex])}.`);
    }

    if (sub === 'skip') {
      if (!data.rotation.length) return interaction.reply('Rotation is empty.');
      const skipped = data.rotation[data.currentIndex];
      data.currentIndex = (data.currentIndex + 1) % data.rotation.length;
      await saveData(data);
      return interaction.reply(`${mention(skipped)} was skipped. Now: ${mention(data.rotation[data.currentIndex])}.`);
    }

    if (group === 'loa') {
      const user = interaction.options.getUser('user');
      if (sub === 'add') {
        if (!data.loa.includes(user.id)) data.loa.push(user.id);
        if (data.rotation.includes(user.id)) {
          const idx = data.rotation.indexOf(user.id);
          data.rotation.splice(idx, 1);
          if (idx <= data.currentIndex && data.currentIndex > 0) data.currentIndex--;
        }
        await saveData(data);
        return interaction.reply(`${mention(user.id)} added to LOA.`);
      }
      if (sub === 'remove') {
        data.loa = data.loa.filter(id => id !== user.id);
        if (!data.rotation.includes(user.id) && guild.members.cache.has(user.id)) {
          data.rotation.push(user.id);
        }
        await saveData(data);
        return interaction.reply(`${mention(user.id)} removed from LOA.`);
      }
    }

    if (sub === 'list') {
      let lines = [];
      if (!data.rotation.length) {
        lines.push('Rotation is empty.');
      } else {
        lines = data.rotation.map((id, i) =>
          `${i === data.currentIndex ? '➡️' : `${i + 1}.`} ${mention(id)}`
        );
      }
      const loaList = data.loa.map(id => mention(id)).join(', ') || 'None';
      lines.push(`\nLOA: ${loaList}`);
      return interaction.reply(lines.join('\n'));
    }
  }
};

const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json'); // adjust if you store differently

const commands = [
  {
    name: 'promo',
    description: 'Promo rotation management',
    options: [
      { name: 'current', description: 'See whose turn it is', type: 1 },
      { name: 'next', description: 'Advance to the next person', type: 1 },
      { name: 'skip', description: 'Skip the current person', type: 1 },
      { name: 'loa', description: 'Manage LOA list', type: 2, options: [
          { name: 'add', description: 'Put a member on LOA', type: 1,
            options: [{ name: 'user', description: 'The member', type: 6, required: true }] },
          { name: 'remove', description: 'Remove a member from LOA', type: 1,
            options: [{ name: 'user', description: 'The member', type: 6, required: true }] },
        ]
      },
      { name: 'list', description: 'Show the rotation + LOA list', type: 1 },
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );
    console.log('Slash commands registered ✅');
  } catch (error) {
    console.error(error);
  }
})();

// --- Login ---
client.login(process.env.TOKEN);



