import { REST, Routes } from 'discord.js';
import { getRegistrationConfig } from './config.js';
import { commands } from './commands/definitions.js';

const { token, clientId, legacyGuildId } = getRegistrationConfig();
const rest = new REST({ version: '10' }).setToken(token);
const globalRoute = Routes.applicationCommands(clientId);

await rest.put(globalRoute, { body: commands });

const registered = await rest.get(globalRoute);
const expectedNames = commands.map((command) => command.name).sort();
const registeredNames = registered.map((command) => command.name).sort();
if (JSON.stringify(registeredNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Verifikasi command global gagal. Diharapkan: ${expectedNames.join(', ')}; diterima: ${registeredNames.join(', ')}`);
}

console.log(`${commands.length} command global berhasil didaftarkan dan diverifikasi.`);

if (legacyGuildId) {
  const guildRoute = Routes.applicationGuildCommands(clientId, legacyGuildId);
  const legacyCommands = await rest.get(guildRoute);
  if (legacyCommands.length) {
    await rest.put(guildRoute, { body: [] });
    console.log(`${legacyCommands.length} command guild lama dibersihkan setelah verifikasi global berhasil.`);
  } else {
    console.log('Tidak ada command guild lama yang perlu dibersihkan.');
  }
}
