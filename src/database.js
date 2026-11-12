import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exemptions (
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('user', 'role', 'channel')),
      value TEXT NOT NULL,
      PRIMARY KEY (guild_id, type, value)
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      reasons TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS incidents_lookup ON incidents(guild_id, user_id, created_at);
    CREATE TABLE IF NOT EXISTS moderation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id)
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
      created_at INTEGER NOT NULL,
      closed_at INTEGER,
      closed_by TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_ticket_per_user ON tickets(guild_id, user_id) WHERE status = 'open';
    CREATE TABLE IF NOT EXISTS message_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(guild_id, reporter_id, message_id)
    );
    CREATE TABLE IF NOT EXISTS role_panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      mode TEXT NOT NULL CHECK(mode IN ('single', 'multi')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      placeholder TEXT NOT NULL,
      color INTEGER NOT NULL,
      role_ids TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS github_trackers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      title TEXT,
      mention_role_id TEXT,
      color INTEGER NOT NULL DEFAULT 5793266,
      include_links INTEGER NOT NULL DEFAULT 0,
      ignore_merge INTEGER NOT NULL DEFAULT 1,
      last_commit_sha TEXT,
      etag TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(guild_id, repo, branch)
    );
  `);
  return db;
}
