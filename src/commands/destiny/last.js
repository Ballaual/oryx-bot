const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../../config/config.json');
const {
    findLatestCompletedForClan,
    getPgcr,
    parseGroupIdFromClanUrl,
} = require('../../services/destinyApi');
const { postSummaryToDiscordForInteraction } = require('../../utils/destinyEmbeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('last')
        .setDescription('Postet die letzte Clan- oder Spieler-Aktivität (Raid/Dungeon)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((opt) =>
            opt
                .setName('id')
                .setDescription('Direkte PGCR/Instance ID (z.B. 16796651170)')
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName('mode')
                .setDescription('Nur Raid oder nur Dungeon')
                .addChoices(
                    { name: 'Raid', value: 'raid' },
                    { name: 'Dungeon', value: 'dungeon' }
                )
                .setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const instanceIdInput = interaction.options.getString('id');
        const mode = interaction.options.getString('mode');
        let latest = null;

        if (instanceIdInput) {
            const instanceId = String(instanceIdInput).trim();
            if (!/^\d+$/.test(instanceId)) {
                return interaction.editReply('Ungültige `id`. Bitte nur numerische Instance/PGCR ID angeben.');
            }

            const pgcr = await getPgcr(instanceId).catch(() => null);
            if (!pgcr?.activityDetails) {
                return interaction.editReply('PGCR nicht gefunden oder nicht abrufbar für diese `id`.');
            }

            const modes = Array.isArray(pgcr?.activityDetails?.modes) ? pgcr.activityDetails.modes.map((m) => Number(m)) : [];
            const detectedMode = modes.includes(4) ? 4 : modes.includes(82) ? 82 : null;
            latest = { instanceId, mode: detectedMode ?? (mode === 'raid' ? 4 : mode === 'dungeon' ? 82 : 4) };
        } else {
            const groupId = parseGroupIdFromClanUrl(config?.destinyActivityTracking?.clanUrl);
            if (!groupId) {
                return interaction.editReply('Clan-URL/GroupId fehlt oder ist ungültig in `destinyActivityTracking.clanUrl`.');
            }
            latest = await findLatestCompletedForClan(groupId, mode).catch(() => null);
        }

        if (!latest?.instanceId) {
            return interaction.editReply('Keine abgeschlossene Aktivität gefunden (oder Profil/Clan privat).');
        }

        const postChannelId =
            config?.destinyActivityTracking?.postChannelId ||
            interaction.channelId;

        await postSummaryToDiscordForInteraction(interaction.client, {
            channelId: postChannelId,
            instanceId: latest.instanceId,
            mode: latest.mode,
        });

        return interaction.editReply(`Gepostet: \`${latest.instanceId}\`${mode ? ` (${mode})` : ''}`);
    },
};

