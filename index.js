// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Challenges for each rank
const anyoneChallenges = [
  "Radio  Ready - use all the 10 radio codes during a single shift.",
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

// Track user weekly usage
const userWeekUsed = new Map();

// Function to get current ISO week number (Monday-based)
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Bot ready
client.once(Events.ClientReady, c => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

// Handle slash command /challenge
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'challenge') {
      const row = new ActionRowBuilder()
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

      await interaction.reply({
        content: '🎯 **Choose your rank to get a challenge (below). You will have until the next week (monday) to complete the challenge. Possbile rewards: Hall of Fame & GIF perms (Maybe in future a new ambulance). Send proof (clip) in #pictures and ping Stan to claim your prize.**',
        components: [row]
      });
    }
  }
});

// Handle button interactions with weekly cooldown
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const currentWeek = getWeekNumber();

  if (userWeekUsed.has(userId) && userWeekUsed.get(userId) === currentWeek) {
    return interaction.reply({
      content: `⏳ You've already used your challenge this week. Try again next Monday!`,
      ephemeral: true
    });
  }

  userWeekUsed.set(userId, currentWeek);

  let challenge;
  if (interaction.customId === 'anyone') {
    challenge = anyoneChallenges[Math.floor(Math.random() * anyoneChallenges.length)];
  } else if (interaction.customId === 'paramedic') {
    challenge = paramedicChallenges[Math.floor(Math.random() * paramedicChallenges.length)];
  } else if (interaction.customId === 'supervisor') {
    challenge = supervisorChallenges[Math.floor(Math.random() * supervisorChallenges.length)];
  }

  if (challenge) {
    await interaction.reply({ content: `✅ **Your Challenge:** ${challenge}`, ephemeral: true });
  }
});
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});


client.login(process.env.TOKEN);

