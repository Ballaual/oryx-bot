const { DisTube, Song, DisTubeError, Playlist } = require('distube');
const { YtDlpPlugin, json: ytDlpJson } = require('@distube/yt-dlp');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const { FilePlugin } = require('@distube/file');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const configService = require('./configService');

const ffmpegStaticPath = require('ffmpeg-static');

function envFlag(name, defaultValue = false) {
    const v = process.env[name];
    if (v == null) return defaultValue;
    if (/^(1|true|yes|on)$/i.test(v)) return true;
    if (/^(0|false|no|off)$/i.test(v)) return false;
    return defaultValue;
}

const MUSIC_DEBUG = envFlag('MUSIC_DEBUG', false);
const USE_SYSTEM_FFMPEG = envFlag('USE_SYSTEM_FFMPEG', true);

function isPlaylistInfo(i) {
    return Array.isArray(i?.entries);
}

class PatchedYtDlpSong extends Song {
    constructor(plugin, info, options = {}) {
        super(
            {
                plugin,
                source: info.extractor,
                playFromSource: true,
                id: info.id,
                name: info.title || info.fulltitle,
                url: info.webpage_url || info.original_url,
                isLive: info.is_live,
                thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
                duration: info.is_live ? 0 : info.duration,
                uploader: {
                    name: info.uploader,
                    url: info.uploader_url
                },
                views: info.view_count,
                likes: info.like_count,
                dislikes: info.dislike_count,
                reposts: info.repost_count,
                ageRestricted: Boolean(info.age_limit) && info.age_limit >= 18
            },
            options
        );
    }
}

function buildYtDlpFlags(extra = {}) {
    const flags = {
        dumpSingleJson: true,
        noWarnings: true,
        preferFreeFormats: true,
        skipDownload: true,
        simulate: true,
        ...extra,
    };

    if (process.env.YTDLP_COOKIES) flags.cookies = process.env.YTDLP_COOKIES;
    if (process.env.YTDLP_PROXY) flags.proxy = process.env.YTDLP_PROXY;
    if (envFlag('YTDLP_FORCE_IPV4', false)) flags.forceIpv4 = true;
    if (process.env.YTDLP_USER_AGENT) flags.userAgent = process.env.YTDLP_USER_AGENT;

    // `--no-call-home` must NOT be passed: yt-dlp deprecated it (plugin did historically).
    // Default linux behavior: android client is often more reliable, can be overridden.
    flags.extractorArgs =
        process.env.YTDLP_EXTRACTOR_ARGS || (process.platform === 'linux' ? 'youtube:player_client=android' : undefined);

    return flags;
}

/**
 * Initialisiert den DisTube Musik-Service und hängt ihn an den Client
 */
function initMusicService(client) {
    const plugins = [];

    // Spotify-Plugin konfigurieren
    const spotifyOptions = {};
    
    // API-Credentials verwenden, falls in .env angegeben
    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
        spotifyOptions.api = {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
        };
        console.log('[Music] Spotify-Plugin mit API-Credentials initialisiert.');
    } else {
        console.log('[Music] Spotify-Plugin ohne API-Credentials initialisiert.');
    }
    
    const ytDlpPlugin = new YtDlpPlugin({ update: true });
    const youTubePlugin = new YouTubePlugin();
    
    // Wir nutzen jetzt ausschließlich yt-dlp für den Stream-Abruf,
    // da der Crash durch den Docker-Wrapper behoben wurde.
    youTubePlugin.getStreamURL = (song) => ytDlpPlugin.getStreamURL(song);

    // Always use yt-dlp search (`ytsearch`) instead of @distube/ytsr.
    // This avoids breakages when YouTube changes its search responses.
    const ytDlpSearchOne = async (query, options) => {
        const info = await ytDlpJson(`ytsearch1:${query}`, buildYtDlpFlags()).catch((e) => {
            throw new DisTubeError('YTDLP_ERROR', `${e?.stderr || e}`);
        });
        if (isPlaylistInfo(info)) {
            const first = info.entries?.find(Boolean);
            if (!first) throw new DisTubeError('YTDLP_ERROR', 'No results found');
            return new PatchedYtDlpSong(ytDlpPlugin, first, options);
        }
        return new PatchedYtDlpSong(ytDlpPlugin, info, options);
    };

    // DisTube calls `searchSong` for queries (also used by SpotifyPlugin to find a YouTube match).
    youTubePlugin.searchSong = ytDlpSearchOne;

    // Patch yt-dlp plugin flags:
    // - remove deprecated `--no-call-home`
    // - optionally pass cookies/proxy for YouTube bot-checks in datacenters
    ytDlpPlugin.resolve = async (url, options) => {
        const info = await ytDlpJson(url, buildYtDlpFlags()).catch((e) => {
            throw new DisTubeError('YTDLP_ERROR', `${e?.stderr || e}`);
        });

        if (isPlaylistInfo(info)) {
            if (info.entries.length === 0) throw new DisTubeError('YTDLP_ERROR', 'The playlist is empty');
            return new Playlist(
                {
                    source: info.extractor,
                    songs: info.entries.map((i) => new PatchedYtDlpSong(ytDlpPlugin, i, options)),
                    id: info.id?.toString?.() ?? String(info.id),
                    name: info.title,
                    url: info.webpage_url,
                    thumbnail: info.thumbnails?.[0]?.url,
                },
                options
            );
        }

        return new PatchedYtDlpSong(ytDlpPlugin, info, options);
    };

    ytDlpPlugin.getStreamURL = async (song) => {
        if (!song?.url) throw new DisTubeError('YTDLP_PLUGIN_INVALID_SONG', 'Cannot get stream url from invalid song.');

        const cookiesConfigured = Boolean(process.env.YTDLP_COOKIES);
        const ipv4Forced = envFlag('YTDLP_FORCE_IPV4', false);

        const tryFetch = async (label, format) => {
            try {
                // For stream playback we MUST request a specific format,
                // otherwise yt-dlp may return metadata without a direct `url`.
                return await ytDlpJson(song.url, buildYtDlpFlags({ format }));
            } catch (e) {
                const msg = `${e?.stderr || e}`;
                // High-signal debug for Docker-only issues.
                if (MUSIC_DEBUG) {
                    console.warn(
                        `[Music][yt-dlp] getStreamURL failed (${label}) cookies=${cookiesConfigured} ipv4=${ipv4Forced} url=${song.url}\n${msg}`
                    );
                }
                throw e;
            }
        };

        let info;
        try {
            // First: audio-first (most compatible for Discord bots).
            info = await tryFetch('bestaudio', 'bestaudio/best');
        } catch (e) {
            const msg = `${e?.stderr || e}`;
            if (/Requested format is not available/i.test(msg)) {
                try {
                    // Fallback: grab whatever is "best" (may be muxed; ffmpeg can extract audio).
                    info = await tryFetch('best', 'best');
                } catch (e2) {
                    const msg2 = `${e2?.stderr || e2}`;
                    if (!cookiesConfigured && /Requested format is not available/i.test(msg2)) {
                        throw new DisTubeError(
                            'YTDLP_ERROR',
                            'YouTube liefert im Container keine passenden Formate. Setze `YTDLP_COOKIES=/app/config/cookies.txt` (Netscape cookies.txt) oder nutze `YTDLP_FORCE_IPV4=true`.'
                        );
                    }
                    throw new DisTubeError('YTDLP_ERROR', msg2);
                }
            } else {
                throw new DisTubeError('YTDLP_ERROR', msg);
            }
        }

        if (isPlaylistInfo(info)) throw new DisTubeError('YTDLP_ERROR', 'Cannot get stream URL of a entire playlist');
        if (!info?.url) {
            throw new DisTubeError(
                'YTDLP_ERROR',
                'yt-dlp hat keine direkte Stream-URL geliefert (info.url fehlt). Das ist meist Cookies/Netzwerk/YouTube-Block. Setze `YTDLP_COOKIES` oder probiere `YTDLP_FORCE_IPV4=true`.'
            );
        }

        if (MUSIC_DEBUG) {
            console.log(
                `[Music][yt-dlp] stream ok extractor=${info.extractor} format_id=${info.format_id} acodec=${info.acodec} vcodec=${info.vcodec} urlPrefix=${String(info.url).slice(0, 40)}...`
            );
        }
        return info.url;
    };

    plugins.push(new SpotifyPlugin(spotifyOptions));
    plugins.push(youTubePlugin);
    plugins.push(new FilePlugin());
    // YtDlpPlugin should be last plugin (recommended by plugin docs)
    plugins.push(ytDlpPlugin);

    client.distube = new DisTube(client, {
        emitNewSongOnly: true,
        plugins: plugins,
        ffmpeg: {
            path:
                process.platform === 'linux' && USE_SYSTEM_FFMPEG ? 'ffmpeg' : ffmpegStaticPath || 'ffmpeg',
        },
    });

    client.distube.on('debug', (message) => {
        if (MUSIC_DEBUG) console.log(`[DisTube][debug] ${message}`);
    });

    client.distube.on('ffmpegDebug', (message) => {
        if (MUSIC_DEBUG) console.log(`[DisTube][ffmpeg] ${message}`);
    });

    client.distube.on('finishSong', (queue, song) => {
        if (MUSIC_DEBUG) {
            console.log(
                `[Music] finishSong name="${song?.name}" url=${song?.url} duration=${song?.duration} formatted=${song?.formattedDuration}`
            );
        }
    });

    // Map für die Leave-Timeouts
    const leaveTimeouts = new Map();

    // --- DisTube Event Listener ---

    client.distube.on('playSong', (queue, song) => {
        // Timeout abbrechen, falls ein neues Lied startet
        if (leaveTimeouts.has(queue.textChannel.guildId)) {
            clearTimeout(leaveTimeouts.get(queue.textChannel.guildId));
            leaveTimeouts.delete(queue.textChannel.guildId);
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎶 Spiele jetzt')
            .setDescription(`**[${song.name}](${song.url})**`)
            .addFields(
                { name: 'Dauer', value: song.formattedDuration, inline: true },
                { name: 'Angefordert von', value: `<@${song.user.id}>`, inline: true }
            )
            .setImage(song.thumbnail)
            .setFooter({ text: queue.textChannel.guild.name, iconURL: queue.textChannel.guild.iconURL() })
            .setTimestamp();

        queue.textChannel.send({ embeds: [embed] }).catch(err => console.error('[Music] Fehler beim Senden des playSong Embeds:', err));
    });

    client.distube.on('addSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🎵 Zur Warteschlange hinzugefügt')
            .setDescription(`**[${song.name}](${song.url})**\nAngefordert von: <@${song.user.id}>`)
            .setThumbnail(song.thumbnail)
            .setFooter({ text: queue.textChannel.guild.name, iconURL: queue.textChannel.guild.iconURL() })
            .setTimestamp();

        queue.textChannel.send({ embeds: [embed] }).catch(err => console.error('[Music] Fehler beim Senden des addSong Embeds:', err));
    });

    client.distube.on('addList', (queue, playlist) => {
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('📁 Playlist hinzugefügt')
            .setDescription(`**[${playlist.name}](${playlist.url})**\n${playlist.songs.length} Songs hinzugefügt.`)
            .addFields({ name: 'Angefordert von', value: `<@${playlist.user.id}>` })
            .setThumbnail(playlist.thumbnail)
            .setFooter({ text: queue.textChannel.guild.name, iconURL: queue.textChannel.guild.iconURL() })
            .setTimestamp();

        queue.textChannel.send({ embeds: [embed] }).catch(err => console.error('[Music] Fehler beim Senden des addList Embeds:', err));
    });

    client.distube.on('error', (error, queue, song) => {
        console.error('[Music] DisTube Fehler:', error);
        if (queue && queue.textChannel) {
            queue.textChannel.send(`❌ Ein Fehler ist aufgetreten: \`${error.message.slice(0, 100)}\``).catch(() => null);
        }
    });

    const startLeaveTimeout = (queue, message) => {
        queue.textChannel.send(message).catch(() => null);
        
        if (leaveTimeouts.has(queue.textChannel.guildId)) {
            clearTimeout(leaveTimeouts.get(queue.textChannel.guildId));
        }

        const timeout = setTimeout(() => {
            const voice = queue.client.distube.voices.get(queue.textChannel.guild);
            if (voice) {
                voice.leave();
                queue.textChannel.send('⏹️ Kanal wegen Inaktivität verlassen.').catch(() => null);
            }
            leaveTimeouts.delete(queue.textChannel.guildId);
        }, 30 * 1000);

        leaveTimeouts.set(queue.textChannel.guildId, timeout);
    };

    client.distube.on('empty', queue => {
        startLeaveTimeout(queue, 'Voice-Kanal ist leer! Verlasse den Kanal in 30 Sekunden...');
    });

    client.distube.on('finish', queue => {
        startLeaveTimeout(queue, '✅ Warteschlange abgearbeitet! Verlasse den Kanal in 30 Sekunden...');
    });
}

/**
 * Überprüft, ob der Musik-Befehl im aktuellen Kanal / Setup ausgeführt werden darf
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 * @returns {boolean} True wenn erlaubt, false sonst (antwortet automatisch mit Fehler)
 */
function checkMusicPermissions(interaction) {
    const { member, guild } = interaction;
    const voiceChannel = member.voice.channel;
    const config = configService.get(guild.id);

    if (!voiceChannel) {
        interaction.reply({ content: '❌ Du musst in einem Voice-Kanal sein, um Musik abspielen zu können!', flags: [MessageFlags.Ephemeral] });
        return false;
    }

    if (config.musicChannelId && voiceChannel.id !== config.musicChannelId) {
        interaction.reply({ content: `❌ Musik kann nur im Kanal <#${config.musicChannelId}> abgespielt werden!`, flags: [MessageFlags.Ephemeral] });
        return false;
    }

    const botVoiceChannel = guild.members.me.voice.channel;
    if (botVoiceChannel && voiceChannel.id !== botVoiceChannel.id) {
        interaction.reply({ content: `❌ Du musst im selben Voice-Kanal wie der Bot sein (<#${botVoiceChannel.id}>)!`, flags: [MessageFlags.Ephemeral] });
        return false;
    }

    return true;
}

module.exports = {
    initMusicService,
    checkMusicPermissions
};
