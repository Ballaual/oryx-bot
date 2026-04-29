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

        let footerText = interaction.guild.name;
        if (queue.songs.length > 11) {
            footerText = `...und ${queue.songs.length - 11} weitere Songs | ${footerText}`;
        }

        embed.setFooter({ 
            text: footerText, 
            iconURL: interaction.guild.iconURL() 
        })
        .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
