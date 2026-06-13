import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import initSqlJs from 'sql.js';

export async function createSqliteDatabase({ dbPath = './data/blog.sqlite' } = {}) {
  const SQL = await initSqlJs();
  const db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database();

  return {
    db,
    persist() {
      mkdirSync(dirname(dbPath), { recursive: true });
      writeFileSync(dbPath, Buffer.from(db.export()));
    }
  };
}
