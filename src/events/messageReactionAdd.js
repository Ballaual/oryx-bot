const { Events } = require('discord.js');
const db = require('../services/database');
const configService = require('../services/configService');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        try {
            if (user.bot) return;

            // Partial-Daten ggf. nachladen (Reaktionen auf alte/ungecachte Nachrichten)
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch {
                    // Wenn das Nachladen scheitert, können wir trotzdem den Reaction-Counter zählen
                    // — wir brauchen nur die guildId, die meist schon am Reaction-Objekt hängt.
                }
            }

            const guildId = reaction.message?.guildId || reaction.message?.guild?.id;
            if (!guildId) return; // nur Guild-Reaktionen zählen

            if (!configService.get(guildId).activityTracking?.enabled) return;

            db.incrementActivityReactions(user.id, guildId);
        } catch (err) {
            console.error('[activity] messageReactionAdd failed:', err);
        }
    },
};
