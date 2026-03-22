require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1482387616224514178';
const GUILD_ID = '1357532018832969888';
const VOICE_CHANNEL_ID = '1482400389814030378';

const INVITE_DATA_FILE = path.join(__dirname, 'inviteData.json');
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

// Invite tracker
const inviteUses = new Map();   // guildId => Map(inviteCode, uses)
const inviteCounts = new Map(); // guildId => Map(userId, count)

function loadInviteData() {
  try {
    const raw = fs.readFileSync(INVITE_DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    for (const [guildId, userCounts] of Object.entries(data)) {
      inviteCounts.set(guildId, new Map(Object.entries(userCounts).map(([k, v]) => [k, v])));
    }
    console.log('📂 Invite data loaded from inviteData.json');
  } catch {
    console.log('📂 No existing invite data found, starting fresh.');
  }
}

function saveInviteData() {
  try {
    const data = {};
    for (const [guildId, userMap] of inviteCounts.entries()) {
      data[guildId] = Object.fromEntries(userMap);
    }
    fs.writeFileSync(INVITE_DATA_FILE, JSON.stringify(data, null, 2));
    console.log('💾 Invite data saved to inviteData.json');
  } catch (error) {
    console.error('❌ Failed to save invite data:', error.message);
  }
}

loadInviteData();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all bot commands'),

  new SlashCommandBuilder()
    .setName('a')
    .setDescription('Call Nightmare system'),

  new SlashCommandBuilder()
    .setName('nightmare')
    .setDescription('Nightmare system greeting'),

  new SlashCommandBuilder()
    .setName('testwelcome')
    .setDescription('Test the welcome DM'),

  new SlashCommandBuilder()
    .setName('sendwelcomeall')
    .setDescription('Send welcome DM to all members'),

  new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Show invite count')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to check')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('inviteleaderboard')
    .setDescription('Show top inviters'),

  new SlashCommandBuilder()
    .setName('nm-join')
    .setDescription('Make Nightmare join the main voice channel again')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Slash command registration error:', error);
  }
})();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();

    invites.forEach(invite => {
      map.set(invite.code, invite.uses || 0);
    });

    inviteUses.set(guild.id, map);

    if (!inviteCounts.has(guild.id)) {
      inviteCounts.set(guild.id, new Map());
    }

    console.log(`📦 Cached invites for ${guild.name}`);
  } catch (error) {
    console.error(`❌ Failed to cache invites for ${guild.name}:`, error.message);
  }
}

async function joinNightmareVoice() {
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);

    if (!channel || channel.type !== ChannelType.GuildVoice) {
      console.log('❌ Voice channel not found or not a voice channel.');
      return false;
    }

    const oldConnection = getVoiceConnection(channel.guild.id);
    if (oldConnection) {
      try {
        oldConnection.destroy();
      } catch {}
    }

    joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfMute: true,
      selfDeaf: true
    });

    console.log(`🎧 Joined voice channel: ${channel.name}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to join voice channel:', error);
    return false;
  }
}

client.once('clientReady', async () => {
  try {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild);
    }

    await joinNightmareVoice();

    client.user.setPresence({
      status: 'dnd',
      activities: [{
        name: 'Nightmare Server',
        type: ActivityType.Watching
      }]
    });

    setInterval(() => {
      saveInviteData();
      console.log('⏰ Auto-save triggered (24h interval)');
    }, AUTO_SAVE_INTERVAL_MS);
    console.log('⏰ Auto-save scheduled every 24 hours');
  } catch (error) {
    console.error('Startup error:', error);
  }
});

client.on('inviteCreate', async invite => {
  const guildMap = inviteUses.get(invite.guild.id) || new Map();
  guildMap.set(invite.code, invite.uses || 0);
  inviteUses.set(invite.guild.id, guildMap);
});

client.on('inviteDelete', async invite => {
  const guildMap = inviteUses.get(invite.guild.id);
  if (guildMap) {
    guildMap.delete(invite.code);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('🌙 Nightmare Bot Commands')
      .setDescription('Here are the available commands:')
      .addFields(
        { name: '🆘 /help', value: 'Show all commands', inline: false },
        { name: '👁️ /a', value: 'Check if the Nightmare system is active', inline: false },
        { name: '🌙 /nightmare', value: 'Nightmare system greeting message', inline: false },
        { name: '📩 /testwelcome', value: 'Test the welcome DM message', inline: false },
        { name: '📨 /sendwelcomeall', value: 'Send welcome DM to all members', inline: false },
        { name: '📨 /invites', value: 'Check how many people a user invited', inline: false },
        { name: '🏆 /inviteleaderboard', value: 'Show top inviters in the server', inline: false },
        { name: '🎧 /nm-join', value: 'Make Nightmare join the main voice channel again', inline: false }
      )
      .setFooter({ text: 'Nightmare System • Made by ILYAS' })
      .setTimestamp();

    await interaction.reply({ embeds: [helpEmbed] });
    return;
  }

  if (interaction.commandName === 'a') {
    await interaction.reply({
      content: '👁️ **Hello Nightmares**\nThe Nightmare system is active and watching the server.\n\n— System created by **ILYAS**'
    });
    return;
  }

  if (interaction.commandName === 'nightmare') {
    await interaction.reply({
      content: '🌙 **Nightmare Core Online**\nSilent system active 24/7.\nMonitoring the server from the shadows.\n\n⚙️ Created by **ILYAS**'
    });
    return;
  }

  if (interaction.commandName === 'testwelcome') {
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('🌙 Welcome to Nightmare')
      .setDescription(
`Hey ${interaction.user},

Welcome to **Nightmare Server**.

This community is packed with amazing people, daily activities, and exclusive perks.

Be sure to check out the rules, introduce yourself, and jump into the fun.

If you need help, just ask — staff and members are happy to assist!`
      )
      .setImage('https://i.pinimg.com/originals/90/e1/97/90e1974560832452544052dbf3b177b0.gif')
      .setFooter({ text: 'Made by ILYAS' })
      .setTimestamp();

    try {
      await interaction.user.send({ embeds: [welcomeEmbed] });

      await interaction.reply({
        content: '📩 Welcome DM sent!',
        flags: 64
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Could not send DM. Check your privacy settings.',
        flags: 64
      });
    }
    return;
  }

  if (interaction.commandName === 'sendwelcomeall') {
    await interaction.reply({
      content: '📨 Sending welcome message to all members...',
      flags: 64
    });

    try {
      const members = await interaction.guild.members.fetch();

      let sent = 0;
      let failed = 0;
      let skippedBots = 0;

      for (const member of members.values()) {
        if (member.user.bot) {
          skippedBots++;
          continue;
        }

        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x111111)
          .setTitle('🌙 Welcome to Nightmare')
          .setDescription(
`Hey ${member},

Welcome to **Nightmare Server**.

Enjoy the community and have fun.

— Made by **ILYAS**`
          )
          .setImage('https://i.pinimg.com/originals/90/e1/97/90e1974560832452544052dbf3b177b0.gif')
          .setTimestamp();

        try {
          await member.send({ embeds: [welcomeEmbed] });
          sent++;
        } catch {
          failed++;
        }

        await sleep(700);
      }

      await interaction.followUp({
        content: `✅ Sent: ${sent} members\n❌ Failed: ${failed} members\n🤖 Skipped bots: ${skippedBots}`,
        flags: 64
      });
    } catch (error) {
      console.error('sendwelcomeall error:', error);
      await interaction.followUp({
        content: '❌ Error while sending welcome messages.',
        flags: 64
      });
    }
    return;
  }

  if (interaction.commandName === 'invites') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const guildCounts = inviteCounts.get(interaction.guild.id) || new Map();
    const count = guildCounts.get(targetUser.id) || 0;

    await interaction.reply({
      content: `📨 **${targetUser.username}** has **${count}** invites.`
    });
    return;
  }

  if (interaction.commandName === 'inviteleaderboard') {
    const guildCounts = inviteCounts.get(interaction.guild.id) || new Map();

    const sorted = [...guildCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (sorted.length === 0) {
      await interaction.reply('📭 No invite data yet.');
      return;
    }

    let text = '🏆 **Invite Leaderboard**\n\n';

    for (let i = 0; i < sorted.length; i++) {
      const [userId, count] = sorted[i];
      const user = await client.users.fetch(userId).catch(() => null);
      text += `**${i + 1}.** ${user ? user.username : 'Unknown User'} — **${count}** invites\n`;
    }

    await interaction.reply({ content: text });
    return;
  }

  if (interaction.commandName === 'nm-join') {
    await interaction.reply({
      content: '🎧 Nightmare is trying to join the voice channel...',
      flags: 64
    });

    const joined = await joinNightmareVoice();

    await interaction.followUp({
      content: joined
        ? '✅ Nightmare joined the voice channel again.'
        : '❌ Could not join the voice channel.',
      flags: 64
    });
    return;
  }
});

client.on('guildMemberAdd', async member => {
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x111111)
      .setTitle('🌙 Welcome to Nightmare')
      .setDescription(
`Hey ${member},

Welcome to **Nightmare Server**.

Enjoy the community and have fun.

— Made by **ILYAS**`
      )
      .setImage('https://i.pinimg.com/originals/90/e1/97/90e1974560832452544052dbf3b177b0.gif')
      .setTimestamp();

    try {
      await member.send({ embeds: [welcomeEmbed] });
      console.log(`📩 Welcome DM sent to ${member.user.tag}`);
    } catch (error) {
      console.log(`⚠️ Could not DM ${member.user.tag}`);
    }

    const oldInvites = inviteUses.get(member.guild.id) || new Map();
    const newInvites = await member.guild.invites.fetch();

    let usedInvite = null;

    newInvites.forEach(invite => {
      const oldUses = oldInvites.get(invite.code) || 0;
      const newUses = invite.uses || 0;

      if (newUses > oldUses) {
        usedInvite = invite;
      }
    });

    const updatedMap = new Map();
    newInvites.forEach(invite => {
      updatedMap.set(invite.code, invite.uses || 0);
    });
    inviteUses.set(member.guild.id, updatedMap);

    if (!usedInvite || !usedInvite.inviter) {
      console.log(`⚠️ Could not detect inviter for ${member.user.tag}`);
      return;
    }

    const guildCounts = inviteCounts.get(member.guild.id) || new Map();
    const inviterId = usedInvite.inviter.id;
    const currentCount = guildCounts.get(inviterId) || 0;
    const newCount = currentCount + 1;

    guildCounts.set(inviterId, newCount);
    inviteCounts.set(member.guild.id, guildCounts);

    saveInviteData();
    console.log(`🎉 ${usedInvite.inviter.tag} invited ${member.user.tag} | Total invites: ${newCount}`);
  } catch (error) {
    console.error('guildMemberAdd error:', error);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    if (oldState.id === client.user.id && oldState.channelId && !newState.channelId) {
      console.log('⚠️ Nightmare was disconnected from voice.');
    }
  } catch (error) {
    console.error('voiceStateUpdate error:', error);
  }
});

client.on('error', error => {
  console.error('Client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down — saving invite data...');
  saveInviteData();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating — saving invite data...');
  saveInviteData();
  client.destroy();
  process.exit(0);
});

client.login(TOKEN);