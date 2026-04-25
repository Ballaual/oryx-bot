const { Events } = require('discord.js');
const db = require('../services/database');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        // Check if message is in a tracked ticket channel
        if (db.updateTicketActivity(message.channel.id)) {
            console.log(`Activity updated for ticket ${message.channel.id} by ${message.author.tag}`);
            
            // Auto-detection logic removed in favor of the "Bungie ID" button/modal
            // for better reliability (especially with spaces in names).
        }
    },
};
