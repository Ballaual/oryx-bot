const { Events } = require('discord.js');

// Per-guild state for "bot alone" handling
const leaveTimeouts = new Map(); // guildId -> Timeout
const pausedByAlone = new Set(); // guildId

function countHumansInChannel(channel) {
    if (!channel) return 0;
    return channel.members.filter(m => !m.user.bot).size;
}

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState, client) {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const botMember = guild.members.me;
        const botChannel = botMember?.voice?.channel;
        if (!botChannel) return;

        // Only react to changes that affect the bot's current voice channel.
        const affectedChannelId = newState.channelId || oldState.channelId;
        if (affectedChannelId && affectedChannelId !== botChannel.id) return;

        const queue = client.distube.getQueue(guild);
        if (!queue) return;

        const humans = countHumansInChannel(botChannel);

        // If nobody (human) is in the channel with the bot:
        if (humans === 0) {
            // Pause once (don't fight a manual pause)
            if (!queue.paused) {
                try {
                    queue.pause();
                    pausedByAlone.add(guild.id);
                    queue.textChannel?.send('⏸️ Ich bin allein im Voice — pausiere. Wenn in 30 Sekunden niemand kommt, stoppe ich und verlasse den Kanal.').catch(() => null);
                } catch {
                    // ignore
                }
            }

            if (!leaveTimeouts.has(guild.id)) {
                const t = setTimeout(() => {
                    leaveTimeouts.delete(guild.id);

                    const stillBotChannel = guild.members.me?.voice?.channel;
                    const stillAlone = countHumansInChannel(stillBotChannel) === 0;
                    const stillQueue = client.distube.getQueue(guild);

                    if (!stillBotChannel || !stillQueue) {
                        pausedByAlone.delete(guild.id);
                        return;
                    }

                    if (!stillAlone) return;

                    try {
                        stillQueue.stop();
                    } catch {
                        // ignore
                    }

                    try {
                        client.distube.voices.leave(guild);
                    } catch {
                        // ignore
                    }

                    pausedByAlone.delete(guild.id);
                    stillQueue.textChannel?.send('⏹️ Niemand ist zurückgekommen — Queue beendet und Kanal verlassen.').catch(() => null);
                }, 30 * 1000);

                leaveTimeouts.set(guild.id, t);
            }

            return;
        }

        // Humans are present again: cancel leave timer + resume if we paused automatically
        const pending = leaveTimeouts.get(guild.id);
        if (pending) {
            clearTimeout(pending);
            leaveTimeouts.delete(guild.id);
        }

        if (pausedByAlone.has(guild.id) && queue.paused) {
            try {
                queue.resume();
                pausedByAlone.delete(guild.id);
                queue.textChannel?.send('▶️ Wieder jemand da — mache weiter.').catch(() => null);
            } catch {
                // ignore
            }
        }
    },
};

