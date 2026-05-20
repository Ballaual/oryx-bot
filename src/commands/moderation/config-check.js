const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const configService = require('../../services/configService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config-check')
        .setDescription('Prüft, ob wichtige Config-IDs gültig und erreichbar sind')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'Dieser Befehl funktioniert nur in einem Server.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guild = interaction.guild;
        const config = configService.get(guild.id);
        let totalErrors = 0;

        // ── Helper ──
        const ok = (label, detail) => `✅  \`${label}\` — ${detail}`;
        const err = (label, detail) => { totalErrors++; return `❌  \`${label}\` — ${detail}`; };
        const info = (label, detail) => `ℹ️  \`${label}\` — ${detail}`;
        const skip = (label, detail) => `⏭️  \`${label}\` — ${detail}`;

        async function resolveRole(id) {
            return id ? guild.roles.fetch(id).catch(() => null) : null;
        }
        async function resolveChannel(id) {
            return id ? guild.channels.fetch(id).catch(() => null) : null;
        }

        // ═══════════════════════════════════════
        // 🎫  TICKET SYSTEM
        // ═══════════════════════════════════════
        const ticketLines = [];
        const ts = config.ticketSystem;

        ticketLines.push(ts.enabled ? ok('Aktiviert', 'Ja') : info('Aktiviert', 'Nein'));

        if (ts.enabled) {
            // Bewerber-Rolle
            const bewerberRole = await resolveRole(ts.bewerberRoleId);
            ticketLines.push(bewerberRole
                ? ok('Bewerber-Rolle', `${bewerberRole.name}`)
                : err('Bewerber-Rolle', ts.bewerberRoleId ? `ID \`${ts.bewerberRoleId}\` nicht gefunden` : 'nicht gesetzt'));

            // Clan-Mitglied-Rolle
            const clanRole = await resolveRole(ts.clanMemberRoleId);
            ticketLines.push(clanRole
                ? ok('Clan-Rolle', `${clanRole.name}`)
                : err('Clan-Rolle', ts.clanMemberRoleId ? `ID \`${ts.clanMemberRoleId}\` nicht gefunden` : 'nicht gesetzt'));

            // Kategorie
            const category = await resolveChannel(ts.categoryId);
            ticketLines.push(category
                ? ok('Kategorie', `#${category.name}`)
                : err('Kategorie', ts.categoryId ? `ID \`${ts.categoryId}\` nicht gefunden` : 'nicht gesetzt'));

            // Regeln-Kanal
            const rulesChannel = await resolveChannel(ts.rulesChannelId);
            ticketLines.push(rulesChannel
                ? ok('Regeln-Kanal', `<#${rulesChannel.id}>`)
                : err('Regeln-Kanal', ts.rulesChannelId ? `ID \`${ts.rulesChannelId}\` nicht gefunden` : 'nicht gesetzt'));

            // Clan-Chat
            const clanChat = await resolveChannel(ts.clanChatId);
            if (ts.clanChatId) {
                ticketLines.push(clanChat
                    ? ok('Clan-Chat', `<#${clanChat.id}>`)
                    : err('Clan-Chat', `ID \`${ts.clanChatId}\` nicht gefunden`));
            } else {
                ticketLines.push(info('Clan-Chat', 'nicht gesetzt (optional)'));
            }

            // Support-Pings
            if (!Array.isArray(ts.supportPingIds) || ts.supportPingIds.length === 0) {
                ticketLines.push(err('Support-Pings', 'keine konfiguriert'));
            } else {
                let resolved = 0;
                for (const id of ts.supportPingIds) {
                    const role = await guild.roles.fetch(id).catch(() => null);
                    const member = role ? null : await guild.members.fetch(id).catch(() => null);
                    if (role || member) resolved++;
                }
                ticketLines.push(resolved === ts.supportPingIds.length
                    ? ok('Support-Pings', `${resolved}/${ts.supportPingIds.length} auflösbar`)
                    : err('Support-Pings', `${resolved}/${ts.supportPingIds.length} auflösbar`));
            }

            // Timing
            ticketLines.push(info('Ping nach', `${ts.pingThresholdHours || 24}h Inaktivität`));
            ticketLines.push(info('Kick nach', `${ts.kickThresholdHours || 72}h Inaktivität`));
        }

        // ═══════════════════════════════════════
        // 👋  WELCOMER
        // ═══════════════════════════════════════
        const welcomerLines = [];
        const wc = config.welcomer;

        welcomerLines.push(wc?.enabled ? ok('Aktiviert', 'Ja') : info('Aktiviert', 'Nein'));

        if (wc?.enabled) {
            const wcChannel = await resolveChannel(wc.channelId);
            welcomerLines.push(wcChannel
                ? ok('Kanal', `<#${wcChannel.id}>`)
                : err('Kanal', wc.channelId ? `ID \`${wc.channelId}\` nicht gefunden` : 'nicht gesetzt'));
        }

        // ═══════════════════════════════════════
        // 🎵  MUSIK
        // ═══════════════════════════════════════
        const musicLines = [];
        const mc = config.music;

        musicLines.push(mc?.enabled ? ok('Aktiviert', 'Ja') : info('Aktiviert', 'Nein'));

        if (mc?.enabled && mc.channelId) {
            const musicChannel = await resolveChannel(mc.channelId);
            musicLines.push(musicChannel
                ? ok('Voice-Kanal', `${musicChannel.name}`)
                : err('Voice-Kanal', `ID \`${mc.channelId}\` nicht gefunden`));
        } else if (mc?.enabled) {
            musicLines.push(info('Voice-Kanal', 'kein fester Kanal (flexibel)'));
        }

        // ═══════════════════════════════════════
        // 📊  ACTIVITY TRACKING
        // ═══════════════════════════════════════
        const activityLines = [];
        const at = config.activityTracking;
        activityLines.push(at?.enabled ? ok('Aktiviert', 'Ja') : info('Aktiviert', 'Nein'));

        // ═══════════════════════════════════════
        // 🔮  DESTINY 2
        // ═══════════════════════════════════════
        const destinyLines = [];
        const dt = config.destinyActivityTracking;

        if (!dt || typeof dt !== 'object') {
            destinyLines.push(err('Konfiguration', 'fehlt oder ungültig'));
        } else {
            destinyLines.push(dt.enabled ? ok('Aktiviert', 'Ja') : info('Aktiviert', 'Nein'));

            if (dt.enabled) {
                // API Key
                const hasApiKey = Boolean(process.env.BUNGIE_API_KEY);
                destinyLines.push(hasApiKey
                    ? ok('Bungie API Key', 'gesetzt')
                    : err('Bungie API Key', 'fehlt (ENV)'));

                // Clan URL
                const clanUrlOk = typeof dt.clanUrl === 'string' && dt.clanUrl.trim().length > 0;
                destinyLines.push(clanUrlOk
                    ? ok('Clan URL', 'gesetzt')
                    : err('Clan URL', 'leer oder ungültig'));

                // Poll Interval
                const pollMinutes = Number(dt.pollIntervalMinutes);
                const pollOk = Number.isFinite(pollMinutes) && pollMinutes > 0;
                destinyLines.push(pollOk
                    ? ok('Poll-Intervall', `${pollMinutes} Minuten`)
                    : err('Poll-Intervall', `ungültig (${dt.pollIntervalMinutes})`));

                // Mode
                const modeRaw = dt.mode == null ? '' : String(dt.mode).trim().toLowerCase();
                const modeOk = modeRaw === '' || modeRaw === 'raid' || modeRaw === 'dungeon';
                const modeLabel = modeRaw || 'Alle (Raid + Dungeon)';
                destinyLines.push(modeOk
                    ? ok('Modus', modeLabel)
                    : err('Modus', `ungültig: "${dt.mode}"`));

                // Checkpoints
                destinyLines.push(ok('Checkpoint Clears', dt.allowCheckpointClears ? 'erlaubt' : 'nicht erlaubt'));

                // Post Channel
                if (dt.postChannelId) {
                    const postChannel = await resolveChannel(dt.postChannelId);
                    destinyLines.push(postChannel
                        ? ok('Post-Kanal', `<#${postChannel.id}>`)
                        : err('Post-Kanal', `ID \`${dt.postChannelId}\` nicht gefunden`));
                } else if (ts.clanChatId) {
                    const fallback = await resolveChannel(ts.clanChatId);
                    destinyLines.push(fallback
                        ? ok('Post-Kanal', `Fallback → <#${fallback.id}>`)
                        : err('Post-Kanal', `Fallback clanChatId ungültig`));
                } else {
                    destinyLines.push(err('Post-Kanal', 'nicht gesetzt und kein Fallback vorhanden'));
                }
            }
        }

        // ═══════════════════════════════════════
        //  BUILD EMBEDS
        // ═══════════════════════════════════════
        const embedColor = totalErrors === 0 ? 0x2ECC71 : totalErrors <= 2 ? 0xF1C40F : 0xE74C3C;
        const statusIcon = totalErrors === 0 ? '🟢' : totalErrors <= 2 ? '🟡' : '🔴';

        const embed = new EmbedBuilder()
            .setTitle(`${statusIcon}  Config-Check — ${guild.name}`)
            .setColor(embedColor)
            .setDescription(totalErrors === 0
                ? '**Alle Prüfungen bestanden!** Die Konfiguration ist vollständig.'
                : `**${totalErrors} Problem${totalErrors > 1 ? 'e' : ''} gefunden.** Bitte mit \`/setup\` beheben.`)
            .addFields(
                { name: '🎫  Ticket-System', value: ticketLines.join('\n') || '*Nicht konfiguriert*' },
                { name: '👋  Welcomer', value: welcomerLines.join('\n') || '*Nicht konfiguriert*' },
                { name: '🎵  Musik', value: musicLines.join('\n') || '*Nicht konfiguriert*' },
                { name: '📊  Activity-Tracking', value: activityLines.join('\n') || '*Nicht konfiguriert*' },
                { name: '🔮  Destiny 2 Tracker', value: destinyLines.join('\n') || '*Nicht konfiguriert*' },
            )
            .setFooter({ text: `Guild-ID: ${guild.id}`, iconURL: guild.iconURL() })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

