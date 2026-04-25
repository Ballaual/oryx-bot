const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../../config/config.json');
const { syncMissingTickets } = require('../../services/ticketSync');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync-tickets')
        .setDescription('Synchronisiert fehlende Onboarding-Tickets mit Bewerber-Rollen')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'Dieser Befehl funktioniert nur in einem Server.', flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.guild.id !== config.guildId) {
            return interaction.reply({ content: 'Dieser Befehl ist nur in der konfigurierten Guild erlaubt.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const result = await syncMissingTickets(interaction.client, interaction.guild);

        await interaction.editReply(
            `Ticket-Sync abgeschlossen.\n` +
            `- Bewerber gescannt: **${result.scanned}**\n` +
            `- Neue Tickets erstellt: **${result.created}**\n` +
            `- Vorhandene Kanaele verknuepft: **${result.relinked}**`
        );
    },
};
