const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Überspringt den aktuellen Song'),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            return interaction.reply({ content: '❌ Es wird gerade nichts abgespielt!', ephemeral: true });
        }

        try {
            if (queue.songs.length <= 1 && !queue.autoplay) {
                queue.stop();
                await interaction.reply('⏹️ Letzter Song übersprungen. Warteschlange ist nun leer.');
            } else {
                const song = await queue.skip();
                await interaction.reply(`⏭️ Übersprungen! Spiele jetzt: **${song.name}**`);
            }
        } catch (error) {
            console.error('[Skip Command] Fehler:', error);
            await interaction.reply({ content: '❌ Fehler beim Überspringen!', ephemeral: true });
        }
    },
};
