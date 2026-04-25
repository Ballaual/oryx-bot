const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Creates the standard onboarding embed and button row for new members.
 * @param {import('discord.js').GuildMember} member The member joining the onboarding.
 * @returns {{embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
 */
function createOnboardingMessage(member) {
    const embed = new EmbedBuilder()
        .setTitle('Bewerber Panel')
        .setDescription(`**Bitte beantworte uns vorab folgende Fragen:**\n\n1. Bist du im Besitz aller DLCs? (Falls nein, welche fehlen dir aktuell?)\n2. Wie sieht deine Aktivität aus? (Tage & Uhrzeiten)\n3. Planst du, das Spiel längerfristig zu spielen?\n4. Hast du bereits Raiderfahrung? (Wenn ja: Welche und wie viel?)\n5. Wie schätzt du dein aktuelles Gear ein und bist du bereit, stetig an dessen Verbesserung zu arbeiten?\n6. Was sind deine Ziele in Destiny? (Kurzfristig / Langfristig)\n\n**Aktionen:**\n1. Klicke auf den blauen Button unten, um deine Bungie ID anzugeben.\n2. Beantworte die Fragen hier im Chat.\n3. Unser Mod-Team wird sich schnellstmöglich hier bei Dir melden.`)
        .setColor(0x00AE86)
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`set_bungie_${member.id}`)
                .setLabel('Bungie ID angeben')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`close_ticket_${member.id}`)
                .setLabel('Ticket schließen')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`add_clan_${member.id}`)
                .setLabel('Als Clan-Mitglied aufnehmen')
                .setStyle(ButtonStyle.Success)
        );

    return { embeds: [embed], components: [row] };
}

module.exports = { createOnboardingMessage };
