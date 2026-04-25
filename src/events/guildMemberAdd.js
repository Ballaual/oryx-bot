const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../services/database');
const config = require('../../config/config.json');
const { createOnboardingMessage } = require('../utils/embeds');
const { buildSupportMentions, buildSupportOverwrites } = require('../utils/mentions');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Only track specific guild
        if (member.guild.id !== config.guildId) return;

        // Fetch the full member object to ensure roles are loaded
        // (Discord may not include roles immediately on join via invite-with-role)
        const freshMember = await member.fetch().catch(() => null);
        if (!freshMember) return;

        const roleId = config.bewerberRoleId;
        const hasRole = freshMember.roles.cache.has(roleId);

        if (!hasRole) return; // No bewerber role assigned on join → guildMemberUpdate will handle it

        // Check if an active onboarding channel already exists (safety guard)
        const existingTicket = db.getTicketByUserId(freshMember.id);
        if (existingTicket) return;

        console.log(`[guildMemberAdd] ${freshMember.user.tag} joined with bewerber role via invite. Starting onboarding...`);
        await handleNewApplicant(freshMember);
    },
};

/**
 * Handles logic for a new applicant who already has the bewerber role on join.
 * Creates a permission-restricted text channel in the configured ticket category.
 * @param {import('discord.js').GuildMember} member
 */
async function handleNewApplicant(member) {
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
            reason: `Neu-Zugang via Invite: ${member.user.tag}`,
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

        console.log(`[guildMemberAdd] Ticket-Kanal erstellt: ${channel.name} (${channel.id})`);
    } catch (error) {
        console.error('[guildMemberAdd] Fehler beim Erstellen des Ticket-Kanals:', error);
    }
}
