const { SlashCommandBuilder } = require('discord.js');
const { checkMusicPermissions } = require('../../services/music');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Spielt einen Song ab (YouTube, Spotify oder Datei)')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Die URL (YouTube/Spotify) oder der Suchbegriff')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('Eine Audio-Datei (mp3, wav, etc.) zum Abspielen')
                .setRequired(false)
        ),
    async execute(interaction) {
        if (!checkMusicPermissions(interaction)) return;

        const query = interaction.options.getString('query');
        const file = interaction.options.getAttachment('file');
        const voiceChannel = interaction.member.voice.channel;

        if (!query && !file) {
            return interaction.reply({ content: '❌ Du musst entweder einen Suchbegriff/URL eingeben oder eine Datei hochladen!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const playTarget = file ? file.url : query;

        try {
            await interaction.client.distube.play(voiceChannel, playTarget, {
                textChannel: interaction.channel,
                member: interaction.member,
                interaction
            });
            await interaction.editReply(`🔍 Spiele ${file ? 'hochgeladene Datei' : `\`${query}\``}...`);
        } catch (error) {
            console.error('[Play Command] Fehler:', error);
            await interaction.editReply(`❌ Fehler beim Abspielen: \`${error.message}\``);
        }
    },
};
