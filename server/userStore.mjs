import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords.mjs';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    permission: row.permission,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rows(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result = [];
    while (statement.step()) result.push(statement.getAsObject());
    return result;
  } finally {
    statement.free();
  }
}

export function createUserStore({ database, now = () => new Date() }) {
  const { db } = database;
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'reader',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  database.persist();

  function getByUsername(username) {
    return rows(db, 'SELECT * FROM users WHERE lower(username) = lower(?)', [username])[0];
  }

  function getById(id) {
    return rows(db, 'SELECT * FROM users WHERE id = ?', [id]).map(rowToUser)[0];
  }

  function issueSession(user) {
    const token = randomBytes(32).toString('base64url');
    const createdOn = now();
    const createdAt = createdOn.toISOString();
    const expiresAt = new Date(createdOn.getTime() + THIRTY_DAYS_MS).toISOString();
    db.run('INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
      hashToken(token),
      user.id,
      createdAt,
      expiresAt
    ]);
    database.persist();
    return { token, expiresAt, user };
  }

  async function insertUser({ username, password, nickname, permission = 'reader' }) {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '');
    if (!/^[A-Za-z0-9_]{3,24}$/.test(cleanUsername)) throw new Error('用户名需为 3-24 位字母、数字或下划线');
    if (cleanPassword.length < 6) throw new Error('密码至少 6 位');
    if (!['reader', 'admin'].includes(permission)) throw new Error('Invalid permission');
    if (getByUsername(cleanUsername)) throw new Error('用户名已存在');
    const passwordHash = await hashPassword(cleanPassword);
    const time = now().toISOString();
    const user = {
      id: `user-${randomBytes(12).toString('hex')}`,
      username: cleanUsername,
      nickname: String(nickname || cleanUsername).trim() || cleanUsername,
      permission,
      createdAt: time,
      updatedAt: time
    };
    db.run(
      `INSERT INTO users (id, username, password_hash, nickname, role, permission, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.username, passwordHash, user.nickname, user.permission, user.permission, user.createdAt, user.updatedAt]
    );
    database.persist();
    return user;
  }

  return {
    listUsers() {
      return rows(db, 'SELECT * FROM users ORDER BY created_at DESC').map(rowToUser);
    },

    async register({ username, password, nickname }) {
      const user = await insertUser({ username, password, nickname, permission: 'reader' });
      return issueSession(user);
    },

    async createUser(draft) {
      return insertUser(draft);
    },

    async login({ username, password }) {
      const row = getByUsername(String(username || '').trim());
      if (!row) throw new Error('用户名或密码错误');

      const verification = await verifyPassword(String(password || ''), row.password_hash);
      if (!verification.valid) throw new Error('用户名或密码错误');

      const user = rowToUser(row);
      if (!verification.needsRehash) return issueSession(user);

      const passwordHash = await hashPassword(String(password || ''));
      return database.transaction(() => {
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, row.id]);
        return issueSession(user);
      });
    },

    verifySession(rawToken) {
      if (typeof rawToken !== 'string' || !rawToken) return null;
      const tokenHash = hashToken(rawToken);
      const session = rows(db, 'SELECT * FROM user_sessions WHERE token_hash = ?', [tokenHash])[0];
      if (!session) return null;
      if (Date.parse(session.expires_at) <= now().getTime()) {
        db.run('DELETE FROM user_sessions WHERE token_hash = ?', [tokenHash]);
        database.persist();
        return null;
      }

      const user = getById(session.user_id);
      return user ? { user, expiresAt: session.expires_at } : null;
    },

    revokeSession(rawToken) {
      if (typeof rawToken !== 'string' || !rawToken) return false;
      db.run('DELETE FROM user_sessions WHERE token_hash = ?', [hashToken(rawToken)]);
      const revoked = db.getRowsModified() > 0;
      if (revoked) database.persist();
      return revoked;
    },

    revokeUserSessions(userId) {
      if (!getById(userId)) return false;
      db.run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
      database.persist();
      return true;
    },

    updateUser(id, patch) {
      return database.transaction(() => {
        const current = getById(id);
        if (!current) return undefined;

        const permission = ['reader', 'admin'].includes(patch.permission) ? patch.permission : current.permission;
        const permissionChanged = permission !== current.permission;
        if (permissionChanged && current.permission === 'admin' && permission === 'reader') {
          const adminCount = Number(rows(db, "SELECT COUNT(*) AS count FROM users WHERE permission = 'admin'")[0].count);
          if (adminCount <= 1) throw lastAdminError();
        }

        const updated = {
          ...current,
          nickname: String(patch.nickname ?? current.nickname).trim() || current.nickname,
          permission,
          updatedAt: now().toISOString()
        };
        db.run('UPDATE users SET nickname = ?, role = ?, permission = ?, updated_at = ? WHERE id = ?', [
          updated.nickname,
          updated.permission,
          updated.permission,
          updated.updatedAt,
          id
        ]);
        if (permissionChanged) db.run('DELETE FROM user_sessions WHERE user_id = ?', [id]);
        database.persist();
        return updated;
      });
    },

    removeUser(id) {
      return database.transaction(() => {
        const current = getById(id);
        if (!current) return false;
        if (current.permission === 'admin') {
          const adminCount = Number(rows(db, "SELECT COUNT(*) AS count FROM users WHERE permission = 'admin'")[0].count);
          if (adminCount <= 1) throw lastAdminError();
        }

        db.run('DELETE FROM user_sessions WHERE user_id = ?', [id]);
        db.run('DELETE FROM users WHERE id = ?', [id]);
        database.persist();
        return true;
      });
    }
  };
}

function lastAdminError() {
  const error = new Error('不能降权或删除最后一个管理员');
  error.code = 'LAST_ADMIN';
  error.status = 409;
  return error;
}
