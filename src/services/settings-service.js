export const DEFAULT_SETTINGS = Object.freeze({
  welcomeChannelId: null,
  rulesChannelId: null,
  introductionChannelId: null,
  welcomeTemplate: 'Halo {user}, selamat datang di {server}! 🎉 Silakan baca aturan komunitas dan perkenalkan dirimu. Selamat belajar dan berkarya bersama!',
  autoRoleId: null,
  logChannelId: null,
  verificationChannelId: null,
  verificationRoleId: null,
  rolePickerRoleIds: [],
  ticketPanelChannelId: null,
  ticketSupportRoleId: null,
  automodEnabled: true,
  mode: 'progressive',
  dryRun: true,
  thresholds: { floodCount: 6, floodWindowMs: 5_000, repeatCount: 3, repeatWindowMs: 20_000, mentionCount: 5 },
  blockedDomains: [],
  inviteFilter: false,
  incidentWindowMs: 86_400_000,
  cooldownMs: 30_000
});

export class SettingsService {
  constructor(db) { this.db = db; }
  get(guildId) {
    const row = this.db.prepare('SELECT data FROM guild_settings WHERE guild_id = ?').get(guildId);
    return { ...DEFAULT_SETTINGS, ...(row ? JSON.parse(row.data) : {}) };
  }
  update(guildId, patch) {
    const settings = { ...this.get(guildId), ...patch };
    this.db.prepare(`
      INSERT INTO guild_settings (guild_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(guildId, JSON.stringify(settings), Date.now());
    return settings;
  }
  listExemptions(guildId, type) {
    return this.db.prepare('SELECT value FROM exemptions WHERE guild_id = ? AND type = ?').all(guildId, type).map((row) => row.value);
  }
  addExemption(guildId, type, value) {
    this.db.prepare('INSERT OR IGNORE INTO exemptions (guild_id, type, value) VALUES (?, ?, ?)').run(guildId, type, value);
  }
  removeExemption(guildId, type, value) {
    return this.db.prepare('DELETE FROM exemptions WHERE guild_id = ? AND type = ? AND value = ?').run(guildId, type, value).changes > 0;
  }
}
