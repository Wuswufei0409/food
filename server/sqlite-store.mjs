import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export class SqliteStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (
        key TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))
      ) WITHOUT ROWID;
      CREATE VIEW IF NOT EXISTS answers AS SELECT
        json_extract(payload,'$.id') AS id,
        json_extract(payload,'$.kind') AS kind,
        json_extract(payload,'$.restaurants') AS restaurants,
        json_extract(payload,'$.message') AS message,
        json_extract(payload,'$.createdAt') AS created_at
      FROM records WHERE key LIKE 'answers/%';`);
    this.read = this.db.prepare('SELECT payload FROM records WHERE key=?');
    this.write = this.db.prepare('INSERT INTO records(key,payload) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload');
  }
  getSync(key) { const row = this.read.get(key); return row ? JSON.parse(row.payload) : null; }
  async get(key) { return this.getSync(key); }
  async set(key, value) { this.write.run(key, JSON.stringify(value)); }
  async list(prefix, cursor = '') {
    const rows = this.db.prepare('SELECT key FROM records WHERE key >= ? AND key < ? AND key > ? ORDER BY key LIMIT 51').all(prefix, prefix + '\uffff', cursor);
    const keys = rows.slice(0, 50).map(row => row.key);
    return { keys, cursor: rows.length > 50 ? keys.at(-1) : undefined };
  }
  async saveAnswer(key, record, limitKey, maximum) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.getSync(key)) { this.db.exec('COMMIT'); return 'duplicate'; }
      const count = this.getSync(limitKey) || 0;
      if (count >= maximum) { this.db.exec('COMMIT'); return 'limited'; }
      this.write.run(key, JSON.stringify(record));
      this.write.run(limitKey, JSON.stringify(count + 1));
      this.db.exec('COMMIT');
      return 'created';
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async backup(filename) { mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 }); await backup(this.db, filename); }
  close() { this.db.close(); }
}
