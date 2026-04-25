const db = require('./database');
const configService = require('./configService');
const { buildSupportMentions } = require('../utils/mentions');

function ts() {
    return new Date().toISOString();
}

async function checkInactivity(client) {
    console.log(`[${ts()}] Running inactivity check...`);

    const now = Date.now();
    const tickets = db.getAllTickets();

    for (const ticketData of tickets) {
        try {
            const config = configService.get(ticketData.guild_id);
            const pingHours = config.pingThresholdHours || 24;
            const kickHours = config.kickThresholdHours || 72;
            const pingThreshold = pingHours * 60 * 60 * 1000;
            const kickThreshold = kickHours * 60 * 60 * 1000;

            let channel;
            try {
                channel = await client.channels.fetch(ticketData.ticket_channel_id);
            } catch (fetchErr) {
                // Only remove from DB if the channel is truly deleted (404)
                if (fetchErr.code === 10003) {
                    console.log(`[${ts()}] Ticket-Kanal ${ticketData.ticket_channel_id} gelöscht (404), wird aus DB entfernt.`);
                    db.removeTicket(ticketData.ticket_channel_id);
                } else {
                    console.warn(`[${ts()}] Ticket-Kanal ${ticketData.ticket_channel_id} konnte nicht abgerufen werden (Code ${fetchErr.code}), übersprungen.`);
                }
                continue;
            }
            if (!channel) {
                console.log(`[${ts()}] Ticket-Kanal ${ticketData.ticket_channel_id} nicht gefunden, wird aus DB entfernt.`);
                db.removeTicket(ticketData.ticket_channel_id);
                continue;
            }

            const inactiveDuration = now - ticketData.last_activity;

            // Kick Logic
            if (inactiveDuration >= kickThreshold) {
                console.log(`[${ts()}] User ${ticketData.user_id} inaktiv seit ${kickHours}h. Kick wird eingeleitet...`);

                const guild = await client.guilds.fetch(ticketData.guild_id);
                const member = await guild.members.fetch(ticketData.user_id).catch(() => null);

                if (member) {
                    if (member.kickable) {
                        const reason = config.kickReason.replace('{hours}', kickHours);
                        await member.kick(reason);
                        await channel.send(`Trotz Erinnerung herrscht in diesem Ticket weiterhin Funkstille, daher wird es nun geschlossen.`);
                        await channel.send(`Kicke den User <@${ticketData.user_id}> wegen Inaktivität (${kickHours}h).`);
                    } else {
                        await channel.send(`Warnung: Ich kann <@${ticketData.user_id}> nicht kicken (fehlende Berechtigungen).`);
                    }
                }

                db.removeTicket(ticketData.ticket_channel_id);

                await channel.delete(`Inaktivität für ${kickHours}h`).catch(err =>
                    console.error(`[${ts()}] Fehler beim Löschen des Ticket-Kanals ${ticketData.ticket_channel_id}:`, err)
                );
                continue;
            }

            // Ping Logic
            if (inactiveDuration >= pingThreshold && !ticketData.pinged_at) {
                console.log(`[${ts()}] Ticket ${ticketData.ticket_channel_id} inaktiv seit ${pingHours}h. Sende Ping...`);

                const guild = client.guilds.cache.get(ticketData.guild_id);
                const supportPings = guild
                    ? await buildSupportMentions(guild, config.supportPingIds)
                    : config.supportPingIds.map(id => `<@&${id}>`).join(' ');
                const remainingHours = kickHours - pingHours;
                const message = config.inactivityPingMessage
                    .replace('{user}', `<@${ticketData.user_id}>`)
                    .replace('{support}', supportPings)
                    .replace('{hours}', pingHours)
                    .replace('{remainingHours}', remainingHours);

                await channel.send(message);
                db.markTicketAsPinged(ticketData.ticket_channel_id);
            }
        } catch (error) {
            console.error(`[${ts()}] Fehler beim Verarbeiten des Tickets ${ticketData.ticket_channel_id}:`, error);
        }
    }
}

function startScheduler(client) {
    // Global interval check runs every 30 minutes
    const interval = 30 * 60 * 1000;
    setInterval(() => checkInactivity(client), interval);

    // Initial check after startup
    setTimeout(() => checkInactivity(client), 5000);
}

module.exports = { startScheduler };
