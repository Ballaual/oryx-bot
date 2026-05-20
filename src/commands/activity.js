const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../services/database');
const activityTracker = require('../services/activityTracker');
const configService = require('../services/configService');

function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!days && !hours) parts.push(`${seconds}s`);
    return parts.join(' ') || '0s';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Discord-Aktivitäts-Statistiken')
        .addSubcommand(sub =>
            sub.setName('user')
                .setDescription('Zeigt die Aktivitäts-Stats eines Users')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('Welcher User? (Default: du selbst)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('leaderboard')
                .setDescription('Top-Liste der aktivsten Member')
                .addStringOption(opt =>
                    opt.setName('typ')
                        .setDescription('Wonach sortiert werden soll')
                        .addChoices(
                            { name: 'Voice-Zeit', value: 'voice_seconds' },
                            { name: 'Nachrichten', value: 'messages_sent' },
                            { name: 'Reaktionen', value: 'reactions_added' },
                        )
                        .setRequired(false)
                )
                .addIntegerOption(opt =>
                    opt.setName('limit')
                        .setDescription('Wie viele Einträge (1–25, Default 10)')
                        .setMinValue(1)
                        .setMaxValue(25)
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'Nur in einem Server nutzbar.', flags: [MessageFlags.Ephemeral] });
        }

        if (!configService.get(interaction.guildId).activityTracking?.enabled) {
            return interaction.reply({
                content: '⚠️ Activity-Tracking ist auf diesem Server nicht aktiviert. Ein Admin kann es per `/setup activity enabled:true` einschalten.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        // Vor Anzeige: laufende Voice-Sessions persistieren, damit die Stats aktuell sind.
        try { activityTracker.flushActiveSessions(); } catch { /* ignore */ }

        const sub = interaction.options.getSubcommand();

        if (sub === 'user') {
            const target = interaction.options.getUser('user') || interaction.user;
            const stats = db.getActivityStats(target.id, interaction.guildId) || {
                messages_sent: 0,
                reactions_added: 0,
                voice_seconds: 0,
            };

            const embed = new EmbedBuilder()
                .setTitle(`Aktivität: ${target.username}`)
                .setColor(0x5865F2)
                .setThumbnail(target.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: '🎙️ Voice-Zeit', value: formatDuration(stats.voice_seconds), inline: true },
                    { name: '💬 Nachrichten', value: String(stats.messages_sent || 0), inline: true },
                    { name: '😀 Reaktionen', value: String(stats.reactions_added || 0), inline: true },
                )
                .setFooter({ text: `User-ID: ${target.id}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'leaderboard') {
            const sortBy = interaction.options.getString('typ') || 'voice_seconds';
            const limit = interaction.options.getInteger('limit') || 10;
            const rows = db.getActivityLeaderboard(interaction.guildId, sortBy, limit);

            const labels = {
                voice_seconds: '🎙️ Voice-Zeit',
                messages_sent: '💬 Nachrichten',
                reactions_added: '😀 Reaktionen',
            };

            if (!rows.length) {
                return interaction.reply({ content: `Noch keine Daten für **${labels[sortBy]}**.`, flags: [MessageFlags.Ephemeral] });
            }

            const lines = rows.map((row, i) => {
                const rank = `${i + 1}.`.padEnd(3, ' ');
                const value = sortBy === 'voice_seconds'
                    ? formatDuration(row.voice_seconds)
                    : String(row[sortBy] ?? 0);
                return `${rank} <@${row.user_id}> — **${value}**`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`Leaderboard · ${labels[sortBy]}`)
                .setColor(0x5865F2)
                .setDescription(lines.join('\n'))
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                allowedMentions: { parse: [] }, // nicht pingen
            });
        }
    },
};
