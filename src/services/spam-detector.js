const URL_PATTERN = /https?:\/\/[^\s<>()]+/giu;
const INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/[a-z0-9-]+/iu;

function hostFromUrl(raw) {
  try { return new URL(raw).hostname.toLowerCase().replace(/\.$/, ''); } catch { return null; }
}
function domainMatches(host, domain) {
  const normalized = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  return normalized && (host === normalized || host.endsWith(`.${normalized}`));
}
export function findBlockedDomains(content, domains) {
  return [...content.matchAll(URL_PATTERN)]
    .map((match) => hostFromUrl(match[0]))
    .filter((host) => host && domains.some((domain) => domainMatches(host, domain)));
}

export class SpamDetector {
  constructor({ maxEntries = 200, maxAgeMs = 120_000 } = {}) {
    this.maxEntries = maxEntries;
    this.maxAgeMs = maxAgeMs;
    this.activity = new Map();
    this.cooldowns = new Map();
  }
  clearExpired(now = Date.now()) {
    for (const [key, entries] of this.activity) {
      const recent = entries.filter((entry) => now - entry.at <= this.maxAgeMs);
      if (recent.length) this.activity.set(key, recent.slice(-this.maxEntries));
      else this.activity.delete(key);
    }
    for (const [key, until] of this.cooldowns) if (until <= now) this.cooldowns.delete(key);
  }
  evaluate({ guildId, userId, messageId, content, mentionUserIds = [], now = Date.now(), settings }) {
    this.clearExpired(now);
    const key = `${guildId}:${userId}`;
    const entries = (this.activity.get(key) || []).filter((entry) => entry.messageId !== messageId);
    entries.push({ messageId, content: content.trim().toLowerCase(), at: now });
    this.activity.set(key, entries.slice(-this.maxEntries));
    const reasons = [];
    const { thresholds } = settings;
    if (entries.filter((entry) => now - entry.at <= thresholds.floodWindowMs).length >= thresholds.floodCount) reasons.push('flood');
    const normalized = content.trim().toLowerCase();
    if (normalized && entries.filter((entry) => entry.content === normalized && now - entry.at <= thresholds.repeatWindowMs).length >= thresholds.repeatCount) reasons.push('pesan-berulang');
    if (new Set(mentionUserIds).size >= thresholds.mentionCount) reasons.push('mention-berlebihan');
    if (findBlockedDomains(content, settings.blockedDomains).length) reasons.push('domain-terblokir');
    if (settings.inviteFilter && INVITE_PATTERN.test(content)) reasons.push('undangan-discord');
    if (!reasons.length || this.cooldowns.has(key)) return null;
    this.cooldowns.set(key, now + settings.cooldownMs);
    return { reasons, key };
  }
}
