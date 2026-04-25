require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Add ISO timestamps to all console output globally.
const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'];
for (const method of consoleMethods) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
        original(`[${new Date().toISOString()}]`, ...args);
    };
}

// Polyfill für Node.js >= 22 (fs.rmdirSync recursive wurde entfernt, ytsr nutzt es aber noch)
const originalRmdirSync = fs.rmdirSync;
fs.rmdirSync = function(dir, options) {
    if (options && options.recursive) {
        return fs.rmSync(dir, options);
    }
    return originalRmdirSync(dir, options);
};
const { initMusicService } = require('./services/music');
const configService = require('./services/configService');

// Migrate old config before doing anything else
configService.migrate();

// Client initialisieren
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // Benötigt für den Musikbot
    ]
});

// Commands Collection
client.commands = new Collection();

// 1. Commands laden
const commandsPath = path.join(__dirname, 'commands');
const loadCommands = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNUNG] Der Befehl in ${filePath} hat keine 'data' oder 'execute' Eigenschaft.`);
            }
        }
    }
};

if (fs.existsSync(commandsPath)) {
    loadCommands(commandsPath);
}

// 2. Events laden
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
}

// 3. Musik-Service initialisieren
initMusicService(client);

// Login
client.login(process.env.DISCORD_TOKEN);
