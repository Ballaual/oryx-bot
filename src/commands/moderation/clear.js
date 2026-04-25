const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Löscht eine bestimmte Anzahl an Nachrichten in diesem Kanal')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Anzahl der zu löschenden Nachrichten (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), // Nur für User mit Berechtigung
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        try {
            // Nachrichten löschen
            const deleted = await interaction.channel.bulkDelete(amount, true);

            // Bestätigung senden (und nach 5 Sekunden wieder löschen)
            await interaction.reply({
                content: `🧹 Erfolgreich ${deleted.size} Nachricht(en) gelöscht.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('[Moderation] Fehler beim Löschen von Nachrichten:', error);
            await interaction.reply({
                content: '❌ Beim Löschen der Nachrichten ist ein Fehler aufgetreten. Bitte beachte, dass Nachrichten, die älter als 14 Tage sind, nicht auf diese Weise gelöscht werden können.',
                ephemeral: true
            });
        }
    },
};
