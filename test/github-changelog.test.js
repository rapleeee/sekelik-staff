import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/database.js';
import { SettingsService } from '../src/services/settings-service.js';
import { createCommandHandler } from '../src/commands/handler.js';
import {
  GitHubChangelogService,
  buildChangelogEmbed,
  parseCommitEntry,
  parseGitHubRepo
} from '../src/services/github-changelog-service.js';

function makeGitHubCommit({ sha, message, author = 'dev', url = null, parents = [{ sha: 'parent0' }], date = '2026-11-12T01:00:00Z' }) {
  return {
    sha,
    html_url: url || `https://github.com/punakawan/rp-server/commit/${sha}`,
    author: { login: author },
    parents,
    commit: {
      message,
      author: { name: author, date }
    }
  };
}

function makeResponse({ status = 200, json = null, etag = null, remaining = '59' }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => ({ etag, 'x-ratelimit-remaining': remaining }[name.toLowerCase()] ?? null)
    },
    json: async () => json
  };
}

test('parseGitHubRepo menormalkan format owner/repo dan URL GitHub', () => {
  assert.equal(parseGitHubRepo('punakawan/server-rp'), 'punakawan/server-rp');
  assert.equal(parseGitHubRepo('https://github.com/punakawan/server-rp.git'), 'punakawan/server-rp');
  assert.equal(parseGitHubRepo('https://github.com/punakawan/server-rp/tree/main'), 'punakawan/server-rp');
  assert.throws(() => parseGitHubRepo('https://gitlab.com/a/b'), /github\.com/);
  assert.throws(() => parseGitHubRepo('bukan-repo'), /Format repository/);
});

test('parseCommitEntry dan buildChangelogEmbed mengelompokkan patch notes rapi serta menyembunyikan link secara default', () => {
  const c1 = makeGitHubCommit({
    sha: '1111111aaaaaaa',
    message: 'feat(job): tambah sistem petani\n- Harga jual padi disesuaikan\n- Lokasi ladang baru'
  });
  const c2 = makeGitHubCommit({
    sha: '2222222bbbbbbb',
    message: 'fix: perbaiki bug inventory hilang saat relog'
  });
  const c3 = makeGitHubCommit({
    sha: '3333333ccccccc',
    message: 'Update balancing ekonomi kota'
  });
  const mergeCommit = parseCommitEntry(makeGitHubCommit({
    sha: '4444444ddddddd',
    message: 'Merge pull request #12 from punakawan/fix',
    parents: [{ sha: 'a' }, { sha: 'b' }]
  }));
  assert.equal(mergeCommit.isMerge, true);

  const embedHidden = buildChangelogEmbed({
    guildName: 'Punakawan Role Play',
    tracker: { repo: 'punakawan/rp-server', branch: 'main', include_links: 0, color: 0xe67e22 },
    commits: [c1, c2, c3]
  }).toJSON();

  assert.equal(embedHidden.title, '📢 Patch Notes Punakawan Role Play');
  assert.equal(embedHidden.color, 0xe67e22);
  assert.match(embedHidden.description, /✨ Fitur Baru/);
  assert.match(embedHidden.description, /🐛 Perbaikan Bug/);
  assert.match(embedHidden.description, /📦 Pembaruan Lainnya/);
  assert.match(embedHidden.description, /Harga jual padi disesuaikan/);
  assert.doesNotMatch(embedHidden.description, /github\.com/);

  const embedWithLinks = buildChangelogEmbed({
    guildName: 'Punakawan Role Play',
    tracker: { repo: 'punakawan/rp-server', branch: 'main', include_links: 1, title: 'Update {repo}' },
    commits: [c1]
  }).toJSON();
  assert.equal(embedWithLinks.title, 'Update punakawan/rp-server');
  assert.match(embedWithLinks.description, /1111111/);
  assert.match(embedWithLinks.description, /github\.com/);
});

test('GitHubChangelogService mendeteksi branch utama, memakai ETag 304, dan mengirim commit baru saja', async () => {
  const db = createDatabase(':memory:');
  let phase = 'init';
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (url === 'https://api.github.com/repos/punakawan/rp-server') {
      return makeResponse({ json: { default_branch: 'main' } });
    }
    if (phase === 'init') {
      return makeResponse({
        etag: '"etag-1"',
        json: [makeGitHubCommit({ sha: 'sha-old-1', message: 'chore: setup awal' })]
      });
    }
    if (phase === 'no-change') {
      assert.equal(init.headers['If-None-Match'], '"etag-1"');
      return makeResponse({ status: 304, etag: '"etag-1"' });
    }
    return makeResponse({
      etag: '"etag-2"',
      json: [
        makeGitHubCommit({ sha: 'sha-new-2', message: 'fix: bug garasi mobil' }),
        makeGitHubCommit({ sha: 'sha-merge', message: 'Merge pull request #5', parents: [{ sha: '1' }, { sha: '2' }] }),
        makeGitHubCommit({ sha: 'sha-new-1', message: 'feat: sistem mekanik baru' }),
        makeGitHubCommit({ sha: 'sha-old-1', message: 'chore: setup awal' })
      ]
    });
  };

  const service = new GitHubChangelogService({ db, githubToken: 'ghp_test', fetchImpl });
  const tracker = await service.addTracker({
    guildId: 'g-rp',
    channelId: 'ch-update',
    rawRepo: 'https://github.com/punakawan/rp-server',
    mentionRoleId: 'role-warga',
    includeLinks: false,
    ignoreMerge: true
  });

  assert.equal(tracker.branch, 'main');
  assert.equal(tracker.last_commit_sha, 'sha-old-1');
  assert.equal(calls[0].headers.Authorization, 'Bearer ghp_test');

  const sent = [];
  const mockClient = {
    guilds: {
      cache: new Map([['g-rp', {
        id: 'g-rp',
        name: 'Punakawan Role Play',
        channels: {
          fetch: async (id) => (id === 'ch-update' ? { id, isTextBased: () => true, send: async (payload) => sent.push(payload) } : null)
        }
      }]])
    }
  };

  // Tidak ada perubahan (304 Not Modified)
  phase = 'no-change';
  assert.equal(await service.pollAll(mockClient), 0);
  assert.equal(sent.length, 0);

  // Ada 2 commit baru + 1 merge commit (merge diabaikan)
  phase = 'new-commits';
  assert.equal(await service.pollAll(mockClient), 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content, '<@&role-warga>');
  assert.deepEqual(sent[0].allowedMentions, { roles: ['role-warga'], parse: [] });
  const embed = sent[0].embeds[0].toJSON();
  assert.match(embed.description, /sistem mekanik baru/);
  assert.match(embed.description, /bug garasi mobil/);
  assert.doesNotMatch(embed.description, /Merge pull request/);

  const updated = service.findTracker('g-rp', 'punakawan/rp-server', 'main');
  assert.equal(updated.last_commit_sha, 'sha-new-2');
  assert.equal(updated.etag, '"etag-2"');
  db.close();
});

test('GitHubChangelogService menyimpan last_error dan tidak memajukan SHA bila kirim ke Discord gagal', async () => {
  const db = createDatabase(':memory:');
  let call = 0;
  const service = new GitHubChangelogService({
    db,
    fetchImpl: async () => {
      call += 1;
      if (call === 1) return makeResponse({ json: { default_branch: 'main' } });
      if (call === 2) return makeResponse({ json: [makeGitHubCommit({ sha: 'sha-1', message: 'awal' })] });
      return makeResponse({
        json: [
          makeGitHubCommit({ sha: 'sha-2', message: 'feat: fitur baru' }),
          makeGitHubCommit({ sha: 'sha-1', message: 'awal' })
        ]
      });
    }
  });

  await service.addTracker({ guildId: 'g', channelId: 'ch-missing', rawRepo: 'owner/repo' });
  const brokenClient = {
    guilds: { cache: new Map([['g', { id: 'g', name: 'RP', channels: { fetch: async () => null } }]]) }
  };
  await assert.rejects(() => service.checkTracker(brokenClient, service.listTrackers('g')[0]), /Channel tujuan/);
  const trackerAfterFail = service.listTrackers('g')[0];
  assert.equal(trackerAfterFail.last_commit_sha, 'sha-1');
  assert.match(trackerAfterFail.last_error, /Channel tujuan/);
  db.close();
});

test('command /changelog add, list, test, toggle, dan remove bekerja terisolasi per server', async () => {
  const db = createDatabase(':memory:');
  const settings = new SettingsService(db);
  const changelog = new GitHubChangelogService({
    db,
    fetchImpl: async (url) => {
      if (url.endsWith('/repos/punakawan/rp')) return makeResponse({ json: { default_branch: 'main' } });
      return makeResponse({ json: [makeGitHubCommit({ sha: 'abc123456', message: 'feat: sistem kerja kurir' })] });
    }
  });
  const sent = [];
  const channel = {
    id: 'ch-patch',
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => sent.push(payload)
  };
  const guild = {
    id: 'g-rp',
    name: 'Punakawan Role Play',
    members: { me: {} },
    channels: { fetch: async (id) => (id === 'ch-patch' ? channel : null) }
  };
  const mockClient = { guilds: { cache: new Map([['g-rp', guild]]) } };
  const handler = createCommandHandler({ settings, db, tickets: {}, reports: {}, changelog });

  const makeInteraction = (subcommand, opts = {}) => {
    const replies = [];
    return {
      guildId: 'g-rp',
      guild,
      client: mockClient,
      memberPermissions: { has: () => true },
      commandName: 'changelog',
      isMessageContextMenuCommand: () => false,
      isModalSubmit: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      options: {
        getSubcommand: () => subcommand,
        getString: (k) => opts[k] ?? null,
        getChannel: (k) => opts[k] ?? null,
        getRole: (k) => opts[k] ?? null,
        getBoolean: (k) => opts[k] ?? null
      },
      deferReply: async function () { this.deferred = true; },
      editReply: async function (p) { this.replied = true; replies.push(p); },
      reply: async function (p) { this.replied = true; replies.push(p); },
      _replies: replies
    };
  };

  const addInt = makeInteraction('add', { repo: 'punakawan/rp', channel, judul: '📢 Update Kota {server}' });
  await handler(addInt);
  assert.match(addInt._replies[0].content, /punakawan\/rp@main/);

  const listInt = makeInteraction('list');
  await handler(listInt);
  assert.match(listInt._replies[0].content, /punakawan\/rp@main/);

  const testInt = makeInteraction('test', { repo: 'punakawan/rp' });
  await handler(testInt);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds[0].toJSON().title, '📢 Update Kota Punakawan Role Play');
  assert.match(sent[0].embeds[0].toJSON().description, /sistem kerja kurir/);

  const toggleInt = makeInteraction('toggle', { repo: 'punakawan/rp', aktif: false });
  await handler(toggleInt);
  assert.match(toggleInt._replies[0].content, /dijeda/);

  const removeInt = makeInteraction('remove', { repo: 'punakawan/rp' });
  await handler(removeInt);
  assert.match(removeInt._replies[0].content, /dihapus/);
  assert.equal(changelog.listTrackers('g-rp').length, 0);
  db.close();
});

