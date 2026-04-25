const configService = require('../services/configService');
const { isSupportMember } = require('./mentions');

function isSupportUser(member, guildId) {
    const config = configService.get(guildId);
    return isSupportMember(member, config.supportPingIds);
}

module.exports = { isSupportUser };
