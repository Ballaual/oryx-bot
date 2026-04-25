const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Prüft ob der Bot online ist'),
    async execute(interaction) {
        await interaction.reply({ content: 'Pong! Der Bot läuft.', ephemeral: true });
    },
};
