export class ReportService {
  constructor(db) { this.db = db; }
  hasReported(guildId, reporterId, messageId) {
    return this.db.prepare('SELECT id FROM message_reports WHERE guild_id = ? AND reporter_id = ? AND message_id = ?').get(guildId, reporterId, messageId);
  }
  create({ guildId, reporterId, messageId, channelId, authorId, reason, excerpt }) {
    return this.db.prepare(`
      INSERT INTO message_reports (guild_id, reporter_id, message_id, channel_id, author_id, reason, excerpt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, reporterId, messageId, channelId, authorId, reason, excerpt, Date.now()).lastInsertRowid;
  }
}
