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
        created_at INTEGER NOT NULL
    )
`);

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

module.exports = {
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
};
