const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const configService = require('../services/configService');
const db = require('../services/database');
const { createWelcomeEmbed, createOnboardingMessage } = require('../utils/embeds');
const { buildSupportMentions, buildSupportOverwrites } = require('../utils/mentions');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        const config = configService.get(member.guild.id);

        // 1. Welcomer message
        if (config.welcomer?.enabled && config.welcomer.channelId) {
            try {
                const channel = await member.guild.channels.fetch(config.welcomer.channelId).catch(() => null);
                if (channel?.isTextBased()) {
                    const welcomeEmbed = createWelcomeEmbed(member, config.welcomer.welcomeMessage);
                    await channel.send({ embeds: [welcomeEmbed] });
                }
            } catch (error) {
                console.error(`[Event: GuildMemberAdd] Fehler beim Senden der Willkommensnachricht für ${member.user.tag}:`, error);
            }
        }

        // 2. Check for bewerber role after a short delay
        //    Discord may assign auto-roles slightly after the join event fires,
        //    so we wait a moment and re-fetch the member to get the final role state.
        if (!config.ticketSystem?.enabled || !config.ticketSystem.bewerberRoleId) return;

        setTimeout(async () => {
            try {
                const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
                if (!freshMember) return;

                if (freshMember.roles.cache.has(config.ticketSystem.bewerberRoleId)) {
                    const existingTicket = db.getTicketByUserId(freshMember.id);
                    if (!existingTicket) {
                        console.log(`[GuildMemberAdd] ${freshMember.user.tag} joined with bewerber role — creating ticket...`);
                        await createTicketForMember(freshMember, config);
                    }
                }
            } catch (error) {
                console.error(`[GuildMemberAdd] Error checking bewerber role for ${member.user?.tag}:`, error);
            }
        }, 3000); // 3 seconds delay to let Discord apply auto-roles
    },
};

/**
 * Creates an onboarding ticket channel for the given member.
 * @param {import('discord.js').GuildMember} member
 * @param {object} config
 */
async function createTicketForMember(member, config) {
    const { guild } = member;

    try {
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: guild.client.user.id,
                allow: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: member.id,
                allow: [PermissionFlagsBits.ViewChannel],
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

        const onboardingData = createOnboardingMessage(member);
        const supportPings = await buildSupportMentions(guild, config.ticketSystem.supportPingIds);
        const rulesChannel = `<#${config.ticketSystem.rulesChannelId}>`;
        const welcomeText = config.ticketSystem.welcomeMessage
            .replace('{user}', `<@${member.id}>`)
            .replace('{support}', supportPings)
            .replace('{rules}', rulesChannel);

        await channel.send({ content: welcomeText, ...onboardingData });

        console.log(`[GuildMemberAdd] Ticket-Kanal erstellt: ${channel.name} (${channel.id})`);
    } catch (error) {
        console.error(`[GuildMemberAdd] Fehler beim Erstellen des Ticket-Kanals für ${member.user.tag}:`, error);
    }
}
