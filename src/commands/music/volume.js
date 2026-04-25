const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Ändert die Lautstärke des Bots')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Die Lautstärke in Prozent (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            return interaction.reply({ content: '❌ Es wird gerade nichts abgespielt!', ephemeral: true });
        }

        const volume = interaction.options.getInteger('level');
        queue.setVolume(volume);
        
        await interaction.reply(`🔊 Lautstärke wurde auf **${volume}%** gesetzt!`);
    },
};
