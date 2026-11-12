import { EmbedBuilder } from 'discord.js';
import { DEFAULT_EMBED_COLOR } from './rules-presets.js';

const CATEGORY_ORDER = [
  { key: 'features', heading: '✨ Fitur Baru' },
  { key: 'improvements', heading: '⚡ Peningkatan & Penyesuaian' },
  { key: 'fixes', heading: '🐛 Perbaikan Bug' },
  { key: 'updates', heading: '📦 Pembaruan Lainnya' },
  { key: 'maintenance', heading: '🔧 Pemeliharaan & Teknis' }
];

const FEATURE_PREFIX = /^(?:feat|feature|add)(?:\([^)]*\))?:\s*(.+)$/i;
const FIX_PREFIX = /^(?:fix|bugfix|hotfix)(?:\([^)]*\))?:\s*(.+)$/i;
const IMPROVEMENT_PREFIX = /^(?:perf|refactor|style|improve|update)(?:\([^)]*\))?:\s*(.+)$/i;
const MAINTENANCE_PREFIX = /^(?:docs|chore|ci|build|test)(?:\([^)]*\))?:\s*(.+)$/i;
const MERGE_HEADLINE = /^Merge (?:pull request|branch|remote-tracking branch)\b/i;
const TRAILER_LINE = /^(?:Signed-off-by|Co-authored-by|Reviewed-by):/i;

/** Normalizes `owner/repo` or a GitHub URL into canonical `owner/repo` format. */
export function parseGitHubRepo(raw) {
  const input = raw?.trim();
  if (!input) {
    throw new Error('Repository GitHub tidak boleh kosong. Gunakan format owner/repo atau URL GitHub.');
  }
  let candidate = input;
  if (/^https?:\/\//i.test(input)) {
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      throw new Error('URL repository GitHub tidak valid.');
    }
    if (!/^(?:www\.)?github\.com$/i.test(parsed.hostname)) {
      throw new Error('URL repository harus berasal dari github.com.');
    }
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) {
      throw new Error('URL GitHub harus memuat owner dan nama repository, misalnya https://github.com/owner/repo.');
    }
    candidate = `${parts[0]}/${parts[1]}`;
  }
  candidate = candidate.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(candidate)) {
    throw new Error('Format repository tidak valid. Gunakan format owner/repo, misalnya punakawan/server-rp.');
  }
  return candidate;
}

/** Parses and categorizes a GitHub API commit object for changelog display. */
export function parseCommitEntry(commit) {
  const rawMessage = commit?.commit?.message || '';
  const lines = rawMessage.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headline = lines[0] || '(tanpa pesan commit)';
  const details = lines
    .slice(1)
    .filter((line) => !TRAILER_LINE.test(line) && !/^\[skip\s+changelog\]$/i.test(line))
    .map((line) => line.replace(/^[-*•]\s*/, '').slice(0, 180))
    .filter(Boolean)
    .slice(0, 3);

  const isMerge = MERGE_HEADLINE.test(headline)
    || (Array.isArray(commit?.parents) && commit.parents.length > 1 && /^Merge\b/i.test(headline));
  const skipChangelog = /\[skip\s+changelog\]/i.test(rawMessage);

  let category = 'updates';
  let summary = headline;
  if (FEATURE_PREFIX.test(headline)) {
    category = 'features';
    summary = headline.replace(FEATURE_PREFIX, '$1').trim();
  } else if (FIX_PREFIX.test(headline)) {
    category = 'fixes';
    summary = headline.replace(FIX_PREFIX, '$1').trim();
  } else if (IMPROVEMENT_PREFIX.test(headline)) {
    category = 'improvements';
    summary = headline.replace(IMPROVEMENT_PREFIX, '$1').trim();
  } else if (MAINTENANCE_PREFIX.test(headline)) {
    category = 'maintenance';
    summary = headline.replace(MAINTENANCE_PREFIX, '$1').trim();
  }

  return {
    sha: commit.sha,
    shortSha: (commit.sha || '').slice(0, 7),
    url: commit.html_url || null,
    author: commit.author?.login || commit.commit?.author?.name || 'developer',
    headline,
    summary: (summary || headline).slice(0, 200),
    details,
    category,
    isMerge,
    skipChangelog,
    committedAt: commit.commit?.author?.date || commit.commit?.committer?.date || null
  };
}

/** Determines whether a parsed commit should be included in the Discord changelog. */
export function shouldIncludeCommit(parsed, { ignoreMerge = true } = {}) {
  if (parsed.skipChangelog) return false;
  if (ignoreMerge && parsed.isMerge) return false;
  return true;
}

/** Formats parsed commits into a categorized Patch Notes Discord embed. */
export function buildChangelogEmbed({ guildName, tracker, commits, isPreview = false }) {
  const parsed = commits.map((commit) => (commit.summary ? commit : parseCommitEntry(commit)));
  const grouped = new Map(CATEGORY_ORDER.map(({ key }) => [key, []]));
  for (const item of parsed) {
    grouped.get(item.category).push(item);
  }

  const lines = [];
  for (const { key, heading } of CATEGORY_ORDER) {
    const items = grouped.get(key);
    if (!items.length) continue;
    lines.push(`**${heading}**`);
    for (const item of items) {
      const meta = tracker.include_links && item.url
        ? ` ([\`${item.shortSha}\`](${item.url}) — ${item.author})`
        : '';
      lines.push(`• **${item.summary}**${meta}`);
      for (const detail of item.details) {
        lines.push(`  ◦ ${detail}`);
      }
    }
    lines.push('');
  }

  let description = lines.join('\n').trim() || 'Pembaruan terbaru telah diterapkan.';
  if (description.length > 3900) {
    description = `${description.slice(0, 3850).trimEnd()}\n\n_...dan pembaruan lainnya._`;
  }

  const titleTemplate = tracker.title || '📢 Patch Notes {server}';
  const title = titleTemplate
    .replaceAll('{server}', guildName)
    .replaceAll('{repo}', tracker.repo)
    .replaceAll('{branch}', tracker.branch)
    .slice(0, 256);

  const footerText = `Branch ${tracker.branch} • ${parsed.length} pembaruan${isPreview ? ' • Pratinjau' : ''}`;
  const latestTime = parsed[parsed.length - 1]?.committedAt;

  return new EmbedBuilder()
    .setColor(tracker.color ?? DEFAULT_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footerText })
    .setTimestamp(latestTime ? new Date(latestTime) : new Date());
}

function mapGitHubError(status, remaining) {
  if (status === 401) return new Error('Token GitHub (`GITHUB_TOKEN`) tidak valid atau kedaluwarsa.');
  if ((status === 403 || status === 429) && remaining === '0') {
    return new Error('Batas rate limit GitHub API tercapai. Coba lagi nanti atau isi `GITHUB_TOKEN` di `.env` bot.');
  }
  if (status === 403) return new Error('Akses ke repository GitHub ditolak. Periksa izin `GITHUB_TOKEN`.');
  if (status === 404 || status === 422) {
    return new Error('Repository atau branch tidak ditemukan. Jika repository bersifat private, pastikan `GITHUB_TOKEN` sudah diisi di `.env`.');
  }
  return new Error(`Gagal membaca GitHub API (HTTP ${status}).`);
}

export class GitHubChangelogService {
  constructor({ db, githubToken = null, fetchImpl = fetch }) {
    this.db = db;
    this.githubToken = githubToken;
    this.fetchImpl = fetchImpl;
  }

  buildHeaders(etag = null) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sekelik-academy-bot',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (this.githubToken) headers.Authorization = `Bearer ${this.githubToken}`;
    if (etag) headers['If-None-Match'] = etag;
    return headers;
  }

  async requestJson(url, { etag = null } = {}) {
    const response = await this.fetchImpl(url, {
      headers: this.buildHeaders(etag),
      signal: AbortSignal.timeout(15_000)
    });
    if (response.status === 304) {
      return { notModified: true, data: null, etag };
    }
    if (!response.ok) {
      throw mapGitHubError(response.status, response.headers?.get?.('x-ratelimit-remaining'));
    }
    const data = await response.json();
    return { notModified: false, data, etag: response.headers?.get?.('etag') ?? null };
  }

  async fetchRepoInfo(repo) {
    const { data } = await this.requestJson(`https://api.github.com/repos/${repo}`);
    return data;
  }

  async fetchCommits(repo, branch, { perPage = 20, etag = null } = {}) {
    const url = `https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`;
    return this.requestJson(url, { etag });
  }

  /** Registers or updates a GitHub branch tracker for a guild channel. */
  async addTracker({ guildId, channelId, rawRepo, branch = null, title = null, mentionRoleId = null, color = DEFAULT_EMBED_COLOR, includeLinks = false, ignoreMerge = true }) {
    const repo = parseGitHubRepo(rawRepo);
    const resolvedBranch = branch?.trim() || (await this.fetchRepoInfo(repo)).default_branch || 'main';
    const { data: commits, etag } = await this.fetchCommits(repo, resolvedBranch, { perPage: 1 });
    if (!Array.isArray(commits) || !commits.length) {
      throw new Error(`Branch \`${resolvedBranch}\` pada \`${repo}\` belum memiliki commit.`);
    }
    const latestSha = commits[0].sha;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO github_trackers (
        guild_id, channel_id, repo, branch, title, mention_role_id, color,
        include_links, ignore_merge, last_commit_sha, etag, enabled, last_checked_at, last_error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?)
      ON CONFLICT(guild_id, repo, branch) DO UPDATE SET
        channel_id = excluded.channel_id,
        title = excluded.title,
        mention_role_id = excluded.mention_role_id,
        color = excluded.color,
        include_links = excluded.include_links,
        ignore_merge = excluded.ignore_merge,
        enabled = 1,
        last_error = NULL,
        last_checked_at = excluded.last_checked_at,
        last_commit_sha = COALESCE(github_trackers.last_commit_sha, excluded.last_commit_sha),
        etag = COALESCE(github_trackers.etag, excluded.etag)
    `).run(
      guildId, channelId, repo, resolvedBranch, title, mentionRoleId, color,
      includeLinks ? 1 : 0, ignoreMerge ? 1 : 0, latestSha, etag, now, now
    );
    return this.findTracker(guildId, repo, resolvedBranch);
  }

  listTrackers(guildId) {
    return this.db.prepare('SELECT * FROM github_trackers WHERE guild_id = ? ORDER BY id ASC').all(guildId);
  }

  listAllEnabled() {
    return this.db.prepare('SELECT * FROM github_trackers WHERE enabled = 1 ORDER BY id ASC').all();
  }

  findTracker(guildId, rawRepo, branch = null) {
    const repo = parseGitHubRepo(rawRepo);
    if (branch?.trim()) {
      return this.db.prepare('SELECT * FROM github_trackers WHERE guild_id = ? AND repo = ? AND branch = ?')
        .get(guildId, repo, branch.trim()) || null;
    }
    const matches = this.db.prepare('SELECT * FROM github_trackers WHERE guild_id = ? AND repo = ? ORDER BY id ASC')
      .all(guildId, repo);
    if (!matches.length) return null;
    if (matches.length > 1) {
      throw new Error(`Repository \`${repo}\` memiliki lebih dari satu branch (${matches.map((item) => item.branch).join(', ')}). Sertakan parameter \`branch\`.`);
    }
    return matches[0];
  }

  setEnabled(guildId, rawRepo, branch, enabled) {
    const tracker = this.findTracker(guildId, rawRepo, branch);
    if (!tracker) throw new Error('Pelacak repository tersebut tidak ditemukan di server ini.');
    this.db.prepare('UPDATE github_trackers SET enabled = ?, last_error = NULL WHERE id = ?').run(enabled ? 1 : 0, tracker.id);
    return this.db.prepare('SELECT * FROM github_trackers WHERE id = ?').get(tracker.id);
  }

  removeTracker(guildId, rawRepo, branch) {
    const tracker = this.findTracker(guildId, rawRepo, branch);
    if (!tracker) throw new Error('Pelacak repository tersebut tidak ditemukan di server ini.');
    this.db.prepare('DELETE FROM github_trackers WHERE id = ?').run(tracker.id);
    return tracker;
  }

  async resolveTargetChannel(client, tracker) {
    const guild = client.guilds.cache.get(tracker.guild_id) ?? await client.guilds.fetch(tracker.guild_id).catch(() => null);
    if (!guild) throw new Error('Server Discord tidak dapat diakses oleh bot.');
    const channel = await guild.channels.fetch(tracker.channel_id).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('Channel tujuan pengumuman tidak ditemukan atau bukan channel teks.');
    return { guild, channel };
  }

  async sendTrackerEmbed(client, tracker, commits, { isPreview = false } = {}) {
    const { guild, channel } = await this.resolveTargetChannel(client, tracker);
    const embed = buildChangelogEmbed({ guildName: guild.name, tracker, commits, isPreview });
    const payload = {
      embeds: [embed],
      allowedMentions: tracker.mention_role_id ? { roles: [tracker.mention_role_id], parse: [] } : { parse: [] }
    };
    if (tracker.mention_role_id) {
      payload.content = `<@&${tracker.mention_role_id}>`;
    }
    await channel.send(payload);
  }

  /** Checks a single tracker for new commits and posts a Patch Notes embed if needed. */
  async checkTracker(client, tracker) {
    const now = Date.now();
    try {
      const { notModified, data: commits, etag } = await this.fetchCommits(tracker.repo, tracker.branch, {
        perPage: 20,
        etag: tracker.etag
      });
      if (notModified || !Array.isArray(commits) || !commits.length) {
        this.db.prepare('UPDATE github_trackers SET last_checked_at = ?, last_error = NULL WHERE id = ?').run(now, tracker.id);
        return { posted: 0 };
      }

      const latestSha = commits[0].sha;
      if (!tracker.last_commit_sha) {
        this.db.prepare('UPDATE github_trackers SET last_commit_sha = ?, etag = ?, last_checked_at = ?, last_error = NULL WHERE id = ?')
          .run(latestSha, etag, now, tracker.id);
        return { posted: 0 };
      }

      const seenIndex = commits.findIndex((commit) => commit.sha === tracker.last_commit_sha);
      if (seenIndex === 0) {
        this.db.prepare('UPDATE github_trackers SET etag = ?, last_checked_at = ?, last_error = NULL WHERE id = ?')
          .run(etag, now, tracker.id);
        return { posted: 0 };
      }

      const unseenRaw = seenIndex > 0 ? commits.slice(0, seenIndex).reverse() : commits.slice(0, 10).reverse();
      const visible = unseenRaw
        .map(parseCommitEntry)
        .filter((entry) => shouldIncludeCommit(entry, { ignoreMerge: Boolean(tracker.ignore_merge) }));

      if (visible.length) {
        await this.sendTrackerEmbed(client, tracker, visible);
      }

      this.db.prepare('UPDATE github_trackers SET last_commit_sha = ?, etag = ?, last_checked_at = ?, last_error = NULL WHERE id = ?')
        .run(latestSha, etag, now, tracker.id);
      return { posted: visible.length };
    } catch (error) {
      this.db.prepare('UPDATE github_trackers SET last_checked_at = ?, last_error = ? WHERE id = ?')
        .run(now, (error?.message || 'Kesalahan tidak diketahui').slice(0, 300), tracker.id);
      throw error;
    }
  }

  /** Sends a preview Patch Notes embed using the latest commit without advancing sync state. */
  async previewLatest(client, tracker) {
    const { data: commits } = await this.fetchCommits(tracker.repo, tracker.branch, { perPage: 5 });
    if (!Array.isArray(commits) || !commits.length) {
      throw new Error(`Belum ada commit pada \`${tracker.repo}\` branch \`${tracker.branch}\`.`);
    }
    const parsed = commits.map(parseCommitEntry);
    const preferred = parsed.find((entry) => shouldIncludeCommit(entry, { ignoreMerge: Boolean(tracker.ignore_merge) }));
    await this.sendTrackerEmbed(client, tracker, [preferred || parsed[0]], { isPreview: true });
  }

  /** Polls all enabled trackers across all configured guilds. */
  async pollAll(client) {
    const trackers = this.listAllEnabled();
    let postedTotal = 0;
    for (const tracker of trackers) {
      try {
        const result = await this.checkTracker(client, tracker);
        postedTotal += result.posted;
      } catch (error) {
        console.error(`Gagal memeriksa changelog ${tracker.repo}@${tracker.branch} di guild ${tracker.guild_id}:`, error.message);
      }
    }
    return postedTotal;
  }

  /** Starts periodic polling and returns a handle to stop all timers cleanly. */
  startPolling(client, intervalMs = 120_000) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await this.pollAll(client);
      } finally {
        running = false;
      }
    };
    const startupTimer = setTimeout(tick, Math.min(15_000, intervalMs));
    startupTimer.unref?.();
    const timer = setInterval(tick, intervalMs);
    timer.unref?.();
    return {
      stop: () => {
        clearTimeout(startupTimer);
        clearInterval(timer);
      }
    };
  }
}
