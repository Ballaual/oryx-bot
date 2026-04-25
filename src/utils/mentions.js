/**
 * Resolves a list of IDs (from config.ticketSystem.supportPingIds) into mention strings,
 * auto-detecting whether each ID belongs to a role or a user.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string[]} ids  - Array of role/user IDs
 * @returns {Promise<string>} - Space-joined mention string, e.g. "<@&ROLE_ID> <@USER_ID>"
 */
async function buildSupportMentions(guild, ids) {
    const mentions = [];
    for (const id of ids) {
        if (guild.roles.cache.has(id)) {
            mentions.push(`<@&${id}>`);
        } else {
            // Try to confirm it's a guild member; fall back to role-mention if lookup fails
            const member = await guild.members.fetch(id).catch(() => null);
            if (member) {
                mentions.push(`<@${id}>`);
            } else {
                // Unknown – treat as role mention (safe default)
                mentions.push(`<@&${id}>`);
            }
        }
    }
    return mentions.join(' ');
}

/**
 * Builds Discord permission-overwrite objects for a list of IDs,
 * auto-detecting role vs. user so that Discord.js applies the correct overwrite type.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string[]} ids
 * @param {import('discord.js').PermissionResolvable[]} allow
 * @returns {Promise<Object[]>}
 */
async function buildSupportOverwrites(guild, ids, allow) {
    const overwrites = [];
    for (const id of ids) {
        let type;
        if (guild.roles.cache.has(id)) {
            type = 0; // Role
        } else {
            const member = await guild.members.fetch(id).catch(() => null);
            type = member ? 1 : 0; // 1 = Member, 0 = Role (safe fallback)
        }
        overwrites.push({ id, type, allow });
    }
    return overwrites;
}

/**
 * Checks whether a guild member counts as a "support" user,
 * matching either by role ID or by user ID against config.ticketSystem.supportPingIds.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string[]} supportIds
 * @returns {boolean}
 */
function isSupportMember(member, supportIds) {
    if (!member) return false;
    // Match by user ID directly
    if (supportIds.includes(member.id)) return true;
    // Match by any assigned role
    return member.roles.cache.some(role => supportIds.includes(role.id));
}

module.exports = { buildSupportMentions, buildSupportOverwrites, isSupportMember };
