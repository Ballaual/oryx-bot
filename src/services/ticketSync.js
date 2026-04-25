const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('./database');
const configService = require('./configService');
const { createOnboardingMessage } = require('../utils/embeds');
const { buildSupportMentions, buildSupportOverwrites } = require('../utils/mentions');

/**
 * Scans all guild members with the bewerber role and creates onboarding channels for those
 * who don't have an active ticket in the database yet.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{created:number, relinked:number, scanned:number}>}
 */
async function syncMissingTickets(client, guild) {
    console.log('[ticket-sync] Running ticket-sync...');
    const config = configService.get(guild.id);

    // Fetch all members so the cache is complete (requires GuildMembers intent)
    const members = await guild.members.fetch().catch(() => null);
    if (!members) {
        console.error('[ticket-sync] Could not fetch guild members.');
        return { created: 0, relinked: 0, scanned: 0 };
    }

    // Pre-scan the ticket category to re-register channels that fell out of DB
    const allChannels = await guild.channels.fetch().catch(() => null);
    const categoryChannels = allChannels
        ? allChannels.filter(ch => ch?.parentId === config.ticketCategoryId)
        : null;

    let created = 0;
    let relinked = 0;
    let scanned = 0;

    for (const [, member] of members) {
        if (!member.roles.cache.has(config.bewerberRoleId)) continue;
        scanned++;

        // Check DB first
        const existing = db.getTicketByUserId(member.id);
        if (existing) continue;

        // Check if a channel already exists in the category for this user (by username or nickname)
        if (categoryChannels) {
            const expectedByUsername = member.user.username.toLowerCase();
            const expectedByNickname = member.nickname
                ? member.nickname.replace('#', '_').toLowerCase()
                : null;

            const matchingChannel = categoryChannels.find(ch =>
                ch.name === expectedByUsername ||
                (expectedByNickname && ch.name === expectedByNickname)
            );

            if (matchingChannel) {
                console.log(`[ticket-sync] Kanal für ${member.user.tag} bereits vorhanden (${matchingChannel.id}), wird in DB eingetragen.`);
                db.addTicket(matchingChannel.id, member.id, guild.id);
                relinked++;
                continue;
            }
        }

        console.log(`[ticket-sync] No ticket found for ${member.user.tag} — creating one now...`);
        try {
            const permissionOverwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: member.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                },
                ...(await buildSupportOverwrites(guild, config.supportPingIds, [PermissionFlagsBits.ViewChannel])),
            ];

            if (process.env.BOT_OWNER) {
                permissionOverwrites.push({
                    id: process.env.BOT_OWNER,
                    allow: [PermissionFlagsBits.ViewChannel],
                });
            }

            const channel = await guild.channels.create({
                name: member.user.username.toLowerCase(),
                type: ChannelType.GuildText,
                parent: config.ticketCategoryId,
                permissionOverwrites,
                reason: `Ticket-Sync: fehlender Ticket für ${member.user.tag}`,
            });

            db.addTicket(channel.id, member.id, guild.id);

            const onboardingData = createOnboardingMessage(member);
            const supportPings = await buildSupportMentions(guild, config.supportPingIds);
            const rulesChannel = `<#${config.rulesChannelId}>`;
            const welcomeText = config.welcomeMessage
                .replace('{user}', `<@${member.id}>`)
                .replace('{support}', supportPings)
                .replace('{rules}', rulesChannel);

            await channel.send({ content: welcomeText, ...onboardingData });

            console.log(`[ticket-sync] Ticket-Kanal erstellt für ${member.user.tag}: ${channel.name} (${channel.id})`);
            created++;
        } catch (err) {
            console.error(`[ticket-sync] Failed to create ticket channel for ${member.user.tag}:`, err);
        }
    }

    console.log(`[ticket-sync] Done. scanned=${scanned} created=${created} relinked=${relinked}`);
    return { created, relinked, scanned };
}

module.exports = { syncMissingTickets };
