const { Events } = require('discord.js');
const configService = require('../services/configService');
const { createLeaveEmbed } = require('../utils/embeds');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        const config = configService.get(member.guild.id);
        
        if (!config.welcomer?.enabled || !config.welcomer.channelId) return;

        try {
            const channel = await member.guild.channels.fetch(config.welcomer.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const leaveEmbed = createLeaveEmbed(member, config.welcomer.leaveMessage);
            await channel.send({ embeds: [leaveEmbed] });
        } catch (error) {
            console.error(`[Event: GuildMemberRemove] Fehler beim Senden der Leave-Nachricht für ${member.user.tag}:`, error);
        }
    },
};
