const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { bungieFetch } = require('../services/destinyApi');
const FULL_CLEAR_COLOR = 0x05df72; // #05DF72
const CHECKPOINT_CLEAR_COLOR = 0xec4899; // pink
const FAILED_COLOR = 0xef4444; // red

function destinyClassEmoji(classType) {
    const cls = Number(classType);
    if (cls === 0) return '<:titan:1497609567415304202>';
    if (cls === 1) return '<:hunter:1497609483654795355>';
    if (cls === 2) return '<:warlock:1497609579830448178>';
    return '❔';
}

function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${m}m ${ss}s`;
    return `${m}m ${ss}s`;
}

function raidHubPgcrUrl(instanceId) {
    return `https://raidhub.io/pgcr/${instanceId}`;
}

function raidReportPgcrUrl(instanceId) {
    return `https://raid.report/pgcr/${instanceId}`;
}

function dungeonReportPgcrUrl(instanceId) {
    return `https://dungeon.report/pgcr/${instanceId}`;
}

function oryxPutzkolonnePgcrUrl(instanceId) {
    return `https://oryx-putzkolonne.vercel.app/pgcr/${instanceId}`;
}

function reportPlatformFromMembershipType(membershipType) {
    const t = Number(membershipType);
    if (t === 1) return 'xb';
    if (t === 2) return 'ps';
    if (t === 3) return 'pc';
    if (t === 4) return 'pc';
    if (t === 5) return 'stadia';
    if (t === 6) return 'pc';
    return null;
}

function raidhubProfileUrl(membershipId) {
    const id = String(membershipId || '').trim();
    if (!id) return null;
    return `https://raidhub.io/profile/${id}`;
}

function dungeonReportProfileUrl(membershipType, membershipId) {
    const platform = reportPlatformFromMembershipType(membershipType);
    const id = String(membershipId || '').trim();
    if (!platform || !id) return null;
    return `https://dungeon.report/${platform}/${id}`;
}

function isRaidMode(mode) {
    return Number(mode) === 4;
}

function isDungeonMode(mode) {
    return Number(mode) === 82;
}

function bungieAssetUrl(assetPath) {
    const raw = String(assetPath || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('/')) return `https://www.bungie.net${raw}`;
    return `https://www.bungie.net/${raw}`;
}

const activityDefCache = new Map(); // hash -> { name, icon, pgcrImage }
const classDefCache = new Map(); // hash -> classType
async function getActivityDefinition(hash) {
    const h = String(hash);
    if (activityDefCache.has(h)) return activityDefCache.get(h);

    const json = await bungieFetch(`/Destiny2/Manifest/DestinyActivityDefinition/${h}/`);
    const d = json?.Response;
    const name = d?.displayProperties?.name || 'Unbekannte Aktivität';
    const icon = bungieAssetUrl(d?.displayProperties?.icon);
    const pgcrImage = bungieAssetUrl(d?.pgcrImage);
    const out = { name, icon, pgcrImage };
    activityDefCache.set(h, out);
    return out;
}

async function getClassTypeFromHash(classHash) {
    const h = String(classHash || '');
    if (!h) return null;
    if (classDefCache.has(h)) return classDefCache.get(h);

    const json = await bungieFetch(`/Destiny2/Manifest/DestinyClassDefinition/${h}/`);
    const classType = Number(json?.Response?.classType);
    const out = Number.isFinite(classType) ? classType : null;
    classDefCache.set(h, out);
    return out;
}

async function getPgcr(instanceId) {
    const json = await bungieFetch(`/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`);
    return json?.Response || null;
}

async function resolveEntryClassType(entry) {
    const directCandidates = [
        entry?.player?.characterClass,
        entry?.player?.classType,
        entry?.characterClass,
        entry?.characterClassType,
    ];
    for (const candidate of directCandidates) {
        const n = Number(candidate);
        if (Number.isFinite(n) && n >= 0 && n <= 2) return n;
    }

    const hashCandidates = [
        entry?.player?.characterClassHash,
        entry?.player?.classHash,
        entry?.characterClassHash,
        entry?.classHash,
    ];
    for (const hash of hashCandidates) {
        const fromHash = await getClassTypeFromHash(hash).catch(() => null);
        if (fromHash != null) return fromHash;
    }

    return null;
}

async function buildFireteamLines(pgcr, mode, instanceId) {
    const entries = Array.isArray(pgcr?.entries) ? pgcr.entries : [];
    const isRaid = isRaidMode(mode);
    const isDungeon = isDungeonMode(mode);

    // Group entries by membershipId to handle character swaps
    const playerMap = new Map();

    for (const e of entries) {
        const p = e?.player?.destinyUserInfo;
        const membershipId = p?.membershipId;
        if (!membershipId) continue;

        if (!playerMap.has(membershipId)) {
            const name = p?.bungieGlobalDisplayName
                ? `${p.bungieGlobalDisplayName}#${String(p.bungieGlobalDisplayNameCode).padStart(4, '0')}`
                : (p?.displayName || 'Unknown');

            const profileUrl = isRaid
                ? raidhubProfileUrl(p?.membershipId)
                : isDungeon
                    ? dungeonReportProfileUrl(p?.membershipType, p?.membershipId)
                    : null;

            const fallbackUrl = !isRaid && !isDungeon ? raidHubPgcrUrl(instanceId) : null;
            const linkUrl = profileUrl || fallbackUrl;

            playerMap.set(membershipId, {
                linkedName: linkUrl ? `[${name}](${linkUrl})` : name,
                kills: 0,
                assists: 0,
                deaths: 0,
                maxPower: 0,
                classEmojis: new Set()
            });
        }

        const data = playerMap.get(membershipId);
        data.kills += Math.floor(Number(e?.values?.kills?.basic?.value ?? 0));
        data.assists += Math.floor(Number(e?.values?.assists?.basic?.value ?? 0));
        data.deaths += Math.floor(Number(e?.values?.deaths?.basic?.value ?? 0));

        const power = Math.floor(Number(e?.player?.lightLevel ?? 0));
        if (power > data.maxPower) data.maxPower = power;

        const classType = await resolveEntryClassType(e);
        if (classType != null) {
            data.classEmojis.add(destinyClassEmoji(classType));
        }
    }

    const rows = [...playerMap.values()].map(data => {
        const kd = (data.kills / Math.max(1, data.deaths)).toFixed(2);
        const powerText = data.maxPower > 0 ? ` (${data.maxPower})` : '';
        const emojisText = [...data.classEmojis].join('');

        return {
            emojisText,
            linkedName: data.linkedName,
            powerText,
            kills: data.kills,
            assists: data.assists,
            deaths: data.deaths,
            kd
        };
    });

    rows.sort((a, b) => {
        if (b.kills !== a.kills) return b.kills - a.kills;
        if (b.assists !== a.assists) return b.assists - a.assists;
        if (a.deaths !== b.deaths) return a.deaths - b.deaths;
        return 0;
    });

    return rows.map((r) =>
        `${r.emojisText} **${r.linkedName}**${r.powerText}\n` +
        `╰ \` ⚔️ ${r.kills} \` • \` 🤝 ${r.assists} \` • \` 💀 ${r.deaths} \` • \` 📈 ${r.kd} \``
    );
}

function getDurationFromPgcr(pgcr) {
    const primary = Number(pgcr?.activityDurationSeconds);
    if (Number.isFinite(primary) && primary > 0) return primary;

    const entries = Array.isArray(pgcr?.entries) ? pgcr.entries : [];
    let best = 0;
    for (const e of entries) {
        const played = Number(e?.values?.timePlayedSeconds?.basic?.value ?? 0);
        if (Number.isFinite(played) && played > best) best = played;
    }
    return best;
}

function getSummaryStats(pgcr) {
    const entries = Array.isArray(pgcr?.entries) ? pgcr.entries : [];
    let totalKills = 0;
    let totalDeaths = 0;
    for (const e of entries) {
        totalKills += Math.floor(Number(e?.values?.kills?.basic?.value ?? 0));
        totalDeaths += Math.floor(Number(e?.values?.deaths?.basic?.value ?? 0));
    }
    return { totalKills, totalDeaths };
}

function analyzeRun(pgcr, mode) {
    const entries = Array.isArray(pgcr?.entries) ? pgcr.entries : [];
    const uniqueByMembership = new Map();
    for (const e of entries) {
        const id = e?.player?.destinyUserInfo?.membershipId;
        if (!id) continue;
        if (!uniqueByMembership.has(id)) uniqueByMembership.set(id, e);
    }
    const uniqueEntries = [...uniqueByMembership.values()];
    const teamSize = uniqueEntries.length;

    const allFlawless = teamSize > 0 && uniqueEntries.every((e) => {
        const deaths = Number(e?.values?.deaths?.basic?.value ?? 0);
        return Number.isFinite(deaths) && deaths === 0;
    });

    const phaseCandidates = [
        pgcr?.startingPhaseIndex,
        pgcr?.activityDetails?.startingPhaseIndex,
        pgcr?.startingPhase?.index,
        pgcr?.activityDetails?.startingPhase?.index,
    ];
    let startingPhaseIndex = 0;
    for (const candidate of phaseCandidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) {
            startingPhaseIndex = parsed;
            break;
        }
    }
    const startFromBeginningCandidates = [
        pgcr?.activityWasStartedFromBeginning,
        pgcr?.activityDetails?.activityWasStartedFromBeginning,
    ];
    const startedFromBeginning = startFromBeginningCandidates.find((v) => typeof v === 'boolean');

    // In PvE, standing: 0 is often present even in wipes.
    // We must check if any player has 'completed: 1' OR 'completionReason: 0' (Objective Completed).
    const hasAnyCompleted = entries.some(e => Number(e?.values?.completed?.basic?.value) === 1);
    const hasAnyReasonSuccess = entries.some(e => Number(e?.values?.completionReason?.basic?.value) === 0);

    const wasSuccess = hasAnyCompleted || hasAnyReasonSuccess;

    const isCheckpointFromPhase = startingPhaseIndex > 0;
    const isCheckpointFromBoolean = startedFromBeginning === false;
    const isCheckpointClear = wasSuccess && (isCheckpointFromPhase || isCheckpointFromBoolean);
    const isFullClear = wasSuccess && !isCheckpointClear;
    const isRaid = isRaidMode(mode);
    const isDungeon = isDungeonMode(mode);

    return {
        isFullClear,
        isCheckpointClear,
        wasSuccess,
        teamFlawless: allFlawless,
        solo: isDungeon && teamSize === 1,
        trio: isRaid && teamSize === 3,
        duo: isRaid && teamSize === 2,
    };
}

async function postSummaryToDiscordForInteraction(client, { channelId, instanceId, mode }) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    const pgcr = await getPgcr(instanceId);
    if (!pgcr?.activityDetails) return;

    const directorHash = pgcr?.activityDetails?.directorActivityHash;
    const activityHash = pgcr?.activityDetails?.referenceId;
    const def =
        (activityHash ? await getActivityDefinition(activityHash).catch(() => null) : null) ||
        (directorHash ? await getActivityDefinition(directorHash).catch(() => null) : null);

    const isRaid = isRaidMode(mode);
    const isDungeon = isDungeonMode(mode);
    const localRaidImagePath = path.resolve(__dirname, '../images/raid.png');
    const localDungeonImagePath = path.resolve(__dirname, '../images/dungeon.png');

    const started = pgcr?.period ? new Date(pgcr.period) : null;
    const durationSeconds = getDurationFromPgcr(pgcr);
    const run = analyzeRun(pgcr, mode);
    const stats = getSummaryStats(pgcr);
    const ended = started ? new Date(started.getTime() + durationSeconds * 1000) : null;

    const activityName = def?.name || (isRaid ? 'Raid' : isDungeon ? 'Dungeon' : 'Activity');
    const typeLabel = isRaid ? 'Raid Completion' : isDungeon ? 'Dungeon Completion' : 'Activity Completion';

    const badges = [];
    if (run.wasSuccess) {
        if (run.isFullClear) badges.push('✅ Full');
        else badges.push('🚩 Checkpoint');
    } else {
        badges.push('❌ Wipe');
    }

    if (run.wasSuccess && run.solo) badges.push('👤 Solo');
    if (run.wasSuccess && run.duo) badges.push('👤👤 Duo');
    if (run.wasSuccess && run.trio) badges.push('👤👤👤 Trio');

    if (run.wasSuccess && run.teamFlawless) badges.push('✨ Flawless');

    const featCount = pgcr?.activityDetails?.selectedSkullHashes?.length || 0;
    if (featCount > 0) {
        badges.push(`🏆 ${featCount} Feats`);
    }

    const activityUrl = isDungeon 
        ? dungeonReportPgcrUrl(instanceId) 
        : raidHubPgcrUrl(instanceId);

    const embed = new EmbedBuilder()
        .setColor(!run.wasSuccess ? FAILED_COLOR : (run.isCheckpointClear ? CHECKPOINT_CLEAR_COLOR : FULL_CLEAR_COLOR))
        .setTitle(activityName)
        .setDescription(badges.length ? badges.map(b => `\`${b}\``).join(' ') : null)
        .setURL(activityUrl)
        .addFields(
            { name: '📅 Time', value: started ? `<t:${Math.floor(started.getTime() / 1000)}:f>` : 'Unknown', inline: true },
            { name: '⏱️ Duration', value: `\`${formatDuration(durationSeconds)}\``, inline: true }
        );

    const fireteamLines = await buildFireteamLines(pgcr, mode, instanceId);
    let currentFieldContent = '';
    let fieldIndex = 1;

    for (const line of fireteamLines) {
        if ((currentFieldContent + line + '\n\n').length > 1024) {
            embed.addFields({
                name: '\u200B',
                value: currentFieldContent.trim()
            });
            currentFieldContent = line + '\n\n';
            fieldIndex++;
        } else {
            currentFieldContent += line + '\n\n';
        }
    }

    if (currentFieldContent) {
        embed.addFields({
            name: '\u200B',
            value: currentFieldContent.trim()
        });
    }

    embed.setFooter({ text: `${channel.guild.name} • PGCR ID: ${instanceId}`, iconURL: channel.guild.iconURL() })
        .setTimestamp();

    const files = [];
    if (isRaid) {
        const fileName = 'raid.png';
        files.push(new AttachmentBuilder(localRaidImagePath, { name: fileName }));
        embed.setThumbnail(`attachment://${fileName}`);
    } else if (isDungeon) {
        const fileName = 'dungeon.png';
        files.push(new AttachmentBuilder(localDungeonImagePath, { name: fileName }));
        embed.setThumbnail(`attachment://${fileName}`);
    } else {
        const thumbnailUrl = def?.icon || def?.pgcrImage || null;
        if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    }

    if (def?.pgcrImage) {
        embed.setImage(def.pgcrImage);
    }

    const row = new ActionRowBuilder();
    if (isRaid) {
        row.addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Oryx-Putzkolonne').setURL(oryxPutzkolonnePgcrUrl(instanceId)),
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('RaidHub').setURL(raidHubPgcrUrl(instanceId)),
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Raid Report').setURL(raidReportPgcrUrl(instanceId))
        );
    } else if (isDungeon) {
        row.addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Oryx-Putzkolonne').setURL(oryxPutzkolonnePgcrUrl(instanceId)),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Dungeon Report')
                .setURL(dungeonReportPgcrUrl(instanceId))
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Oryx-Putzkolonne').setURL(oryxPutzkolonnePgcrUrl(instanceId)),
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('RaidHub').setURL(raidHubPgcrUrl(instanceId))
        );
    }

    await channel.send({ embeds: [embed], components: [row], files }).catch(err => {
        console.error('[DestinyEmbeds] Failed to send embed:', err);
    });
}

module.exports = { postSummaryToDiscordForInteraction };

