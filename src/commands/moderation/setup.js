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
            const rules = interaction.options.getChannel('rules');
            const clanChat = interaction.options.getChannel('clan_chat');
            const music = interaction.options.getChannel('music');
            const ticketCat = interaction.options.getChannel('ticket_category');

            if (rules) updates.rulesChannelId = rules.id;
            if (clanChat) updates.clanChatId = clanChat.id;
            if (music) updates.musicChannelId = music.id;
            if (ticketCat) updates.ticketCategoryId = ticketCat.id;

        } else if (subcommand === 'roles') {
            const bewerber = interaction.options.getRole('bewerber');
            const clanMember = interaction.options.getRole('clan_member');
            const supportPings = interaction.options.getString('support_pings');

            if (bewerber) updates.bewerberRoleId = bewerber.id;
            if (clanMember) updates.clanMemberRoleId = clanMember.id;
            if (supportPings) {
                // Support pings as comma-separated IDs
                updates.supportPingIds = supportPings.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }

        } else if (subcommand === 'destiny') {
            const enabled = interaction.options.getBoolean('enabled');
            const clanUrl = interaction.options.getString('clan_url');
            const postChannel = interaction.options.getChannel('post_channel');
            const pollInterval = interaction.options.getInteger('poll_interval');

            updates.destinyActivityTracking = {
                ...currentConfig.destinyActivityTracking,
                enabled
            };

            if (clanUrl !== null) updates.destinyActivityTracking.clanUrl = clanUrl;
            if (postChannel !== null) updates.destinyActivityTracking.postChannelId = postChannel.id;
            if (pollInterval !== null) updates.destinyActivityTracking.pollIntervalMinutes = pollInterval;
        }

        if (Object.keys(updates).length > 0) {
            configService.set(guildId, updates);
            await interaction.reply({ content: `✅ Konfiguration für **${subcommand}** erfolgreich aktualisiert!`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `ℹ️ Keine neuen Werte übergeben, die Konfiguration bleibt unverändert.`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
