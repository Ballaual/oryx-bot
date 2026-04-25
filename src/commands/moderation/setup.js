const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const configService = require('../../services/configService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Server-spezifische Konfiguration für den Bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('channels')
                .setDescription('Konfiguriere wichtige Text/Voice-Kanäle')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Ticketsystem aktivieren?').setRequired(false))
                .addChannelOption(opt => opt.setName('rules').setDescription('Regelwerk-Kanal').setRequired(false))
                .addChannelOption(opt => opt.setName('clan_chat').setDescription('Clan-Chat Kanal für Willkommensnachrichten').setRequired(false))
                .addChannelOption(opt => opt.setName('music').setDescription('Voice-Kanal für den Musik-Bot (optional)').setRequired(false))
                .addChannelOption(opt => opt.setName('ticket_category').setDescription('Kategorie für neue Bewerber-Tickets').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('roles')
                .setDescription('Konfiguriere Rollen und Pings')
                .addRoleOption(opt => opt.setName('bewerber').setDescription('Bewerber-Rolle (triggert die Ticketerstellung)').setRequired(false))
                .addRoleOption(opt => opt.setName('clan_member').setDescription('Clan-Mitglied Rolle (nach Aufnahme)').setRequired(false))
                .addStringOption(opt => opt.setName('support_pings').setDescription('Kommagetrennte Rollen-IDs für Ticket-Benachrichtigungen').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('destiny')
                .setDescription('Destiny 2 Activity Tracker konfigurieren')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Tracker aktivieren?').setRequired(true))
                .addStringOption(opt => opt.setName('clan_url').setDescription('Bungie.net Clan URL').setRequired(false))
                .addChannelOption(opt => opt.setName('post_channel').setDescription('Kanal für Activity Posts').setRequired(false))
                .addIntegerOption(opt => opt.setName('poll_interval').setDescription('Abfrage-Intervall in Minuten (Standard: 3)').setRequired(false))
                .addStringOption(opt => opt.setName('mode')
                    .setDescription('Aktivitäts-Modus')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Raid', value: 'Raid' },
                        { name: 'Dungeon', value: 'Dungeon' },
                        { name: 'Beides', value: 'Both' }
                    )
                )
                .addBooleanOption(opt => opt.setName('allow_checkpoint_clears').setDescription('Checkpoint Clears erlauben?').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('messages')
                .setDescription('Konfiguriere Bot-Nachrichten')
                .addStringOption(opt => opt.setName('welcome').setDescription('Willkommensnachricht im Ticket').setRequired(false))
                .addStringOption(opt => opt.setName('clan_chat').setDescription('Nachricht bei Clan-Aufnahme').setRequired(false))
                .addStringOption(opt => opt.setName('inactivity').setDescription('Ping-Nachricht bei Inaktivität').setRequired(false))
                .addStringOption(opt => opt.setName('kick_reason').setDescription('Kick-Grund wegen Inaktivität').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('timeouts')
                .setDescription('Konfiguriere Ticket-Timeouts (in Stunden/Minuten)')
                .addIntegerOption(opt => opt.setName('check_interval').setDescription('Check-Intervall in Minuten').setRequired(false))
                .addIntegerOption(opt => opt.setName('ping_threshold').setDescription('Ping-Schwelle in Stunden').setRequired(false))
                .addIntegerOption(opt => opt.setName('kick_threshold').setDescription('Kick-Schwelle in Stunden').setRequired(false))
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'Dieser Befehl funktioniert nur in einem Server.', flags: [MessageFlags.Ephemeral] });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const currentConfig = configService.get(guildId);
        const updates = {};

        if (subcommand === 'channels') {
            const enabled = interaction.options.getBoolean('enabled');
            const rules = interaction.options.getChannel('rules');
            const clanChat = interaction.options.getChannel('clan_chat');
            const music = interaction.options.getChannel('music');
            const ticketCat = interaction.options.getChannel('ticket_category');

            if (enabled !== null || ticketCat || rules || clanChat) {
                updates.ticketSystem = updates.ticketSystem || {};
                if (enabled !== null) updates.ticketSystem.enabled = enabled;
                if (ticketCat) updates.ticketSystem.categoryId = ticketCat.id;
                if (rules) updates.ticketSystem.rulesChannelId = rules.id;
                if (clanChat) updates.ticketSystem.clanChatId = clanChat.id;
            }
            if (music) updates.musicChannelId = music.id;

        } else if (subcommand === 'roles') {
            const bewerber = interaction.options.getRole('bewerber');
            const clanMember = interaction.options.getRole('clan_member');
            const supportPings = interaction.options.getString('support_pings');

            if (bewerber || supportPings || clanMember) {
                updates.ticketSystem = updates.ticketSystem || {};
                if (bewerber) updates.ticketSystem.bewerberRoleId = bewerber.id;
                if (clanMember) updates.ticketSystem.clanMemberRoleId = clanMember.id;
                if (supportPings) {
                    updates.ticketSystem.supportPingIds = supportPings.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }
            }

        } else if (subcommand === 'destiny') {
            const enabled = interaction.options.getBoolean('enabled');
            const clanUrl = interaction.options.getString('clan_url');
            const postChannel = interaction.options.getChannel('post_channel');
            const pollInterval = interaction.options.getInteger('poll_interval');
            const mode = interaction.options.getString('mode');
            const allowCheckpointClears = interaction.options.getBoolean('allow_checkpoint_clears');

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

            updates.destinyActivityTracking = {
                ...currentConfig.destinyActivityTracking,
                enabled
            };

            if (clanUrl !== null) updates.destinyActivityTracking.clanUrl = clanUrl;
            if (postChannel !== null) updates.destinyActivityTracking.postChannelId = postChannel.id;
            if (pollInterval !== null) updates.destinyActivityTracking.pollIntervalMinutes = pollInterval;
            if (mode !== null) updates.destinyActivityTracking.mode = mode === 'Both' ? '' : mode;
            if (allowCheckpointClears !== null) updates.destinyActivityTracking.allowCheckpointClears = allowCheckpointClears;
        } else if (subcommand === 'messages') {
            const welcome = interaction.options.getString('welcome');
            const clanChat = interaction.options.getString('clan_chat');
            const inactivity = interaction.options.getString('inactivity');
            const kickReason = interaction.options.getString('kick_reason');

            if (welcome !== null || inactivity !== null || kickReason !== null || clanChat !== null) {
                updates.ticketSystem = updates.ticketSystem || {};
                if (welcome !== null) updates.ticketSystem.welcomeMessage = welcome;
                if (inactivity !== null) updates.ticketSystem.inactivityPingMessage = inactivity;
                if (kickReason !== null) updates.ticketSystem.kickReason = kickReason;
                if (clanChat !== null) updates.ticketSystem.clanChatMessage = clanChat;
            }

        } else if (subcommand === 'timeouts') {
            const checkInterval = interaction.options.getInteger('check_interval');
            const pingThreshold = interaction.options.getInteger('ping_threshold');
            const kickThreshold = interaction.options.getInteger('kick_threshold');

            if (checkInterval !== null || pingThreshold !== null || kickThreshold !== null) {
                updates.ticketSystem = updates.ticketSystem || {};
                if (checkInterval !== null) updates.ticketSystem.checkIntervalMinutes = checkInterval;
                if (pingThreshold !== null) updates.ticketSystem.pingThresholdHours = pingThreshold;
                if (kickThreshold !== null) updates.ticketSystem.kickThresholdHours = kickThreshold;
            }
        }

        if (Object.keys(updates).length > 0) {
            configService.set(guildId, updates);
            await interaction.reply({ content: `✅ Konfiguration für **${subcommand}** erfolgreich aktualisiert!`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `ℹ️ Keine neuen Werte übergeben, die Konfiguration bleibt unverändert.`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
