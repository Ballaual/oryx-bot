const { Events } = require('discord.js');
const { startScheduler } = require('../services/scheduler');
const config = require('../../config/config.json');
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

        const guild = await client.guilds.fetch(config.guildId).catch(() => null);
        if (!guild) return console.error('[ready] Guild not found.');

        // Ensure every bewerber member has an onboarding ticket
        await syncMissingTickets(client, guild);
    },
};
