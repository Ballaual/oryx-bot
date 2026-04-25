const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearqueue')
        .setDescription('Leert die aktuelle Warteschlange (behält das aktuelle Lied)'),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            return interaction.reply({ content: '❌ Es gibt keine Warteschlange, die geleert werden kann!', ephemeral: true });
        }

        if (queue.songs.length <= 1) {
            return interaction.reply({ content: '❌ Die Warteschlange ist bereits leer!', ephemeral: true });
        }

        // Alle Songs außer dem aktuell spielenden (Index 0) entfernen
        const removedCount = queue.songs.length - 1;
        queue.songs.splice(1);

        await interaction.reply(`🗑️ Warteschlange geleert! (${removedCount} Song(s) entfernt)`);
    },
};
