const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Spielt einen Song oder eine Playlist ab (YouTube/Spotify)')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Die URL (YouTube/Spotify) oder der Suchbegriff')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const query = interaction.options.getString('query');
        const voiceChannel = interaction.member.voice.channel;

        await interaction.deferReply({ ephemeral: true });

        try {
            await interaction.client.distube.play(voiceChannel, query, {
                textChannel: interaction.channel,
                member: interaction.member,
                interaction
            });
            await interaction.editReply(`🔍 Suche nach: \`${query}\`...`);
        } catch (error) {
            console.error('[Play Command] Fehler:', error);
            await interaction.editReply(`❌ Fehler beim Abspielen: \`${error.message}\``);
        }
    },
};
