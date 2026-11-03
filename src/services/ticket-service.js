export class TicketService {
  constructor(db) { this.db = db; }
  findOpenForUser(guildId, userId) {
    return this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = ?').get(guildId, userId, 'open');
  }
  findOpenForChannel(guildId, channelId) {
    return this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? AND status = ?').get(guildId, channelId, 'open');
  }
  create({ guildId, channelId, userId }) {
    return this.db.prepare('INSERT INTO tickets (guild_id, channel_id, user_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, channelId, userId, 'open', Date.now()).lastInsertRowid;
  }
  close(channelId, closedBy) {
    return this.db.prepare('UPDATE tickets SET status = ?, closed_at = ?, closed_by = ? WHERE channel_id = ? AND status = ?')
      .run('closed', Date.now(), closedBy, channelId, 'open').changes > 0;
  }
}
