// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Challenges for each rank
const cadetChallenges = [
  "Find 3 pieces of EMS equipment in under 30 seconds.",
  "Explain the ABCs to someone in VC.",
  "Do 10 jumping jacks before answering the next question."
];

const emtChallenges = [
  "Describe how to treat a GSW in 30 seconds.",
  "Name 3 causes of hypoxia.",
  "Explain SAMPLE history without looking at notes."
];

const paramedicChallenges = [
  "Explain how to calculate a drug dosage (ALS level).",
  "List 3 signs of a tension pneumothorax.",
  "Name 2 IV meds and their indications."
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
            .setCustomId('cadet')
            .setLabel('Cadet Challenge')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('emt')
            .setLabel('EMT Challenge')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('paramedic')
            .setLabel('Paramedic Challenge')
            .setStyle(ButtonStyle.Danger),
        );

      await interaction.reply({
        content: '🎯 **Choose your rank to get a challenge:**',
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
  if (interaction.customId === 'cadet') {
    challenge = cadetChallenges[Math.floor(Math.random() * cadetChallenges.length)];
  } else if (interaction.customId === 'emt') {
    challenge = emtChallenges[Math.floor(Math.random() * emtChallenges.length)];
  } else if (interaction.customId === 'paramedic') {
    challenge = paramedicChallenges[Math.floor(Math.random() * paramedicChallenges.length)];
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

