const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pausiert die aktuell abspielende Musik'),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            return interaction.reply({ content: '❌ Es wird gerade nichts abgespielt!', ephemeral: true });
        }

        if (queue.paused) {
            return interaction.reply({ content: '⏸️ Musik ist bereits pausiert!', ephemeral: true });
        }

        queue.pause();
        await interaction.reply('⏸️ Musik wurde pausiert!');
    },
};
