const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const configService = require('../../services/configService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Server-spezifische Konfiguration für den Bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        // --- TICKETS ---
        .addSubcommand(sub =>
            sub.setName('tickets')
                .setDescription('Konfiguriere das Ticket-System')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Ticketsystem aktivieren?'))
                .addChannelOption(opt => opt.setName('category').setDescription('Kategorie für neue Bewerber-Tickets'))
                .addChannelOption(opt => opt.setName('rules_channel').setDescription('Kanal mit dem Regelwerk'))
                .addChannelOption(opt => opt.setName('clan_chat').setDescription('Clan-Chat Kanal (für Begrüßungen)'))
                .addRoleOption(opt => opt.setName('bewerber_role').setDescription('Bewerber-Rolle (triggert Ticketerstellung)'))
                .addRoleOption(opt => opt.setName('clan_role').setDescription('Clan-Mitglied Rolle'))
                .addRoleOption(opt => opt.setName('support_role_1').setDescription('Support-Rolle 1 (für Ticket-Pings)'))
                .addRoleOption(opt => opt.setName('support_role_2').setDescription('Support-Rolle 2 (optional)'))
                .addRoleOption(opt => opt.setName('support_role_3').setDescription('Support-Rolle 3 (optional)'))
                .addStringOption(opt => opt.setName('welcome_msg').setDescription('Willkommensnachricht im Ticket'))
                .addStringOption(opt => opt.setName('clan_msg').setDescription('Nachricht bei Clan-Aufnahme'))
                .addStringOption(opt => opt.setName('inactivity_msg').setDescription('Ping-Nachricht bei Inaktivität'))
                .addStringOption(opt => opt.setName('kick_reason').setDescription('Kick-Grund wegen Inaktivität'))
                .addIntegerOption(opt => opt.setName('ping_hours').setDescription('Ping nach X Stunden Inaktivität'))
                .addIntegerOption(opt => opt.setName('kick_hours').setDescription('Kick nach X Stunden Inaktivität'))
        )
        // --- DESTINY 2 ---
        .addSubcommand(sub =>
            sub.setName('destiny')
                .setDescription('Destiny 2 Activity Tracker konfigurieren')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Tracker aktivieren?').setRequired(true))
                .addStringOption(opt => opt.setName('clan_url').setDescription('Bungie.net Clan URL'))
                .addChannelOption(opt => opt.setName('post_channel').setDescription('Kanal für Activity Posts'))
                .addIntegerOption(opt => opt.setName('poll_interval').setDescription('Abfrage-Intervall in Minuten (Standard: 3)'))
                .addStringOption(opt => opt.setName('mode')
                    .setDescription('Aktivitäts-Modus')
                    .addChoices(
                        { name: 'Raid', value: 'Raid' },
                        { name: 'Dungeon', value: 'Dungeon' },
                        { name: 'Beides', value: 'Both' }
                    )
                )
                .addBooleanOption(opt => opt.setName('allow_checkpoints').setDescription('Checkpoint Clears erlauben?'))
        )
        // --- WELCOMER ---
        .addSubcommand(sub =>
            sub.setName('welcomer')
                .setDescription('Konfiguriere den Welcomer (Join/Leave Nachrichten)')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Welcomer aktivieren?'))
                .addChannelOption(opt => opt.setName('channel').setDescription('Kanal für Join/Leave Nachrichten'))
                .addStringOption(opt => opt.setName('join_msg').setDescription('Nachricht bei Join (Platzhalter: {user})'))
                .addStringOption(opt => opt.setName('leave_msg').setDescription('Nachricht bei Leave (Platzhalter: {user})'))
        )
        // --- MUSIC ---
        .addSubcommand(sub =>
            sub.setName('music')
                .setDescription('Konfiguriere das Musik-System')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Musik-System aktivieren?'))
                .addChannelOption(opt => opt.setName('channel').setDescription('Erzwinge Musik-Bot in diesem Voice-Kanal'))
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'Dieser Befehl funktioniert nur in einem Server.', flags: [MessageFlags.Ephemeral] });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const currentConfig = configService.get(guildId);
        const updates = {};

        if (subcommand === 'tickets') {
            const enabled = interaction.options.getBoolean('enabled');
            const category = interaction.options.getChannel('category');
            const rules = interaction.options.getChannel('rules_channel');
            const clanChat = interaction.options.getChannel('clan_chat');
            const bewerberRole = interaction.options.getRole('bewerber_role');
            const clanRole = interaction.options.getRole('clan_role');
            const supportRoles = [1, 2, 3]
                .map(i => interaction.options.getRole(`support_role_${i}`))
                .filter(Boolean);
            const welcomeMsg = interaction.options.getString('welcome_msg');
            const clanMsg = interaction.options.getString('clan_msg');
            const inactivityMsg = interaction.options.getString('inactivity_msg');
            const kickReason = interaction.options.getString('kick_reason');
            const pingHours = interaction.options.getInteger('ping_hours');
            const kickHours = interaction.options.getInteger('kick_hours');

            updates.ticketSystem = {};
            if (enabled !== null) updates.ticketSystem.enabled = enabled;
            if (category) updates.ticketSystem.categoryId = category.id;
            if (rules) updates.ticketSystem.rulesChannelId = rules.id;
            if (clanChat) updates.ticketSystem.clanChatId = clanChat.id;
            if (bewerberRole) updates.ticketSystem.bewerberRoleId = bewerberRole.id;
            if (clanRole) updates.ticketSystem.clanMemberRoleId = clanRole.id;
            if (supportRoles.length > 0) {
                updates.ticketSystem.supportPingIds = supportRoles.map(r => r.id);
            }
            if (welcomeMsg !== null) updates.ticketSystem.welcomeMessage = welcomeMsg;
            if (clanMsg !== null) updates.ticketSystem.clanChatMessage = clanMsg;
            if (inactivityMsg !== null) updates.ticketSystem.inactivityPingMessage = inactivityMsg;
            if (kickReason !== null) updates.ticketSystem.kickReason = kickReason;
            if (pingHours !== null) updates.ticketSystem.pingThresholdHours = pingHours;
            if (kickHours !== null) updates.ticketSystem.kickThresholdHours = kickHours;

        } else if (subcommand === 'destiny') {
            const enabled = interaction.options.getBoolean('enabled');
            const clanUrl = interaction.options.getString('clan_url');
            const postChannel = interaction.options.getChannel('post_channel');
            const pollInterval = interaction.options.getInteger('poll_interval');
            const mode = interaction.options.getString('mode');
            const allowCheckpoints = interaction.options.getBoolean('allow_checkpoints');

            const finalClanUrl = clanUrl !== null ? clanUrl : currentConfig.destinyActivityTracking.clanUrl;
            const finalPostChannelId = postChannel !== null ? postChannel.id : currentConfig.destinyActivityTracking.postChannelId;
            const fallbackPostChannelId = currentConfig.ticketSystem.clanChatId;

            if (enabled) {
                if (!finalClanUrl || finalClanUrl.trim() === '') {
                    return interaction.reply({ content: '❌ Fehler: Bitte eine `clan_url` angeben, um das Tracking zu aktivieren!', flags: [MessageFlags.Ephemeral] });
                }
                if (!finalPostChannelId && !fallbackPostChannelId) {
                    return interaction.reply({ content: '❌ Fehler: Bitte einen `post_channel` angeben (oder den `clan_chat` Kanal konfigurieren), um das Tracking zu aktivieren!', flags: [MessageFlags.Ephemeral] });
                }
            }

            updates.destinyActivityTracking = { enabled };
            if (clanUrl !== null) updates.destinyActivityTracking.clanUrl = clanUrl;
            if (postChannel !== null) updates.destinyActivityTracking.postChannelId = postChannel.id;
            if (pollInterval !== null) updates.destinyActivityTracking.pollIntervalMinutes = pollInterval;
            if (mode !== null) updates.destinyActivityTracking.mode = mode === 'Both' ? '' : mode;
            if (allowCheckpoints !== null) updates.destinyActivityTracking.allowCheckpointClears = allowCheckpoints;

        } else if (subcommand === 'welcomer') {
            const enabled = interaction.options.getBoolean('enabled');
            const channel = interaction.options.getChannel('channel');
            const joinMsg = interaction.options.getString('join_msg');
            const leaveMsg = interaction.options.getString('leave_msg');

            updates.welcomer = {};
            if (enabled !== null) updates.welcomer.enabled = enabled;
            if (channel) updates.welcomer.channelId = channel.id;
            if (joinMsg !== null) updates.welcomer.welcomeMessage = joinMsg;
            if (leaveMsg !== null) updates.welcomer.leaveMessage = leaveMsg;

        } else if (subcommand === 'music') {
            const enabled = interaction.options.getBoolean('enabled');
            const channel = interaction.options.getChannel('channel');

            updates.music = {};
            if (enabled !== null) updates.music.enabled = enabled;
            if (channel) updates.music.channelId = channel.id;
        }

        if (Object.keys(updates).length > 0) {
            configService.set(guildId, updates);
            await interaction.reply({ content: `✅ Konfiguration für **${subcommand}** erfolgreich aktualisiert!`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `ℹ️ Keine neuen Werte übergeben, die Konfiguration bleibt unverändert.`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
