const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const db = require('../services/database');
const configService = require('../services/configService');
const { isSupportUser } = require('../utils/permissions');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) return handleCommand(interaction);
        if (interaction.isButton()) return handleButton(interaction);
        if (interaction.isModalSubmit()) return handleModal(interaction);
    },
};

/**
 * Handles slash command interactions.
 */
async function handleCommand(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return console.error(`No command matching ${interaction.commandName} was found.`);

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        const errorMessage = { content: 'Es gab einen Fehler beim Ausführen dieses Befehls!', flags: [MessageFlags.Ephemeral] };
        interaction.replied || interaction.deferred ? await interaction.followUp(errorMessage) : await interaction.reply(errorMessage);
    }
}

/**
 * Handles button interactions.
 */
async function handleButton(interaction) {
    const [action, type, targetUserId] = interaction.customId.split('_');
    const { member, user, guild, channel } = interaction;

    // --- BUNGIE ID MODAL ---
    if (action === 'set' && type === 'bungie') {
        if (user.id !== targetUserId && !isSupportUser(member, guild.id)) {
            return interaction.reply({ content: 'Nur der User selbst oder ein Moderator kann die Bungie ID setzen.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId(`bungie_modal_${targetUserId}`)
            .setTitle('Bungie ID angeben');

        const bungieInput = new TextInputBuilder()
            .setCustomId('bungie_id_input')
            .setLabel("Deine Bungie ID (z.B. Name#1234)")
            .setPlaceholder('Name#1234')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(bungieInput));
        return interaction.showModal(modal);
    }

    // --- SUPPORT ACTIONS (CLOSE/ADD/PAUSE) ---
    if (action === 'close' || action === 'add' || action === 'pause') {
        if (!isSupportUser(member, guild.id)) {
            return interaction.reply({ content: 'Nur Moderatoren können diese Aktion ausführen.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply();
        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
        const config = configService.get(guild.id);

        try {
            if (targetMember?.roles.cache.has(config.ticketSystem.bewerberRoleId)) {
                await targetMember.roles.remove(config.ticketSystem.bewerberRoleId, 'Ticket bearbeitet');
            }

            if (action === 'add' && type === 'clan' && targetMember) {
                await targetMember.roles.add(config.ticketSystem.clanMemberRoleId, 'Befördert zum Clan-Mitglied');
                await interaction.editReply(`Benutzer <@${targetUserId}> wurde aufgenommen und das Ticket wird geschlossen.`);

                // Send welcome message to clan chat if configured
                if (config.ticketSystem.clanChatId && config.ticketSystem.clanChatMessage) {
                    try {
                        const clanChat = await guild.channels.fetch(config.ticketSystem.clanChatId).catch(() => null);
                        if (clanChat?.isTextBased()) {
                            const welcomeText = config.ticketSystem.clanChatMessage.replace('{user}', `<@${targetUserId}>`);
                            await clanChat.send(welcomeText);
                        } else {
                            console.warn('[interactionCreate] clanChatId ist kein Textkanal oder nicht gefunden.');
                        }
                    } catch (chatError) {
                        console.error('[interactionCreate] Fehler beim Senden der Clan-Willkommensnachricht:', chatError);
                    }
                }
            } else if (action === 'close') {
                let kickStatus = 'Rolle entfernt';
                if (targetMember) {
                    if (targetMember.kickable) {
                        await targetMember.kick('Ticket durch Moderator geschlossen');
                        kickStatus = 'User gekickt';
                    } else {
                        kickStatus = 'Rolle entfernt (User nicht kickbar)';
                    }
                }
                await interaction.editReply(`${kickStatus} und Ticket wird geschlossen.`);
            }

            // --- PAUSE TRACKING ---
            if (action === 'pause') {
                const newState = db.toggleTicketPause(channel.id);
                const isPaused = newState === 1;

                // Update the message components
                const { createOnboardingMessage } = require('../utils/embeds');
                const onboardingData = createOnboardingMessage(targetMember || { id: targetUserId }, isPaused);

                await interaction.editReply({
                    content: isPaused
                        ? `⏸️ Das Tracking für <@${targetUserId}> wurde **pausiert**.`
                        : `▶️ Das Tracking für <@${targetUserId}> wurde **fortgesetzt**.`,
                });

                // Update original panel message if possible
                await interaction.message.edit({ components: onboardingData.components }).catch(() => null);
                return;
            }

            // Remove from DB and delete the ticket channel after a short delay
            if (channel.isTextBased()) {
                db.removeTicket(channel.id);
                setTimeout(() => channel.delete('Ticket abgeschlossen').catch(() => null), 5000);
            }
        } catch (error) {
            console.error('Error in support action:', error);
            await interaction.editReply('Fehler beim Verarbeiten der Aktion.');
        }
    }
}

/**
 * Handles modal submissions.
 */
async function handleModal(interaction) {
    const [action, type, targetUserId] = interaction.customId.split('_');
    if (action !== 'bungie' || type !== 'modal') return;

    const bungieId = interaction.fields.getTextInputValue('bungie_id_input').trim();
    if (!bungieId.includes('#') || bungieId.split('#')[1].length !== 4) {
        return interaction.reply({ content: 'Ungültiges Format! Bitte nutze `Name#1234`.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();
    try {
        const member = await interaction.guild.members.fetch(targetUserId);
        const [displayName, codeRaw] = bungieId.split('#');
        const displayNameCode = Number(codeRaw);

        // Persist Bungie name in DB for Destiny integrations (membership resolved later)
        db.upsertDestinyProfileByBungieName(targetUserId, displayName, displayNameCode);

        // Attempt nickname change – catch separately so channel rename always runs
        let nicknameSet = false;
        try {
            await member.setNickname(bungieId);
            nicknameSet = true;
        } catch (nickErr) {
            console.warn(`[interactionCreate] Nickname konnte nicht gesetzt werden für ${member.user.tag}:`, nickErr.message);
        }

        await interaction.editReply(
            nicknameSet
                ? `Erfolg! Deine Bungie ID wurde erkannt: **${bungieId}**`
                : `ID erhalten (**${bungieId}**), aber Nickname-Umbenennung nicht möglich.`
        );

        db.updateTicketActivity(interaction.channelId);

        // Always rename the ticket channel, even if the nickname couldn't be set
        const ticketData = db.getTicketByUserId(targetUserId);
        if (ticketData) {
            const ticketChannel = await interaction.guild.channels.fetch(ticketData.ticket_channel_id).catch(() => null);
            if (ticketChannel) {
                const channelName = bungieId.replace('#', '_').toLowerCase();
                await ticketChannel.setName(channelName).catch(err => console.error('Fehler beim Umbenennen des Kanals:', err));
            }
        }
    } catch (error) {
        console.error('Error in modal submission:', error);
        await interaction.editReply('Fehler beim Speichern der Bungie ID.');
    }
}
