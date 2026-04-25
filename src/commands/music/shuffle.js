const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Mischt die aktuelle Warteschlange zufällig'),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            return interaction.reply({ content: '❌ Es gibt keine Warteschlange, die gemischt werden kann!', ephemeral: true });
        }

        if (queue.songs.length <= 2) {
            return interaction.reply({ content: '❌ Es gibt nicht genug Songs in der Warteschlange zum Mischen!', ephemeral: true });
        }

        queue.shuffle();
        await interaction.reply('🔀 Die Warteschlange wurde gemischt!');
    },
};
