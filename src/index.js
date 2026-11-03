import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { getRuntimeConfig } from './config.js';
import { createDatabase } from './database.js';
import { createCommandHandler } from './commands/handler.js';
import { createGuildMemberAddHandler } from './events/guild-member-add.js';
import { ModerationService } from './services/moderation-service.js';
import { SettingsService } from './services/settings-service.js';
import { SpamDetector } from './services/spam-detector.js';
import { TicketService } from './services/ticket-service.js';
import { ReportService } from './services/report-service.js';

const config = getRuntimeConfig();
const db = createDatabase(config.databasePath);
const settings = new SettingsService(db);
const tickets = new TicketService(db);
const reports = new ReportService(db);
const moderation = new ModerationService({ db, settings, detector: new SpamDetector() });
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});

client.once(Events.ClientReady, (ready) => console.log(`Sekelik Academy Bot siap sebagai ${ready.user.tag}.`));
client.on(Events.GuildMemberAdd, createGuildMemberAddHandler(settings));
client.on(Events.MessageCreate, (message) => moderation.inspect(message).catch((error) => console.error('Kesalahan automod pesan baru:', error)));
client.on(Events.MessageUpdate, async (_, message) => {
  const full = message.partial ? await message.fetch().catch(() => null) : message;
  if (full) await moderation.inspect(full).catch((error) => console.error('Kesalahan automod pesan edit:', error));
});
client.on(Events.InteractionCreate, createCommandHandler({ settings, db, tickets, reports }));
client.on(Events.Error, (error) => console.error('Discord client error:', error));

function shutdown(signal) {
  console.log(`Menerima ${signal}; menutup koneksi bot dan database.`);
  client.destroy(); db.close(); process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
await client.login(config.token);
