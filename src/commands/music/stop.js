const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Beendet die Wiedergabe, leert die Warteschlange und verlässt den Kanal'),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            // Wenn keine Queue existiert, aber der Bot trotzdem im Channel ist, lassen wir ihn manuell leaven.
            const voice = interaction.client.distube.voices.get(interaction.guild);
            if (voice) {
                voice.leave();
                return interaction.reply('⏹️ Bot hat den Kanal verlassen.');
            }
            return interaction.reply({ content: '❌ Es wird gerade nichts abgespielt!', ephemeral: true });
        }

        // queue.stop() beendet die Wiedergabe und leert die Warteschlange
        queue.stop();
        // Sicherstellen, dass der Bot den Kanal wirklich verlässt
        interaction.client.distube.voices.leave(interaction.guild);

        await interaction.reply('⏹️ Wiedergabe beendet, Warteschlange geleert und Kanal verlassen!');
    },
};
