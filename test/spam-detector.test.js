import test from 'node:test';
import assert from 'node:assert/strict';
import { SpamDetector, findBlockedDomains } from '../src/services/spam-detector.js';
import { chooseAction, ModerationService } from '../src/services/moderation-service.js';
import { chooseRolePickerChanges, createCommandHandler } from '../src/commands/handler.js';
import { createGuildMemberAddHandler } from '../src/events/guild-member-add.js';
import { DEFAULT_SETTINGS, SettingsService } from '../src/services/settings-service.js';
import { createDatabase } from '../src/database.js';
import { TicketService } from '../src/services/ticket-service.js';
import { ReportService } from '../src/services/report-service.js';
import { RolePanelService } from '../src/services/role-panel-service.js';

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

test('menyimpan konfigurasi dua server secara terpisah dan persisten', () => {
  const db = createDatabase(':memory:');
  const guildSettings = new SettingsService(db);
  assert.equal(guildSettings.has('guild-pertama'), false);
  assert.equal(guildSettings.has('guild-kedua'), false);

  guildSettings.update('guild-pertama', { welcomeChannelId: 'welcome-1', logChannelId: 'log-1', blockedDomains: ['satu.example'] });
  guildSettings.update('guild-kedua', { welcomeChannelId: 'welcome-2', autoRoleId: 'role-2', blockedDomains: ['dua.example'] });

  const reloaded = new SettingsService(db);
  assert.equal(reloaded.has('guild-pertama'), true);
  assert.equal(reloaded.has('guild-kedua'), true);
  assert.equal(reloaded.get('guild-pertama').welcomeChannelId, 'welcome-1');
  assert.equal(reloaded.get('guild-pertama').autoRoleId, null);
  assert.deepEqual(reloaded.get('guild-pertama').blockedDomains, ['satu.example']);
  assert.equal(reloaded.get('guild-kedua').welcomeChannelId, 'welcome-2');
  assert.equal(reloaded.get('guild-kedua').logChannelId, null);
  assert.deepEqual(reloaded.get('guild-kedua').blockedDomains, ['dua.example']);
  db.close();
});

test('/setup dan sambutan menggunakan konfigurasi guild masing-masing', async () => {
  const db = createDatabase(':memory:');
  const guildSettings = new SettingsService(db);
  const handler = createCommandHandler({ settings: guildSettings, db, tickets: {}, reports: {} });
  const sent = [];

  const makeChannel = (id) => ({
    id,
    name: id,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => sent.push({ channelId: id, payload })
  });
  const channels = new Map([
    ['welcome-1', makeChannel('welcome-1')], ['rules-1', makeChannel('rules-1')], ['intro-1', makeChannel('intro-1')],
    ['welcome-2', makeChannel('welcome-2')], ['rules-2', makeChannel('rules-2')], ['intro-2', makeChannel('intro-2')]
  ]);
  const makeSetupInteraction = (guildId, suffix) => ({
    guildId,
    guild: { id: guildId, name: `Server ${suffix}`, members: { me: {} } },
    memberPermissions: { has: () => true },
    commandName: 'setup',
    isMessageContextMenuCommand: () => false,
    isModalSubmit: () => false,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isChatInputCommand: () => true,
    options: {
      getChannel: (name) => channels.get({ welcome: `welcome-${suffix}`, rules: `rules-${suffix}`, perkenalan: `intro-${suffix}` }[name]) ?? null,
      getRole: () => null,
      getString: () => null
    },
    deferReply: async function () { this.deferred = true; },
    editReply: async function () { this.replied = true; },
    reply: async function () { this.replied = true; }
  });

  await handler(makeSetupInteraction('guild-1', '1'));
  await handler(makeSetupInteraction('guild-2', '2'));
  assert.equal(guildSettings.get('guild-1').welcomeChannelId, 'welcome-1');
  assert.equal(guildSettings.get('guild-2').welcomeChannelId, 'welcome-2');

  const welcome = createGuildMemberAddHandler(guildSettings);
  const makeMember = (guildId, suffix) => ({
    id: `user-${suffix}`,
    user: { tag: `user-${suffix}`, displayAvatarURL: () => 'https://example.com/avatar.png' },
    guild: {
      id: guildId,
      name: `Server ${suffix}`,
      roles: { fetch: async () => null },
      channels: { fetch: async (id) => channels.get(id) ?? null }
    },
    roles: { add: async () => {} }
  });
  await welcome(makeMember('guild-1', '1'));
  await welcome(makeMember('guild-2', '2'));
  assert.deepEqual(sent.map(({ channelId }) => channelId), ['welcome-1', 'welcome-2']);
  db.close();
});

function createMockChannel(id, sent) {
  return {
    id,
    name: id,
    parentId: 'cat-1',
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => {
      sent.push({ channelId: id, payload });
      return { id: `msg-${sent.length}` };
    }
  };
}

function createBaseInteraction({ guildId, guildName, commandName, options = {}, channels = new Map(), roles = new Map(), memberRoles = [] }) {
  const roleCache = {
    get: (id) => roles.get(id),
    has: (id) => memberRoles.includes(id),
    keys: () => memberRoles[Symbol.iterator]()
  };
  const addedRoles = [];
  const removedRoles = [];
  const replies = [];
  let shownModal = null;
  return {
    guildId,
    guild: {
      id: guildId,
      name: guildName,
      members: {
        me: {},
        fetch: async () => ({ roles: { cache: roleCache, add: async (list) => addedRoles.push(...list), remove: async (list) => removedRoles.push(...list) } })
      },
      channels: { fetch: async (id) => channels.get(id) ?? null },
      roles: { cache: roles, fetch: async (id) => roles.get(id) ?? null }
    },
    user: { id: 'admin-1', tag: 'admin#0001', username: 'admin', displayAvatarURL: () => 'https://example.com/a.png' },
    memberPermissions: { has: () => true },
    commandName,
    isMessageContextMenuCommand: () => false,
    isModalSubmit: () => false,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isChatInputCommand: () => true,
    options: {
      getSubcommand: () => options.subcommand ?? null,
      getChannel: (name) => options[name] ?? null,
      getRole: (name) => options[name] ?? null,
      getString: (name) => options[name] ?? null,
      getBoolean: (name) => options[name] ?? null
    },
    showModal: async (modal) => { shownModal = modal.toJSON(); },
    deferReply: async function () { this.deferred = true; },
    editReply: async function (payload) { this.replied = true; replies.push(payload); },
    reply: async function (payload) { this.replied = true; replies.push(payload); },
    _addedRoles: addedRoles,
    _removedRoles: removedRoles,
    _replies: replies,
    get _shownModal() { return shownModal; }
  };
}

test('/rules publish mendukung editor modal, penyimpanan per server, dan preset roleplay', async () => {
  const db = createDatabase(':memory:');
  const guildSettings = new SettingsService(db);
  const handler = createCommandHandler({ settings: guildSettings, db, tickets: {}, reports: {} });
  const sent = [];
  const rulesChannel1Id = '100000000000000001';
  const rulesChannel2Id = '100000000000000002';
  const rulesChannel1 = createMockChannel(rulesChannel1Id, sent);
  const rulesChannel2 = createMockChannel(rulesChannel2Id, sent);
  const channels = new Map([[rulesChannel1Id, rulesChannel1], [rulesChannel2Id, rulesChannel2]]);

  // 1. Server 2 langsung publish preset roleplay
  const presetInteraction = createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'rules',
    options: { subcommand: 'publish', channel: rulesChannel2, preset: 'roleplay' },
    channels
  });
  await handler(presetInteraction);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.embeds[0].data.title, /Punakawan Role Play/);
  assert.match(sent[0].payload.embeds[0].data.description, /Metagaming & Powergaming/);
  assert.equal(guildSettings.get('punakawan-rp').rulesConfig.color, '#e67e22');

  // 2. Server 1 tanpa preset membuka modal pop-up dengan template umum
  const openModalInteraction = createBaseInteraction({
    guildId: 'sekelik-academy',
    guildName: 'Sekelik Academy',
    commandName: 'rules',
    options: { subcommand: 'publish', channel: rulesChannel1 },
    channels
  });
  await handler(openModalInteraction);
  assert.ok(openModalInteraction._shownModal);
  assert.equal(openModalInteraction._shownModal.custom_id, `sekelik:rules-publish:${rulesChannel1Id}`);

  // 3. Preset + edit:true membuka modal terisi preset tersebut
  const editPresetInteraction = createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'rules',
    options: { subcommand: 'publish', channel: rulesChannel2, preset: 'roleplay', edit: true },
    channels
  });
  await handler(editPresetInteraction);
  assert.match(editPresetInteraction._shownModal.components[1].components[0].value, /Metagaming/);

  // 4. Submit modal kustom menyimpan & mengirim aturan server 1 tanpa memengaruhi server 2
  const submitInteraction = {
    ...createBaseInteraction({ guildId: 'sekelik-academy', guildName: 'Sekelik Academy', commandName: null, channels }),
    isChatInputCommand: () => false,
    isModalSubmit: () => true,
    customId: `sekelik:rules-publish:${rulesChannel1Id}`,
    fields: {
      getTextInputValue: (id) => ({
        title: 'Aturan Khusus {server}',
        body: '1. Jangan spam.\n2. Saling bantu.',
        footer: 'Tim {server}',
        color: '#2ecc71'
      }[id])
    }
  };
  await handler(submitInteraction);

  assert.equal(sent.length, 2);
  assert.equal(sent[1].payload.embeds[0].data.title, 'Aturan Khusus Sekelik Academy');
  assert.equal(sent[1].payload.embeds[0].data.footer.text, 'Tim Sekelik Academy');
  assert.equal(sent[1].payload.embeds[0].data.color, 0x2ecc71);
  assert.equal(guildSettings.get('sekelik-academy').rulesConfig.title, 'Aturan Khusus {server}');
  assert.match(guildSettings.get('punakawan-rp').rulesConfig.title, /Aturan \{server\}/);
  assert.match(submitInteraction._replies[0].content, /disimpan dan dikirim/);

  // 5. Preset 'saved' mengirim ulang aturan tersimpan server 1
  await handler(createBaseInteraction({
    guildId: 'sekelik-academy',
    guildName: 'Sekelik Academy',
    commandName: 'rules',
    options: { subcommand: 'publish', channel: rulesChannel1, preset: 'saved' },
    channels
  }));
  assert.equal(sent.length, 3);
  assert.equal(sent[2].payload.embeds[0].data.title, 'Aturan Khusus Sekelik Academy');
  db.close();
});

test('/roles setup mendukung banyak panel, custom judul/deskripsi, serta mode single dan multi', async () => {
  const db = createDatabase(':memory:');
  const guildSettings = new SettingsService(db);
  const rolePanels = new RolePanelService(db);
  const handler = createCommandHandler({ settings: guildSettings, db, tickets: {}, reports: {}, rolePanels });
  const sent = [];
  const channel = createMockChannel('roles-ch', sent);
  const makeRole = (id, name) => ({ id, name, editable: true, toString: () => `@${name}` });
  const roles = new Map([
    ['r-kurawa', makeRole('r-kurawa', 'Kurawa')],
    ['r-pandawa', makeRole('r-pandawa', 'Pandawa')],
    ['r-event', makeRole('r-event', 'Ping Event')],
    ['r-stream', makeRole('r-stream', 'Ping Stream')],
    ['r-warga', makeRole('r-warga', 'Warga')]
  ]);

  // Panel 1: single select (Fraksi RP)
  await handler(createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'roles',
    options: {
      subcommand: 'setup',
      channel,
      mode: 'single',
      judul: '🎭 Pilih Fraksi {server}',
      deskripsi: 'Pilih satu fraksi utama.\\nBisa diganti kapan saja.',
      placeholder: 'Pilih fraksi...',
      warna: '#e67e22',
      'role-1': roles.get('r-kurawa'),
      'role-2': roles.get('r-pandawa')
    },
    roles
  }));

  // Panel 2: multi select (Notifikasi)
  await handler(createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'roles',
    options: {
      subcommand: 'setup',
      channel,
      mode: 'multi',
      judul: '🔔 Pilih Notifikasi',
      'role-1': roles.get('r-event'),
      'role-2': roles.get('r-stream')
    },
    roles
  }));

  assert.equal(sent.length, 2);
  const menu1 = sent[0].payload.components[0].toJSON().components[0];
  const menu2 = sent[1].payload.components[0].toJSON().components[0];
  assert.equal(sent[0].payload.embeds[0].data.title, '🎭 Pilih Fraksi Punakawan Role Play');
  assert.equal(sent[0].payload.embeds[0].data.description, 'Pilih satu fraksi utama.\nBisa diganti kapan saja.');
  assert.equal(menu1.max_values, 1);
  assert.equal(menu2.max_values, 2);
  assert.notEqual(menu1.custom_id, menu2.custom_id);

  // User sudah punya Kurawa & Warga, lalu memilih Pandawa di Panel 1 -> hanya Kurawa diganti Pandawa
  const selectInteraction = {
    ...createBaseInteraction({
      guildId: 'punakawan-rp',
      guildName: 'Punakawan Role Play',
      commandName: null,
      roles,
      memberRoles: ['r-kurawa', 'r-warga']
    }),
    isChatInputCommand: () => false,
    isStringSelectMenu: () => true,
    customId: menu1.custom_id,
    values: ['r-pandawa']
  };
  await handler(selectInteraction);
  assert.deepEqual(selectInteraction._addedRoles.map((r) => r.id), ['r-pandawa']);
  assert.deepEqual(selectInteraction._removedRoles.map((r) => r.id), ['r-kurawa']);
  db.close();
});

test('/verify setup, /ticket setup, dan /setup fleksibel tanpa teks spesifik Sekelik Academy', async () => {
  const db = createDatabase(':memory:');
  const guildSettings = new SettingsService(db);
  const handler = createCommandHandler({ settings: guildSettings, db, tickets: {}, reports: {} });
  const sent = [];
  const verifyChannel = createMockChannel('verify-ch', sent);
  const ticketChannel = createMockChannel('ticket-ch', sent);
  const welcomeChannel = createMockChannel('welcome-ch', sent);
  const wargaRole = { id: 'r-warga', name: 'Warga', editable: true, toString: () => '@Warga' };
  const adminRpRole = { id: 'r-adminrp', name: 'Admin RP', editable: true, toString: () => '@Admin RP' };

  await handler(createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'verify',
    options: { subcommand: 'setup', channel: verifyChannel, role: wargaRole }
  }));
  await handler(createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'ticket',
    options: { subcommand: 'setup', channel: ticketChannel, role: adminRpRole }
  }));
  await handler(createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'setup',
    options: {
      channel: null,
      welcome: welcomeChannel,
      judul: 'Sugeng Rawuh ing {server}!',
      template: 'Halo {user}, selamat ber-RP di {server}!'
    }
  }));

  const verifyEmbed = sent[0].payload.embeds[0].data;
  const ticketEmbed = sent[1].payload.embeds[0].data;
  assert.doesNotMatch(verifyEmbed.description, /belajar|Murid/i);
  assert.match(verifyEmbed.description, /Warga/);
  assert.doesNotMatch(ticketEmbed.description, /Mentor|belajar/i);
  assert.match(ticketEmbed.description, /Admin RP/);
  assert.equal(guildSettings.get('punakawan-rp').rulesChannelId, null);
  assert.equal(guildSettings.get('punakawan-rp').welcomeTitle, 'Sugeng Rawuh ing {server}!');

  // Welcome event dengan rules & perkenalan null tidak menghasilkan trailing newline atau teks Sekelik
  const welcomeHandler = createGuildMemberAddHandler(guildSettings);
  await welcomeHandler({
    id: 'u-rp',
    user: { tag: 'pemain#0001', username: 'pemain', displayAvatarURL: () => 'https://example.com/u.png' },
    guild: {
      id: 'punakawan-rp',
      name: 'Punakawan Role Play',
      roles: { fetch: async () => null },
      channels: { fetch: async (id) => (id === 'welcome-ch' ? welcomeChannel : null) }
    },
    roles: { add: async () => {} }
  });
  const welcomeEmbed = sent[2].payload.embeds[0].data;
  assert.equal(welcomeEmbed.title, 'Sugeng Rawuh ing Punakawan Role Play!');
  assert.equal(welcomeEmbed.description, 'Halo <@u-rp>, selamat ber-RP di Punakawan Role Play!');
  db.close();
});

test('ModerationService mengabaikan server yang belum dikonfigurasi', async () => {
  const db = createDatabase(':memory:');
  const guildSettings = new SettingsService(db);
  const service = new ModerationService({
    db,
    settings: guildSettings,
    detector: { evaluate: () => { throw new Error('Tidak boleh dipanggil'); } }
  });
  await service.inspect({
    guild: { id: 'unconfigured-guild' },
    author: { bot: false, id: 'u1' },
    webhookId: null
  });
  db.close();
});

test('panel role lama tetap bekerja dan tiket memakai pesan serta nama role pendamping dinamis', async () => {
  const db = createDatabase(':memory:');
  const guildSettings = new SettingsService(db);
  const tickets = new TicketService(db);
  const handler = createCommandHandler({ settings: guildSettings, db, tickets, reports: {} });
  const sent = [];
  const ticketPanelChannel = createMockChannel('ticket-panel', sent);
  const createdTicketChannel = createMockChannel('ticket-pemain', sent);
  createdTicketChannel.permissionOverwrites = { edit: async () => {} };
  createdTicketChannel.setName = async () => {};

  const adminRpRole = { id: 'r-adminrp', name: 'Admin RP', editable: true, toString: () => '@Admin RP' };
  const webRole = { id: 'r-web', name: 'Web', editable: true, toString: () => '@Web' };
  const roles = new Map([['r-adminrp', adminRpRole], ['r-web', webRole]]);
  const channels = new Map([['ticket-panel', ticketPanelChannel], ['ticket-pemain', createdTicketChannel]]);

  // Kompatibilitas panel role lama (customId tanpa panelId)
  guildSettings.update('sekelik', { rolePickerRoleIds: ['r-web'] });
  const legacySelect = {
    ...createBaseInteraction({ guildId: 'sekelik', guildName: 'Sekelik', commandName: null, roles, memberRoles: [] }),
    isChatInputCommand: () => false,
    isStringSelectMenu: () => true,
    customId: 'sekelik:role-picker',
    values: ['r-web']
  };
  await handler(legacySelect);
  assert.deepEqual(legacySelect._addedRoles.map((r) => r.id), ['r-web']);

  // Setup tiket dengan pesan-awal kustom & role Admin RP
  await handler(createBaseInteraction({
    guildId: 'punakawan-rp',
    guildName: 'Punakawan Role Play',
    commandName: 'ticket',
    options: {
      subcommand: 'setup',
      channel: ticketPanelChannel,
      role: adminRpRole,
      'pesan-awal': 'Halo {user}, jelaskan laporan RP agar {role} di {server} bisa cek.'
    },
    channels,
    roles
  }));

  const openTicketInteraction = {
    ...createBaseInteraction({ guildId: 'punakawan-rp', guildName: 'Punakawan Role Play', commandName: null, channels, roles }),
    isChatInputCommand: () => false,
    isButton: () => true,
    customId: 'sekelik:open-ticket'
  };
  openTicketInteraction.guild.roles.everyone = { id: 'everyone' };
  openTicketInteraction.guild.members.me = { id: 'bot-1', permissions: { has: () => true } };
  openTicketInteraction.guild.channels.create = async () => createdTicketChannel;

  await handler(openTicketInteraction);
  const ticketIntroEmbed = sent[1].payload.embeds[0].data;
  assert.match(ticketIntroEmbed.description, /Admin RP di Punakawan Role Play/);

  // Tutup tiket menggunakan nama role Admin RP, bukan Mentor
  const closeTicketInteraction = {
    ...createBaseInteraction({ guildId: 'punakawan-rp', guildName: 'Punakawan Role Play', commandName: null, channels, roles, memberRoles: ['r-adminrp'] }),
    isChatInputCommand: () => false,
    isButton: () => true,
    customId: 'sekelik:close-ticket',
    channelId: 'ticket-pemain',
    channel: createdTicketChannel
  };
  await handler(closeTicketInteraction);
  assert.match(sent[2].payload.content, /Admin RP/);
  assert.doesNotMatch(sent[2].payload.content, /Mentor/);
  db.close();
});
