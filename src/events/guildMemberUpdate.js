const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../services/database');
const config = require('../../config/config.json');
const { createOnboardingMessage } = require('../utils/embeds');
const { buildSupportMentions, buildSupportOverwrites } = require('../utils/mentions');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        // Only track specific guild
        if (newMember.guild.id !== config.guildId) return;

        // Ensure we have the current member object
        const newM = newMember.partial ? await newMember.fetch().catch(() => null) : newMember;
        if (!newM) return;

        const roleId = config.bewerberRoleId;
        const hasRoleNow = newM.roles.cache.has(roleId);

        if (hasRoleNow) {
            // Check if user already has an active onboarding channel
            const existingTicket = db.getTicketByUserId(newM.id);
            if (!existingTicket) {
                await handleNewApplicant(newM);
            }
        }
    },
};

/**
 * Handles logic for a new applicant (role added).
 * Creates a permission-restricted text channel in the configured ticket category.
 * @param {import('discord.js').GuildMember} member
 */
async function handleNewApplicant(member) {
    console.log(`[guildMemberUpdate] Rolle hinzugefügt für ${member.user.tag}. Starte Onboarding...`);

    const { guild } = member;

    try {
        // Build permission overwrites: deny @everyone, allow bewerber + support roles
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: guild.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                ],
            },
            {
                id: member.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                ],
            },
            ...(await buildSupportOverwrites(guild, config.supportPingIds, [PermissionFlagsBits.ViewChannel])),
        ];

        if (config.botOwner) {
            permissionOverwrites.push({
                id: config.botOwner,
                allow: [PermissionFlagsBits.ViewChannel],
            });
        }

        const channel = await guild.channels.create({
            name: member.user.username.toLowerCase(),
            type: ChannelType.GuildText,
            parent: config.ticketCategoryId,
            permissionOverwrites,
            reason: `Neu-Zugang: ${member.user.tag}`,
        });

        db.addTicket(channel.id, member.id, guild.id);

        // Prepare and send onboarding message
        const onboardingData = createOnboardingMessage(member);
        const supportPings = await buildSupportMentions(guild, config.supportPingIds);
        const rulesChannel = `<#${config.rulesChannelId}>`;
        const welcomeText = config.welcomeMessage
            .replace('{user}', `<@${member.id}>`)
            .replace('{support}', supportPings)
            .replace('{rules}', rulesChannel);

        await channel.send({
            content: welcomeText,
            ...onboardingData
        });

        console.log(`[guildMemberUpdate] Ticket-Kanal erstellt: ${channel.name} (${channel.id})`);
    } catch (error) {
        console.error('[guildMemberUpdate] Fehler beim Erstellen des Ticket-Kanals:', error);
    }
}
