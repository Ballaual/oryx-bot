const configService = require('../services/configService');
const { isSupportMember } = require('./mentions');

function isSupportUser(member, guildId) {
    const config = configService.get(guildId);
    return isSupportMember(member, config.ticketSystem.supportPingIds);
}

module.exports = { isSupportUser };
