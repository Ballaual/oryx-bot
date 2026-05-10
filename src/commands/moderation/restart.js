const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Startet den Bot neu (nur Bot-Owner)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Only allow the bot owner or server admins to restart
        const isOwner = interaction.user.id === process.env.BOT_OWNER;
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !isAdmin) {
            return interaction.reply({
                content: '❌ Nur Administratoren können diesen Befehl ausführen.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        await interaction.reply({
            content: '🔄 Bot wird neugestartet...',
            flags: [MessageFlags.Ephemeral],
        });

        console.log(`[restart] Bot-Neustart ausgelöst von ${interaction.user.tag} (${interaction.user.id})`);

        // Short delay to ensure the reply is sent before the process exits
        setTimeout(() => {
            process.exit(0);
        }, 1500);
    },
};
