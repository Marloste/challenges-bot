require('dotenv').config();
const { Client, GatewayIntentBits, Collection, SlashCommandBuilder, REST, Routes, PermissionsBitField } = require('discord.js');
const express = require('express');
const app = express();

// Required ENV variables
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const boardChannelIdStore = new Map(); // In-memory, or swap with DB if persistent
const userChallengeTracker = new Map(); // Tracks weekly participation

// Start web server for Koyeb keep-alive
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(8000, () => console.log('✅ Keep-alive server running on port 8000'));

// Commands
const commands = [
  new SlashCommandBuilder()
    .setName('setupboard')
    .setDescription('Set this channel as the EMS challenge board'),

  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get your weekly EMS challenge')
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// Register commands
async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands.map(cmd => cmd.toJSON())
    });
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
}

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, channel } = interaction;

  if (commandName === 'setupboard') {
    // Check for Manage Channels permission
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return await interaction.reply({ content: '❌ You need Manage Channels permission to use this command.', ephemeral: true });
    }

    boardChannelIdStore.set(interaction.guildId, channel.id);
    await interaction.reply({ content: `✅ This channel is now set as the EMS Challenge Board.`, ephemeral: true });

    try {
      await channel.send('📜 **Weekly EMS Challenges will appear here!**');
    } catch (err) {
      console.error(err);
    }

  } else if (commandName === 'challenge') {
    const boardChannelId = boardChannelIdStore.get(interaction.guildId);
    if (!boardChannelId) {
      return await interaction.reply({ content: '❗ Board channel not set. Use `/setupboard` first.', ephemeral: true });
    }

    const userKey = `${interaction.guildId}-${user.id}`;
    const currentWeek = getCurrentWeek();

    if (userChallengeTracker.get(userKey) === currentWeek) {
      return await interaction.reply({ content: '⛔ You have already claimed your challenge for this week!', ephemeral: true });
    }

    userChallengeTracker.set(userKey, currentWeek);

    // Example challenge (you can expand this)
    const challenge = getRandomChallenge();

    // Send the challenge to the board
    const boardChannel = await client.channels.fetch(boardChannelId);
    await boardChannel.send(`🎯 <@${user.id}> has claimed their weekly challenge: **${challenge}**`);

    // Confirm to the user
    await interaction.reply({ content: `✅ Your challenge has been posted to <#${boardChannelId}>!`, ephemeral: true });
  }
});

// Get current ISO week string
function getCurrentWeek() {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const numberOfDays = Math.floor((now - oneJan) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((now.getDay() + 1 + numberOfDays) / 7);
  return `${now.getFullYear()}-W${week}`;
}

// Sample static challenges
function getRandomChallenge() {
  const challenges = [
    'Run 5km in under 30 minutes',
    'Complete 50 pushups',
    'Stretch for 15 minutes every day this week',
    'Drink 2L of water every day',
    'Take a 30-minute walk outdoors daily',
    'Log your meals for the week',
    'No junk food for 7 days'
  ];
  return challenges[Math.floor(Math.random() * challenges.length)];
}

// Log in
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

registerCommands();
client.login(DISCORD_TOKEN);
// --- Login ---
client.login(process.env.TOKEN);
