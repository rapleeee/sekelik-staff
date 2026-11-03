import { REST, Routes } from 'discord.js';
import { getRegistrationConfig } from './config.js';
import { commands } from './commands/definitions.js';

const { token, clientId, guildId } = getRegistrationConfig();
const rest = new REST({ version: '10' }).setToken(token);
const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
await rest.put(route, { body: commands });
console.log(`${commands.length} slash command ${guildId ? `didaftarkan ke server ${guildId}` : 'global didaftarkan'}.`);
