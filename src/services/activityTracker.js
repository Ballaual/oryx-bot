const db = require('./database');
const configService = require('./configService');

// key: `${guildId}:${userId}` -> { startedAt: number }
const activeSessions = new Map();

function key(guildId, userId) {
    return `${guildId}:${userId}`;
}

function startSession(guildId, userId, when = Date.now()) {
    if (!guildId || !userId) return;
    const k = key(guildId, userId);
    if (activeSessions.has(k)) return;
    activeSessions.set(k, { guildId, userId, startedAt: when });
}

function endSession(guildId, userId, when = Date.now()) {
    if (!guildId || !userId) return 0;
    const k = key(guildId, userId);
    const session = activeSessions.get(k);
    if (!session) return 0;
    activeSessions.delete(k);
    const seconds = Math.floor((when - session.startedAt) / 1000);
    if (seconds > 0) {
        try {
            db.addActivityVoiceSeconds(userId, guildId, seconds);
        } catch (err) {
            console.error('[activityTracker] Failed to persist voice seconds:', err);
        }
    }
    return seconds;
}

// Persist all currently active sessions without dropping them — used on shutdown
// and also fine to call periodically.
function flushActiveSessions() {
    const now = Date.now();
    for (const [k, session] of activeSessions.entries()) {
        const seconds = Math.floor((now - session.startedAt) / 1000);
        if (seconds > 0) {
            try {
                db.addActivityVoiceSeconds(session.userId, session.guildId, seconds);
            } catch (err) {
                console.error('[activityTracker] Flush failed:', err);
            }
            // Reset start so we don't double-count after flush.
            session.startedAt = now;
        }
    }
}

// On startup, look at every voice channel the bot can see and start a session
// for each non-bot user currently connected.
function initializeFromClient(client) {
    const now = Date.now();
    let count = 0;
    for (const guild of client.guilds.cache.values()) {
        if (!configService.get(guild.id).activityTracking?.enabled) continue;
        for (const channel of guild.channels.cache.values()) {
            if (!channel.isVoiceBased?.()) continue;
            for (const member of channel.members.values()) {
                if (member.user.bot) continue;
                startSession(guild.id, member.id, now);
                count++;
            }
        }
    }
    if (count > 0) {
        console.log(`[activityTracker] Resumed ${count} voice session(s) on startup.`);
    }
}

// Auf eine Config-Änderung reagieren:
//   enabled = true  → für alle verbundenen User dieser Guild eine Session starten
//   enabled = false → alle laufenden Sessions dieser Guild flushen und entfernen
function setEnabledForGuild(guild, enabled) {
    if (!guild) return;
    const now = Date.now();
    if (enabled) {
        for (const channel of guild.channels.cache.values()) {
            if (!channel.isVoiceBased?.()) continue;
            for (const member of channel.members.values()) {
                if (member.user.bot) continue;
                startSession(guild.id, member.id, now);
            }
        }
    } else {
        for (const [k, session] of [...activeSessions.entries()]) {
            if (session.guildId !== guild.id) continue;
            endSession(session.guildId, session.userId, now);
        }
    }
}

function registerShutdownHandlers() {
    const shutdown = (signal) => {
        try {
            flushActiveSessions();
            console.log(`[activityTracker] Flushed voice sessions on ${signal}.`);
        } catch (err) {
            console.error('[activityTracker] Shutdown flush failed:', err);
        } finally {
            process.exit(0);
        }
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = {
    startSession,
    endSession,
    flushActiveSessions,
    initializeFromClient,
    setEnabledForGuild,
    registerShutdownHandlers,
};
