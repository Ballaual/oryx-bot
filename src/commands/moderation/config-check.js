const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config-check')
        .setDescription('Prueft, ob wichtige Config-IDs gueltig und erreichbar sind')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'Dieser Befehl funktioniert nur in einem Server.', flags: [MessageFlags.Ephemeral] });
        }

        const guild = interaction.guild;
        const checks = [];

        const pushResult = (ok, label, detail) => {
            checks.push(`${ok ? 'OK' : 'ERR'} ${label}: ${detail}`);
        };

        // Guild ID check
        pushResult(
            guild.id === config.guildId,
            'guildId',
            guild.id === config.guildId ? `passt (${config.guildId})` : `Config=${config.guildId}, Aktuell=${guild.id}`
        );

        // Role checks
        const roleIds = [
            ['bewerberRoleId', config.bewerberRoleId],
            ['clanMemberRoleId', config.clanMemberRoleId],
        ];
        for (const [key, id] of roleIds) {
            const role = id ? await guild.roles.fetch(id).catch(() => null) : null;
            pushResult(Boolean(role), key, role ? `gefunden (${role.name})` : `nicht gefunden (${id || 'leer'})`);
        }

        // Channel checks
        const channelIds = [
            ['ticketCategoryId', config.ticketCategoryId],
            ['rulesChannelId', config.rulesChannelId],
            ['clanChatId', config.clanChatId],
            ['musicChannelId', config.musicChannelId],
        ];
        for (const [key, id] of channelIds) {
            if (!id) {
                pushResult(true, key, 'leer/optional');
                continue;
            }
            const channel = await guild.channels.fetch(id).catch(() => null);
            pushResult(Boolean(channel), key, channel ? `gefunden (#${channel.name})` : `nicht gefunden (${id})`);
        }

        // supportPingIds can be roles or users
        if (!Array.isArray(config.supportPingIds) || config.supportPingIds.length === 0) {
            pushResult(false, 'supportPingIds', 'leer oder ungueltig');
        } else {
            let okCount = 0;
            for (const id of config.supportPingIds) {
                const role = await guild.roles.fetch(id).catch(() => null);
                const member = role ? null : await guild.members.fetch(id).catch(() => null);
                if (role || member) okCount++;
            }
            pushResult(okCount === config.supportPingIds.length, 'supportPingIds', `${okCount}/${config.supportPingIds.length} aufloesbar`);
        }

        // Destiny activity tracking checks
        const destiny = config.destinyActivityTracking;
        if (!destiny || typeof destiny !== 'object') {
            pushResult(false, 'destinyActivityTracking', 'fehlt oder ungueltig');
        } else {
            const enabled = Boolean(destiny.enabled);
            pushResult(true, 'destiny.enabled', String(enabled));

            if (!enabled) {
                pushResult(true, 'destiny', 'deaktiviert, weitere Checks uebersprungen');
            } else {
                const hasApiKey = Boolean(process.env.BUNGIE_API_KEY);
                pushResult(hasApiKey, 'BUNGIE_API_KEY', hasApiKey ? 'gesetzt' : 'fehlt (ENV)');

                const clanUrlOk = typeof destiny.clanUrl === 'string' && destiny.clanUrl.trim().length > 0;
                pushResult(clanUrlOk, 'destiny.clanUrl', clanUrlOk ? 'gesetzt' : 'leer/ungueltig');

                const pollMinutes = Number(destiny.pollIntervalMinutes);
                const pollOk = Number.isFinite(pollMinutes) && pollMinutes > 0;
                pushResult(pollOk, 'destiny.pollIntervalMinutes', pollOk ? String(pollMinutes) : `ungueltig (${destiny.pollIntervalMinutes})`);

                // Optional mode validation: empty, raid, dungeon
                const modeRaw = destiny.mode == null ? '' : String(destiny.mode).trim().toLowerCase();
                const modeOk = modeRaw === '' || modeRaw === 'raid' || modeRaw === 'dungeon';
                pushResult(modeOk, 'destiny.mode', modeRaw || 'leer (beide)');

                const cpTypeOk = typeof destiny.allowCheckpointClears === 'boolean';
                pushResult(cpTypeOk, 'destiny.allowCheckpointClears', cpTypeOk ? String(destiny.allowCheckpointClears) : 'muss boolean sein');

                // postChannelId optional; falls leer, fallback ueber clanChatId
                if (destiny.postChannelId) {
                    const postChannel = await guild.channels.fetch(destiny.postChannelId).catch(() => null);
                    pushResult(Boolean(postChannel), 'destiny.postChannelId', postChannel ? `gefunden (#${postChannel.name})` : `nicht gefunden (${destiny.postChannelId})`);
                } else if (config.clanChatId) {
                    const fallbackChannel = await guild.channels.fetch(config.clanChatId).catch(() => null);
                    pushResult(Boolean(fallbackChannel), 'destiny.postChannelId', fallbackChannel ? `leer -> Fallback clanChatId (#${fallbackChannel.name})` : `leer -> Fallback clanChatId ungueltig (${config.clanChatId})`);
                } else {
                    pushResult(false, 'destiny.postChannelId', 'leer und kein clanChatId-Fallback gesetzt');
                }
            }
        }

        const failed = checks.filter(line => line.startsWith('ERR')).length;
        const header = failed === 0 ? 'Config-Check erfolgreich: keine Fehler.' : `Config-Check abgeschlossen: ${failed} Problem(e) gefunden.`;
        await interaction.reply({
            content: `${header}\n\n${checks.map(c => `- ${c}`).join('\n')}`,
            flags: [MessageFlags.Ephemeral],
        });
    },
};
