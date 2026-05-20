const { Events } = require('discord.js');
const db = require('../services/database');
const configService = require('../services/configService');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        // Activity tracking: nur in Guild-Channels und nur wenn aktiviert
        if (message.guildId && configService.get(message.guildId).activityTracking?.enabled) {
            try {
                db.incrementActivityMessages(message.author.id, message.guildId);
            } catch (err) {
                console.error('[activity] incrementActivityMessages failed:', err);
            }
        }

        // Check if message is in a tracked ticket channel
        if (db.updateTicketActivity(message.channel.id)) {
            console.log(`Activity updated for ticket ${message.channel.id} by ${message.author.tag}`);

            // Auto-detection logic removed in favor of the "Bungie ID" button/modal
            // for better reliability (especially with spaces in names).
        }
    },
};
