import test from 'node:test';
import assert from 'node:assert/strict';
import { SpamDetector, findBlockedDomains } from '../src/services/spam-detector.js';
import { chooseAction, ModerationService } from '../src/services/moderation-service.js';
import { chooseRolePickerChanges } from '../src/commands/handler.js';
import { DEFAULT_SETTINGS } from '../src/services/settings-service.js';
import { createDatabase } from '../src/database.js';
import { TicketService } from '../src/services/ticket-service.js';
import { ReportService } from '../src/services/report-service.js';

const settings = (overrides = {}) => ({ ...DEFAULT_SETTINGS, dryRun: false, cooldownMs: 1_000, ...overrides, thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(overrides.thresholds || {}) } });

test('mendeteksi flood lintas channel dalam server yang sama', () => {
  const detector = new SpamDetector(); let result;
  for (let i = 0; i < 6; i++) result = detector.evaluate({ guildId: 'g', userId: 'u', messageId: String(i), content: `pesan ${i}`, now: i * 500, settings: settings() });
  assert.deepEqual(result.reasons, ['flood']);
});

test('mendeteksi pengulangan dalam jendela dan tidak sesudah jendela berakhir', () => {
  const detector = new SpamDetector();
  for (let i = 0; i < 2; i++) assert.equal(detector.evaluate({ guildId: 'g', userId: 'u', messageId: String(i), content: 'sama', now: i * 5_000, settings: settings() }), null);
  assert.deepEqual(detector.evaluate({ guildId: 'g', userId: 'u', messageId: '2', content: 'sama', now: 10_000, settings: settings() }).reasons, ['pesan-berulang']);
  const another = new SpamDetector();
  another.evaluate({ guildId: 'g', userId: 'u', messageId: 'a', content: 'sama', now: 0, settings: settings() });
  another.evaluate({ guildId: 'g', userId: 'u', messageId: 'b', content: 'sama', now: 1_000, settings: settings() });
  assert.equal(another.evaluate({ guildId: 'g', userId: 'u', messageId: 'c', content: 'sama', now: 25_000, settings: settings() }), null);
});

test('mendeduplikasi insiden selama cooldown dan memeriksa domain secara tepat', () => {
  const detector = new SpamDetector(); const config = settings({ blockedDomains: ['contoh.com'] });
  assert.deepEqual(findBlockedDomains('https://docs.contoh.com/a https://bukancontoh.com', config.blockedDomains), ['docs.contoh.com']);
  assert.ok(detector.evaluate({ guildId: 'g', userId: 'u', messageId: '1', content: 'https://contoh.com', now: 0, settings: config }));
  assert.equal(detector.evaluate({ guildId: 'g', userId: 'u', messageId: '2', content: 'https://contoh.com', now: 500, settings: config }), null);
});

test('menerapkan pengecualian pengguna, role, dan channel', () => {
  const service = new ModerationService({ db: {}, detector: {}, settings: { listExemptions: (_, type) => ({ user: ['u'], role: ['r'], channel: ['c'] }[type]) } });
  const message = { guild: { id: 'g', ownerId: 'owner' }, author: { id: 'u' }, channel: { id: 'x' }, member: { roles: { cache: { some: () => false } } } };
  assert.equal(service.isExempt(message), true);
  message.author.id = 'other'; message.channel.id = 'c'; assert.equal(service.isExempt(message), true);
  message.channel.id = 'x'; message.member.roles.cache = { some: (predicate) => predicate({ id: 'r' }) }; assert.equal(service.isExempt(message), true);
});

test('memilih eskalasi progressive dan strict berdasarkan insiden aktif dalam jendela', () => {
  assert.equal(chooseAction({ mode: 'progressive', dryRun: false, activeIncidents: 0 }).action, 'warn');
  assert.equal(chooseAction({ mode: 'progressive', dryRun: false, activeIncidents: 1 }).action, 'timeout');
  assert.equal(chooseAction({ mode: 'progressive', dryRun: false, activeIncidents: 2 }).action, 'ban');
  assert.equal(chooseAction({ mode: 'strict', dryRun: true, activeIncidents: 0 }).action, 'ban');
});

test('mengubah role picker hanya untuk role yang dikelola', () => {
  assert.deepEqual(
    chooseRolePickerChanges(['web', 'mobile', 'data'], ['web', 'data'], ['mobile', 'moderator']),
    { add: ['web', 'data'], remove: ['mobile'] }
  );
});

test('menyimpan satu tiket aktif dan menutupnya', () => {
  const db = createDatabase(':memory:');
  const tickets = new TicketService(db);
  assert.equal(tickets.findOpenForUser('g', 'u'), undefined);
  tickets.create({ guildId: 'g', channelId: 'c', userId: 'u' });
  assert.equal(tickets.findOpenForUser('g', 'u').channel_id, 'c');
  assert.equal(tickets.close('c', 'mentor'), true);
  assert.equal(tickets.findOpenForUser('g', 'u'), undefined);
  db.close();
});

test('mencatat satu laporan per pelapor dan pesan', () => {
  const db = createDatabase(':memory:');
  const reports = new ReportService(db);
  assert.equal(reports.hasReported('g', 'reporter', 'message'), undefined);
  reports.create({ guildId: 'g', reporterId: 'reporter', messageId: 'message', channelId: 'channel', authorId: 'author', reason: 'Spam berulang', excerpt: 'Beli sekarang' });
  assert.ok(reports.hasReported('g', 'reporter', 'message'));
  db.close();
});
