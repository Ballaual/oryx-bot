const config = require('../../config/config.json');
const { isSupportMember } = require('./mentions');

function isSupportUser(member) {
    return isSupportMember(member, config.supportPingIds);
}

module.exports = { isSupportUser };
