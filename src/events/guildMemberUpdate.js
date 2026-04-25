const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../services/database');
const configService = require('../services/configService');
const { createOnboardingMessage } = require('../utils/embeds');
const { buildSupportMentions, buildSupportOverwrites } = require('../utils/mentions');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        // Ensure we have the current member object
        const newM = newMember.partial ? await newMember.fetch().catch(() => null) : newMember;
        if (!newM) return;

        const config = configService.get(newM.guild.id);
        if (!config.ticketSystem.enabled) return;

        const roleId = config.ticketSystem.bewerberRoleId;
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
    const config = configService.get(guild.id);

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
            ...(await buildSupportOverwrites(guild, config.ticketSystem.supportPingIds, [PermissionFlagsBits.ViewChannel])),
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
            parent: config.ticketSystem.categoryId,
            permissionOverwrites,
            reason: `Neu-Zugang: ${member.user.tag}`,
        });

        db.addTicket(channel.id, member.id, guild.id);

        // Prepare and send onboarding message
        const onboardingData = createOnboardingMessage(member);
        const supportPings = await buildSupportMentions(guild, config.ticketSystem.supportPingIds);
        const rulesChannel = `<#${config.ticketSystem.rulesChannelId}>`;
        const welcomeText = config.ticketSystem.welcomeMessage
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
