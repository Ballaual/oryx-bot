# Oryx Putzkolonne Discord Bot

Discord-Bot fuer Onboarding, Inaktivitaets-Management, Destiny Activity Tracking und Musik (DisTube + yt-dlp).

## Features

- Automatisches Onboarding: Erstellt private Ticket-Channels fuer Bewerber.
- Interaktiver Ablauf: Begruessung, Fragen und Bungie-ID Erfassung via Button/Modal.
- Inaktivitaets-Tracking: Pingt bei Funkstille und kann Tickets nach Schwellwert schliessen.
- Destiny Activity Tracking: Postet neue Raid-/Dungeon-Clears aus dem Clan.
- Musiksystem: YouTube/Spotify mit Queue, Skip, Shuffle, Volume und Voice-Autologik.
- Einheitliches Logging: Alle `console.*` Ausgaben werden automatisch mit ISO-Timestamp versehen.

## Slash-Commands

### Moderation & System
- `/ping`: Prueft, ob der Bot erreichbar ist.
- `/clear [amount]`: Loescht 1-100 Nachrichten im aktuellen Kanal.
- `/config-check`: Validiert wichtige Config-Werte (Guild, Rollen, Kanaele, Support-IDs). (ManageGuild)
- `/status`: Zeigt Bot-Health (Uptime, Ping, Speicher, aktive Tickets). (ManageGuild)
- `/sync-tickets`: Synchronisiert fehlende Onboarding-Tickets fuer Bewerber. (ManageGuild)

### Musik
- `/play [url/suche]`
- `/pause`
- `/resume`
- `/skip`
- `/queue`
- `/clearqueue`
- `/shuffle`
- `/volume [1-100]`
- `/stop`

### Destiny
- `/last [id] [mode]`
- `id` optional: direkte PGCR/Instance ID (z. B. `16796651170`)
- `mode` optional: `Raid` oder `Dungeon`

## Voice-Automatik (Musik)

- Ist der Bot allein im Voice-Channel, pausiert er die Wiedergabe.
- Kommt innerhalb von 30 Sekunden niemand zurueck, stoppt er Queue + Session und verlaesst den Channel.
- Sobald wieder jemand joint, setzt der Bot fort (wenn zuvor automatisch pausiert wurde).

## Installation

1. Abhaengigkeiten installieren:
   ```bash
   npm install
   ```
2. `.env` anlegen:
   ```env
   DISCORD_TOKEN=DEIN_BOT_TOKEN
   DATABASE_PATH=./data/database.sqlite
   BUNGIE_API_KEY=DEIN_BUNGIE_API_KEY
   ```
3. `config/config.json` erstellen (z. B. aus `config/config.json.example`) und IDs eintragen.
4. Bot starten:
   ```bash
   npm run start
   ```

## Logging

- Alle `console.log/info/warn/error/debug` Ausgaben erhalten beim Start automatisch ein Prefix wie:
  - `[2026-04-25T15:53:12.345Z] ...`
- Das gilt global fuer alle Module, Events und Commands.

## Konfiguration (`config/config.json`)

Kernfelder:
- `guildId`: Ziel-Guild, in der der Bot arbeiten soll.
- `ticketCategoryId`: Kategorie fuer Onboarding-Tickets.
- `bewerberRoleId`: Rolle, die den Onboarding-Prozess startet.
- `supportPingIds`: Rollen/User, die in Ticket-Pings und Begruessung erwaehnt werden.
- `rulesChannelId`: Regeln-Channel fuer Platzhalter in Begruessungstexten.
- `checkIntervalMinutes`: Intervall fuer Inaktivitaets-Checks.
- `pingThresholdHours`: Nach wie vielen Stunden der erste Ping geschickt wird.
- `kickThresholdHours`: Nach wie vielen Stunden das Ticket geschlossen wird.
- `musicChannelId`: Optionaler Voice-Channel fuer Musikbefehle. Leer (`""`) bedeutet keine Channel-Bindung.
- `clanChatId` und `clanChatMessage`: Optionales Willkommensposting bei erfolgreicher Aufnahme.

Texte mit Platzhaltern:
- `welcomeMessage`: unterstuetzt `{user}`, `{support}`, `{rules}`
- `inactivityPingMessage`: unterstuetzt `{user}`, `{support}`, `{hours}`, `{remainingHours}`
- `kickReason`: unterstuetzt `{hours}`

## Destiny Activity Tracking

Die Destiny-Logik wird ueber `destinyActivityTracking` gesteuert:
- `enabled`: Tracking an/aus
- `clanUrl`: Bungie Clan URL oder direkte Group ID
- `postChannelId`: Zielkanal (leer = Fallback auf `clanChatId`)
- `pollIntervalMinutes`: Polling-Intervall
- `mode`: `raid`, `dungeon` oder leer (beides)
- `allowCheckpointClears`: `false` nur Full-Clears, `true` auch Checkpoint-Clears

Standardverhalten:
- Beim Start werden alte Aktivitaeten nur vorgemerkt (kein Backfill).
- Danach werden nur neue Aktivitaeten gepostet.
- Teamgroesse ist nicht limitierend; Hinweise wie Duo/Trio/Solo/Flawless werden automatisch ergaenzt.

## Linux/Docker Hinweise (Musik)

Wenn `/play` in Linux/Docker Probleme macht (z. B. Bot-Checks oder fehlende Formate), sind diese optionalen ENV-Variablen verfuegbar:
- `YTDLP_COOKIES`: Pfad zu `cookies.txt` (Netscape-Format)
- `YTDLP_PROXY`: Proxy fuer `yt-dlp`
- `YTDLP_FORCE_IPV4=true`: erzwingt IPv4
- `YTDLP_EXTRACTOR_ARGS`: eigene Extractor-Args
- `USE_SYSTEM_FFMPEG=true`: nutzt System-ffmpeg (empfohlen unter Linux)
- `MUSIC_DEBUG=true`: detaillierte Debug-Logs

Beispiel:
```env
YTDLP_COOKIES=/app/config/cookies.txt
# YTDLP_FORCE_IPV4=true
# YTDLP_PROXY=socks5://user:pass@host:port
# YTDLP_EXTRACTOR_ARGS=youtube:player_client=android
# MUSIC_DEBUG=true
```

## Projektstruktur

- `src/commands/`: Slash-Commands
- `src/events/`: Discord Event-Handler
- `src/services/`: Datenbank, Scheduler, Musik, Destiny-Services
- `src/utils/`: Embeds, Mentions, Permissions und weitere Helfer

## Lizenz

ISC
