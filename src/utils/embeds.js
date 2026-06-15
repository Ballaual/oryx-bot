const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Creates the standard onboarding embed and button row for new members.
 * @param {import('discord.js').GuildMember} member The member joining the onboarding.
 * @param {boolean} [isPaused=false] Whether the tracking is currently paused.
 * @returns {{embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
 */
function createOnboardingMessage(member, isPaused = false) {
    const embed = new EmbedBuilder()
        .setTitle('Bewerber Panel')
        .setDescription(`**Bitte beantworte uns vorab folgende Fragen:**\n\n1. Bist du im Besitz aller aktuell verfügbaren Inhalte (DLCs, Dungeons etc.)? Falls nein, welche fehlen dir?\n2. Wie aktiv spielst du Destiny 2 aktuell? (Tage, Uhrzeiten und ungefähre Spielzeit pro Woche)\n3. Bist du bereit, regelmäßig unseren Discord zu nutzen und aktiv im Voice-Chat teilzunehmen?\n4. Nimmst du gerne an Clan-Aktivitäten teil? (Raids, Dungeons, Pantheon, Grandmaster, Triumphs etc.)\n5. Welche Erfahrung hast du mit Endgame-Inhalten? (Raids, Dungeons, Pantheon, Contest Mode, Grandmaster usw.)\n6. Wie schätzt du dein aktuelles Gear und deine Builds für Endgame-Aktivitäten ein?\n7. Bist du bereit, neue Mechaniken zu lernen, Feedback anzunehmen und dich aktiv in Gruppen einzubringen?\n8. Was sind deine persönlichen Ziele in Destiny 2?\n9. Warum möchtest du unserem Clan beitreten?\n\n**Aktionen:**\n1. Klicke auf den blauen Button unten, um deine Bungie ID anzugeben.\n2. Beantworte die Fragen hier im Chat.\n3. Unser Mod-Team wird sich schnellstmöglich hier bei Dir melden.`)
        .setColor(0x00AE86)
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() })
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
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`pause_ticket_${member.id}`)
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(ButtonStyle.Secondary)
        );

    return { embeds: [embed], components: [row] };
}

function createWelcomeEmbed(member, messageTemplate) {
    const description = messageTemplate.replace('{user}', `<@${member.id}>`);
    return new EmbedBuilder()
        .setTitle('Willkommen!')
        .setDescription(description)
        .setColor(0x00FF00)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'User', value: `${member.user.tag}`, inline: true },
            { name: 'ID', value: `${member.id}`, inline: true },
            { name: 'Server Mitglieder', value: `${member.guild.memberCount}`, inline: true }
        )
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() })
        .setTimestamp();
}

function createLeaveEmbed(member, messageTemplate) {
    const description = messageTemplate.replace('{user}', `**${member.user.tag}**`);
    return new EmbedBuilder()
        .setTitle('Auf Wiedersehen!')
        .setDescription(description)
        .setColor(0xFF0000)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Server Mitglieder', value: `${member.guild.memberCount}`, inline: true }
        )
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() })
        .setTimestamp();
}

module.exports = { 
    createOnboardingMessage,
    createWelcomeEmbed,
    createLeaveEmbed
};
