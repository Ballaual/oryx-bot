const { Events } = require('discord.js');
const { startScheduler } = require('../services/scheduler');
const { startDestinyActivityTracker } = require('../services/destinyActivityTracker');
const { syncMissingTickets } = require('../services/ticketSync');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // Register slash commands from the commands collection
        const commands = client.commands.map(command => command.data.toJSON());
        client.application.commands.set(commands);
        console.log(`Successfully registered ${commands.length} slash commands.`);

        // Start inactivity scheduler
        startScheduler(client);
        // Start Destiny raid/dungeon summary tracker (optional via config + env BUNGIE_API_KEY)
        startDestinyActivityTracker(client);

        // Ensure every bewerber member has an onboarding ticket
        for (const guild of client.guilds.cache.values()) {
            await syncMissingTickets(client, guild).catch(err => {
                console.error(`[ready] Error syncing tickets for guild ${guild.id}:`, err);
            });
        }
    },
};
