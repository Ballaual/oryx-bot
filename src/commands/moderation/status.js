const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../services/database');

function formatUptime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Zeigt den aktuellen Bot- und Systemstatus')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const guildCount = interaction.client.guilds.cache.size;
        const ticketCount = db.getAllTickets().length;
        const uptime = formatUptime(process.uptime() * 1000);
        const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const wsPing = interaction.client.ws.ping;
        const nowIso = new Date().toISOString();

        await interaction.reply({
            content:
                `Bot Status\n` +
                `- Uptime: **${uptime}**\n` +
                `- WebSocket Ping: **${wsPing} ms**\n` +
                `- Speicher (RSS): **${memoryMb} MB**\n` +
                `- Verbundene Guilds: **${guildCount}**\n` +
                `- Aktive Tickets (DB): **${ticketCount}**\n` +
                `- Zeit: \`${nowIso}\``,
            flags: [MessageFlags.Ephemeral],
        });
    },
};
