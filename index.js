require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const express = require('express');
const app = express();

app.listen(8000, () => {
  console.log('✅ Keep-alive server running on port 8000');
});

// === CONFIG ===
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const BOARD_CHANNEL_ID = process.env.BOARD_CHANNEL_ID;

// === CHALLENGES ===
const CHALLENGES = [
  "**Bronze:** Start an IV line and get vitals. That’s it. No treatments, no transport, just make sure it’s clean and logged.",
  "**Silver:** Perform a full trauma assessment on a GSW patient. Include XABCDE, vitals, treatments, and handoff.",
  "**Gold:** Respond to a 10-50 with 3 patients. Prioritize care, delegate to others, and make sure all get to the hospital alive."
];

// === STATE ===
const userCooldowns = new Map(); // userId -> lastClaim timestamp (ms)

// === SLASH COMMANDS ===
const commands = [
  new SlashCommandBuilder().setName('challenge').setDescription('Get your weekly EMS challenge'),
  new SlashCommandBuilder().setName('setupboard').setDescription('Post the challenge board in the current channel')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands
    });
    console.log('✅ Slash commands registered!');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
}

// === BOT READY ===
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  registerCommands();
});

// === INTERACTION HANDLING ===
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;

  if (commandName === 'challenge') {
    const now = Date.now();
    const cooldown = 7 * 24 * 60 * 60 * 1000; // 7 days
    const lastUsed = userCooldowns.get(user.id);

    if (lastUsed && now - lastUsed < cooldown) {
      const remaining = Math.ceil((cooldown - (now - lastUsed)) / (1000 * 60 * 60 * 24));
      await interaction.reply({
        content: `⛔ You already claimed your challenge. Try again in **${remaining} day(s)**.`,
        ephemeral: false
      });
      return;
    }

    userCooldowns.set(user.id, now);

    const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    await interaction.reply({
      content: `🎯 <@${user.id}> your challenge:\n${challenge}`,
      ephemeral: false
    });
  }

  if (commandName === 'setupboard') {
    try {
      const channel = interaction.channel;

      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: '❌ This must be run in a text channel.', ephemeral: true });
        return;
      }

      // Check bot permissions
      const perms = channel.permissionsFor(client.user);
      if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
        await interaction.reply({ content: '❌ I need permission to send messages in this channel.', ephemeral: true });
        return;
      }

      let board = `📋 **Weekly EMS Challenge Board**\n\n`;
      board += CHALLENGES.map((c, i) => `**${i + 1}.** ${c}`).join('\n\n');

      await channel.send(board);
      await interaction.reply({ content: '✅ Board posted!', ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Failed to post board.', ephemeral: true });
    }
  }
});

client.login(TOKEN);
