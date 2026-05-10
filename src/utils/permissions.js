const { PermissionFlagsBits } = require('discord.js');
const configService = require('../services/configService');
const { isSupportMember } = require('./mentions');

function isSupportUser(member, guildId) {
    const config = configService.get(guildId);
    return isSupportMember(member, config.ticketSystem.supportPingIds);
}

/**
 * Returns true if the member is a configured support user OR has the Administrator permission.
 */
function isAdminOrSupport(member, guildId) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return isSupportUser(member, guildId);
}

module.exports = { isSupportUser, isAdminOrSupport };
