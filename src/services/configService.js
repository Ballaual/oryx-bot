const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '../../config');
const GLOBAL_CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const cache = new Map();

const DEFAULT_CONFIG = {
    ticketCategoryId: "",
    bewerberRoleId: "",
    rulesChannelId: "",
    supportPingIds: [],
    clanMemberRoleId: "",
    clanChatId: "",
    clanChatMessage: "Willkommen, {user}! 🎉 Schön, dass du dabei bist!",
    welcomeMessage: "Hallo {user} und willkommen auf unserem Server!\n\nBevor es weitergeht lies dir bitte einmal unsere Server-Regeln in {rules} durch.\n\nIm Anschluss wird sich unser Team {support} schnellstmöglich bei dir melden.",
    inactivityPingMessage: "Hey {user} und {support}! In diesem Ticket herrscht bereits seit über {hours} Stunden Funkstille...👀\nDas Ticket wird nach weiteren {remainingHours} Stunden automatisch geschlossen.",
    kickReason: "Inaktivität für mehr als {hours} Stunden.",
    checkIntervalMinutes: 30,
    pingThresholdHours: 24,
    kickThresholdHours: 72,
    musicChannelId: "",
    destinyActivityTracking: {
        enabled: false,
        clanUrl: "",
        postChannelId: "",
        pollIntervalMinutes: 3,
        mode: "",
        allowCheckpointClears: true
    }
};

function getGuildConfigPath(guildId) {
    return path.join(CONFIG_DIR, `${guildId}.json`);
}

function loadConfig(guildId) {
    const configPath = getGuildConfigPath(guildId);
    if (fs.existsSync(configPath)) {
        try {
            const fileData = fs.readFileSync(configPath, 'utf8');
            const data = JSON.parse(fileData);
            return { ...DEFAULT_CONFIG, ...data };
        } catch (error) {
            console.error(`[ConfigService] Error reading config for guild ${guildId}:`, error);
        }
    }
    return { ...DEFAULT_CONFIG };
}

/**
 * Returns the configuration for a given guild ID.
 * @param {string} guildId 
 * @returns {typeof DEFAULT_CONFIG}
 */
function get(guildId) {
    if (!guildId) return { ...DEFAULT_CONFIG };
    if (!cache.has(guildId)) {
        cache.set(guildId, loadConfig(guildId));
    }
    return cache.get(guildId);
}

/**
 * Updates the configuration for a given guild ID and saves to disk.
 * @param {string} guildId 
 * @param {Partial<typeof DEFAULT_CONFIG>} updates 
 */
function set(guildId, updates) {
    if (!guildId) return;
    const current = get(guildId);
    
    // Deep merge for destinyActivityTracking
    const newConfig = { ...current, ...updates };
    if (updates.destinyActivityTracking) {
        newConfig.destinyActivityTracking = {
            ...current.destinyActivityTracking,
            ...updates.destinyActivityTracking
        };
    }
    
    cache.set(guildId, newConfig);

    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    try {
        fs.writeFileSync(getGuildConfigPath(guildId), JSON.stringify(newConfig, null, 2), 'utf8');
    } catch (error) {
        console.error(`[ConfigService] Error writing config for guild ${guildId}:`, error);
    }
}

/**
 * Migrates old config.json to <guildId>.json if it has a guildId.
 */
function migrate() {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf8'));
            if (data.guildId) {
                const guildId = data.guildId;
                const newPath = getGuildConfigPath(guildId);
                
                // If guild config doesn't exist yet, copy it over
                if (!fs.existsSync(newPath)) {
                    console.log(`[ConfigService] Migrating global config.json to ${guildId}.json...`);
                    // Clean up botOwner and guildId from the new config as they are not needed per-guild
                    delete data.botOwner;
                    delete data.guildId;
                    fs.writeFileSync(newPath, JSON.stringify(data, null, 2), 'utf8');
                }
                
                // Rename old config to avoid re-migration/confusion
                const backupPath = path.join(CONFIG_DIR, 'config.json.backup');
                fs.renameSync(GLOBAL_CONFIG_PATH, backupPath);
                console.log(`[ConfigService] Original config.json renamed to config.json.backup`);
            }
        } catch (error) {
            console.error(`[ConfigService] Error migrating config.json:`, error);
        }
    }
}

module.exports = {
    get,
    set,
    migrate,
    DEFAULT_CONFIG
};
