export class RolePanelService {
  constructor(db) {
    this.db = db;
  }

  /** Creates a role-picker panel record and returns its numeric ID. */
  create({ guildId, channelId, mode, title, description, placeholder, color, roleIds }) {
    return this.db.prepare(`
      INSERT INTO role_panels (guild_id, channel_id, mode, title, description, placeholder, color, role_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, mode, title, description, placeholder, color, JSON.stringify(roleIds), Date.now()).lastInsertRowid;
  }

  /** Associates the posted Discord message ID with an existing role panel. */
  setMessageId(id, messageId) {
    this.db.prepare('UPDATE role_panels SET message_id = ? WHERE id = ?').run(messageId, id);
  }

  /** Removes a role panel record (used to roll back failed message sends). */
  delete(id) {
    this.db.prepare('DELETE FROM role_panels WHERE id = ?').run(id);
  }

  /** Finds a role panel belonging to a guild by its numeric ID. */
  findById(guildId, id) {
    const row = this.db.prepare('SELECT * FROM role_panels WHERE guild_id = ? AND id = ?').get(guildId, id);
    if (!row) return null;
    return { ...row, roleIds: JSON.parse(row.role_ids) };
  }
}

