const config = require('../../config/config.json');
const db = require('./database');
const {
    parseGroupIdFromClanUrl,
    listClanMembers,
    getCharacterIds,
    getRecentActivities,
    getPgcr,
    isCompletedFromActivityHistory,
    getActivityInstanceId,
    getActivityPeriodMs,
} = require('./destinyApi');
const { postSummaryToDiscordForInteraction } = require('../utils/destinyEmbeds');

const DEFAULT_POLL_MINUTES = 3;
let warmupCompleted = false;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function isRaidMode(mode) {
    // Destiny2ActivityModeType.Raid = 4
    return Number(mode) === 4;
}

function isDungeonMode(mode) {
    // Destiny2ActivityModeType.Dungeon = 82 (current Bungie enum)
    return Number(mode) === 82;
}

async function postSummaryToDiscord(client, { channelId, instanceId, mode }) {
    return postSummaryToDiscordForInteraction(client, { channelId, instanceId, mode });
}

function getTrackerFilters() {
    const settings = config?.destinyActivityTracking || {};
    const modeFilter = String(settings?.mode || '').trim().toLowerCase();
    return {
        allowCheckpointClears: settings?.allowCheckpointClears === true,
        modeFilter: modeFilter === 'raid' || modeFilter === 'dungeon' ? modeFilter : null,
    };
}

function modeAllowed(mode, modeFilter) {
    if (!modeFilter) return true;
    if (modeFilter === 'raid') return isRaidMode(mode);
    if (modeFilter === 'dungeon') return isDungeonMode(mode);
    return true;
}

function analyzePgcrForFilters(pgcr) {
    const startingPhaseIndex = Number(pgcr?.startingPhaseIndex ?? 0);
    const isCheckpointClear = Number.isFinite(startingPhaseIndex) && startingPhaseIndex > 0;
    return { isCheckpointClear };
}

async function shouldPostActivity(instanceId, mode, filters) {
    if (!modeAllowed(mode, filters.modeFilter)) return false;

    const pgcr = await getPgcr(instanceId).catch(() => null);
    if (!pgcr) return false;

    const run = analyzePgcrForFilters(pgcr);
    if (!filters.allowCheckpointClears && run.isCheckpointClear) return false;
    return true;
}

async function pollOnce(client) {
    const enabled = config?.destinyActivityTracking?.enabled !== false;
    if (!enabled) return;

    const channelId =
        config?.destinyActivityTracking?.postChannelId ||
        config?.clanChatId;
    if (!channelId) return;

    const groupId = parseGroupIdFromClanUrl(config?.destinyActivityTracking?.clanUrl);
    if (!groupId) {
        console.warn('[DestinyTracker] clanUrl missing/invalid (config.destinyActivityTracking.clanUrl)');
        return;
    }

    let clanMembers = [];
    const filters = getTrackerFilters();
    try {
        clanMembers = await listClanMembers(groupId);
    } catch (e) {
        console.warn('[DestinyTracker] listClanMembers failed:', e?.message || e);
        return;
    }

    for (const m of clanMembers) {
        const membershipId = m.membershipId;
        const membershipType = m.membershipType;

        let characterIds = [];
        try {
            characterIds = await getCharacterIds(membershipType, membershipId);
        } catch (e) {
            console.warn('[DestinyTracker] getCharacterIds failed:', e?.message || e);
            continue;
        }

        const modesToCheck = [4, 82];
        for (const characterId of characterIds) {
            for (const mode of modesToCheck) {
                let activities = [];
                try {
                    activities = await getRecentActivities(membershipType, membershipId, characterId, mode, 10);
                } catch (e) {
                    console.warn('[DestinyTracker] getRecentActivities failed:', e?.message || e);
                    continue;
                }

                // Post newest first (most recent period first)
                const sorted = activities
                    .slice()
                    .sort((a, b) => getActivityPeriodMs(b) - getActivityPeriodMs(a));

                for (const a of sorted) {
                    if (!isCompletedFromActivityHistory(a)) continue;
                    const instanceId = getActivityInstanceId(a);
                    if (!instanceId) continue;

                    if (db.hasPostedInstance(instanceId)) continue;

                    if (!warmupCompleted) {
                        // On first pass after startup, only register already-finished activities
                        // to avoid backfilling historical runs into Discord.
                        db.markInstancePosted(instanceId, null, isRaidMode(mode) ? 'raid' : isDungeonMode(mode) ? 'dungeon' : 'activity');
                        continue;
                    }

                    const passesFilters = await shouldPostActivity(instanceId, mode, filters);
                    if (!passesFilters) {
                        db.markInstancePosted(instanceId, null, isRaidMode(mode) ? 'raid' : isDungeonMode(mode) ? 'dungeon' : 'activity');
                        continue;
                    }

                    db.markInstancePosted(instanceId, null, isRaidMode(mode) ? 'raid' : isDungeonMode(mode) ? 'dungeon' : 'activity');
                    await postSummaryToDiscord(client, { channelId, instanceId, mode });
                    await sleep(900);
                }
            }
        }

        await sleep(350);
    }

    if (!warmupCompleted) {
        warmupCompleted = true;
        console.log('[DestinyTracker] warmup complete - posting only new activities from now on.');
    }
}

function startDestinyActivityTracker(client) {
    const enabled = config?.destinyActivityTracking?.enabled !== false;
    if (!enabled) {
        console.log('[DestinyTracker] disabled via config.destinyActivityTracking.enabled=false');
        return;
    }

    const pollMinutes = Number(config?.destinyActivityTracking?.pollIntervalMinutes ?? DEFAULT_POLL_MINUTES);
    const intervalMs = Math.max(1, pollMinutes) * 60 * 1000;

    console.log(`[DestinyTracker] starting (interval=${pollMinutes}m)`);

    // initial delay (let bot finish startup)
    setTimeout(() => {
        pollOnce(client).catch((e) => console.error('[DestinyTracker] pollOnce error:', e));
    }, 15_000);

    setInterval(() => {
        pollOnce(client).catch((e) => console.error('[DestinyTracker] pollOnce error:', e));
    }, intervalMs);
}

module.exports = { startDestinyActivityTracker };

