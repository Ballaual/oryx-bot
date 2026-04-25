const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Setzt die pausierte Musik fort'),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            return interaction.reply({ content: '❌ Es wird gerade nichts abgespielt!', ephemeral: true });
        }

        if (!queue.paused) {
            return interaction.reply({ content: '▶️ Musik läuft bereits!', ephemeral: true });
        }

        queue.resume();
        await interaction.reply('▶️ Musik wird fortgesetzt!');
    },
};
