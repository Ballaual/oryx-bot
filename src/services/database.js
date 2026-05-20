const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || './database.sqlite';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_tickets (
        ticket_channel_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        last_activity INTEGER NOT NULL,
        pinged_at INTEGER,
        created_at INTEGER NOT NULL,
        is_paused INTEGER DEFAULT 0
    )
`);

// Migration: Add is_paused column if it doesn't exist (for existing databases)
try {
    const columns = db.pragma('table_info(tracked_tickets)');
    if (!columns.some(c => c.name === 'is_paused')) {
        db.exec('ALTER TABLE tracked_tickets ADD COLUMN is_paused INTEGER DEFAULT 0');
    }
} catch (err) {
    console.warn('[DB] Migration for is_paused failed:', err.message);
}

db.exec(`
    CREATE TABLE IF NOT EXISTS destiny_profiles (
        discord_user_id TEXT PRIMARY KEY,
        bungie_display_name TEXT,
        bungie_display_name_code INTEGER,
        membership_type INTEGER,
        membership_id TEXT,
        updated_at INTEGER NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS destiny_posted_instances (
        instance_id TEXT PRIMARY KEY,
        discord_user_id TEXT,
        activity_type TEXT,
        posted_at INTEGER NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS clan_member_tracking (
        membership_id TEXT,
        guild_id TEXT,
        first_seen_at INTEGER NOT NULL,
        PRIMARY KEY (membership_id, guild_id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        execute_at INTEGER NOT NULL,
        data TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS activity_stats (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        messages_sent INTEGER NOT NULL DEFAULT 0,
        reactions_added INTEGER NOT NULL DEFAULT 0,
        voice_seconds INTEGER NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
    )
`);

module.exports = {
    addScheduledAction: (actionType, targetId, guildId, executeAt, data = null) => {
        const stmt = db.prepare('INSERT INTO scheduled_actions (action_type, target_id, guild_id, execute_at, data) VALUES (?, ?, ?, ?, ?)');
        stmt.run(actionType, targetId, guildId, executeAt, data ? JSON.stringify(data) : null);
    },

    getPendingScheduledActions: () => {
        const stmt = db.prepare('SELECT * FROM scheduled_actions WHERE execute_at <= ?');
        return stmt.all(Date.now());
    },

    removeScheduledAction: (id) => {
        const stmt = db.prepare('DELETE FROM scheduled_actions WHERE id = ?');
        stmt.run(id);
    },
    addTicket: (ticketChannelId, userId, guildId) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO tracked_tickets (ticket_channel_id, user_id, guild_id, last_activity, created_at) VALUES (?, ?, ?, ?, ?)');
        stmt.run(ticketChannelId, userId, guildId, Date.now(), Date.now());
    },

    updateTicketActivity: (ticketChannelId) => {
        const stmt = db.prepare('UPDATE tracked_tickets SET last_activity = ?, pinged_at = NULL WHERE ticket_channel_id = ?');
        const info = stmt.run(Date.now(), ticketChannelId);
        return info.changes > 0;
    },

    getInactiveTickets: (thresholdMs) => {
        const stmt = db.prepare('SELECT * FROM tracked_tickets WHERE last_activity < ?');
        return stmt.all(Date.now() - thresholdMs);
    },

    markTicketAsPinged: (ticketChannelId) => {
        const stmt = db.prepare('UPDATE tracked_tickets SET pinged_at = ? WHERE ticket_channel_id = ?');
        stmt.run(Date.now(), ticketChannelId);
    },

    removeTicket: (ticketChannelId) => {
        const stmt = db.prepare('DELETE FROM tracked_tickets WHERE ticket_channel_id = ?');
        stmt.run(ticketChannelId);
    },

    getAllTickets: () => {
        return db.prepare('SELECT * FROM tracked_tickets').all();
    },

    getTicketByUserId: (userId) => {
        return db.prepare('SELECT * FROM tracked_tickets WHERE user_id = ?').get(userId);
    },

    getTicket: (ticketChannelId) => {
        return db.prepare('SELECT * FROM tracked_tickets WHERE ticket_channel_id = ?').get(ticketChannelId);
    },

    toggleTicketPause: (ticketChannelId) => {
        const ticket = db.prepare('SELECT is_paused FROM tracked_tickets WHERE ticket_channel_id = ?').get(ticketChannelId);
        if (!ticket) return null;

        const newState = ticket.is_paused ? 0 : 1;
        db.prepare('UPDATE tracked_tickets SET is_paused = ? WHERE ticket_channel_id = ?').run(newState, ticketChannelId);
        return newState;
    },

    upsertDestinyProfileByBungieName: (discordUserId, displayName, displayNameCode) => {
        const stmt = db.prepare(`
            INSERT INTO destiny_profiles (discord_user_id, bungie_display_name, bungie_display_name_code, membership_type, membership_id, updated_at)
            VALUES (?, ?, ?, NULL, NULL, ?)
            ON CONFLICT(discord_user_id) DO UPDATE SET
                bungie_display_name = excluded.bungie_display_name,
                bungie_display_name_code = excluded.bungie_display_name_code,
                membership_type = NULL,
                membership_id = NULL,
                updated_at = excluded.updated_at
        `);
        stmt.run(discordUserId, displayName, Number(displayNameCode), Date.now());
    },

    updateDestinyMembership: (discordUserId, membershipType, membershipId) => {
        const stmt = db.prepare(`
            INSERT INTO destiny_profiles (discord_user_id, membership_type, membership_id, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(discord_user_id) DO UPDATE SET
                membership_type = excluded.membership_type,
                membership_id = excluded.membership_id,
                updated_at = excluded.updated_at
        `);
        stmt.run(discordUserId, Number(membershipType), String(membershipId), Date.now());
    },

    getDestinyProfile: (discordUserId) => {
        return db.prepare('SELECT * FROM destiny_profiles WHERE discord_user_id = ?').get(discordUserId);
    },

    getAllDestinyProfiles: () => {
        return db.prepare('SELECT * FROM destiny_profiles').all();
    },

    hasPostedInstance: (instanceId) => {
        return Boolean(db.prepare('SELECT 1 FROM destiny_posted_instances WHERE instance_id = ?').get(String(instanceId)));
    },

    markInstancePosted: (instanceId, discordUserId, activityType) => {
        db.prepare(
            'INSERT OR IGNORE INTO destiny_posted_instances (instance_id, discord_user_id, activity_type, posted_at) VALUES (?, ?, ?, ?)'
        ).run(String(instanceId), discordUserId ? String(discordUserId) : null, activityType ? String(activityType) : null, Date.now());
    },

    isMemberKnown: (membershipId, guildId) => {
        return Boolean(db.prepare('SELECT 1 FROM clan_member_tracking WHERE membership_id = ? AND guild_id = ?').get(String(membershipId), String(guildId)));
    },

    markMemberKnown: (membershipId, guildId) => {
        db.prepare(
            'INSERT OR IGNORE INTO clan_member_tracking (membership_id, guild_id, first_seen_at) VALUES (?, ?, ?)'
        ).run(String(membershipId), String(guildId), Date.now());
    },

    incrementActivityMessages: (userId, guildId, amount = 1) => {
        db.prepare(`
            INSERT INTO activity_stats (user_id, guild_id, messages_sent, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, guild_id) DO UPDATE SET
                messages_sent = messages_sent + excluded.messages_sent,
                last_updated = excluded.last_updated
        `).run(String(userId), String(guildId), amount, Date.now());
    },

    incrementActivityReactions: (userId, guildId, amount = 1) => {
        db.prepare(`
            INSERT INTO activity_stats (user_id, guild_id, reactions_added, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, guild_id) DO UPDATE SET
                reactions_added = reactions_added + excluded.reactions_added,
                last_updated = excluded.last_updated
        `).run(String(userId), String(guildId), amount, Date.now());
    },

    addActivityVoiceSeconds: (userId, guildId, seconds) => {
        if (!seconds || seconds <= 0) return;
        db.prepare(`
            INSERT INTO activity_stats (user_id, guild_id, voice_seconds, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, guild_id) DO UPDATE SET
                voice_seconds = voice_seconds + excluded.voice_seconds,
                last_updated = excluded.last_updated
        `).run(String(userId), String(guildId), Math.floor(seconds), Date.now());
    },

    getActivityStats: (userId, guildId) => {
        return db.prepare(
            'SELECT * FROM activity_stats WHERE user_id = ? AND guild_id = ?'
        ).get(String(userId), String(guildId));
    },

    getActivityLeaderboard: (guildId, sortBy = 'voice_seconds', limit = 10) => {
        const allowed = ['voice_seconds', 'messages_sent', 'reactions_added'];
        const column = allowed.includes(sortBy) ? sortBy : 'voice_seconds';
        return db.prepare(
            `SELECT * FROM activity_stats WHERE guild_id = ? AND ${column} > 0 ORDER BY ${column} DESC LIMIT ?`
        ).all(String(guildId), Math.max(1, Math.min(50, Number(limit) || 10)));
    },
};
