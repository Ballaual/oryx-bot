const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Zeigt die aktuelle Warteschlange an'),
    async execute(interaction) {
        const queue = interaction.client.distube.getQueue(interaction);
        if (!queue) {
            return interaction.reply({ content: '❌ Die Warteschlange ist aktuell leer!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎶 Aktuelle Warteschlange')
            .setDescription(`**Spielt gerade:**\n[${queue.songs[0].name}](${queue.songs[0].url}) - \`${queue.songs[0].formattedDuration}\`\n\n**Als nächstes:**`);

        const q = queue.songs
            .slice(1, 11)
            .map((song, i) => `${i + 1}. [${song.name}](${song.url}) - \`${song.formattedDuration}\``)
            .join('\n');

        if (q) {
            embed.setDescription(`${embed.data.description}\n${q}`);
        }

        if (queue.songs.length > 11) {
            embed.setFooter({ text: `...und ${queue.songs.length - 11} weitere Songs` });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
