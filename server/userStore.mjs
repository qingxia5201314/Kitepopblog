import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = createHash('sha256').update(`${salt}:${password}`, 'utf8').digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(':')[1];
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
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
    const createdAt = now().toISOString();
    const expiresAt = new Date(now().getTime() + THIRTY_DAYS_MS).toISOString();
    db.run('INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
      hashToken(token),
      user.id,
      createdAt,
      expiresAt
    ]);
    database.persist();
    return { token, expiresAt, user };
  }

  function insertUser({ username, password, nickname, permission = 'reader' }) {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '');
    if (!/^[A-Za-z0-9_]{3,24}$/.test(cleanUsername)) throw new Error('用户名需为 3-24 位字母、数字或下划线');
    if (cleanPassword.length < 6) throw new Error('密码至少 6 位');
    if (!['reader', 'admin'].includes(permission)) throw new Error('Invalid permission');
    if (getByUsername(cleanUsername)) throw new Error('用户名已存在');
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
      [user.id, user.username, hashPassword(cleanPassword), user.nickname, user.permission, user.permission, user.createdAt, user.updatedAt]
    );
    database.persist();
    return user;
  }

  return {
    listUsers() {
      return rows(db, 'SELECT * FROM users ORDER BY created_at DESC').map(rowToUser);
    },

    register({ username, password, nickname }) {
      const user = insertUser({ username, password, nickname, permission: 'reader' });
      return issueSession(user);
    },

    createUser(draft) {
      return insertUser(draft);
    },

    login({ username, password }) {
      const row = getByUsername(String(username || '').trim());
      if (!row || !verifyPassword(String(password || ''), row.password_hash)) throw new Error('用户名或密码错误');
      return issueSession(rowToUser(row));
    },

    verify(authorizationHeader = '') {
      const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return null;
      const tokenHash = hashToken(token);
      const session = rows(db, 'SELECT * FROM user_sessions WHERE token_hash = ?', [tokenHash])[0];
      if (!session || Date.parse(session.expires_at) <= now().getTime()) return null;
      return getById(session.user_id) ?? null;
    },

    updateUser(id, patch) {
      const current = getById(id);
      if (!current) return undefined;
      const updated = {
        ...current,
        nickname: String(patch.nickname ?? current.nickname).trim() || current.nickname,
        permission: ['reader', 'admin'].includes(patch.permission) ? patch.permission : current.permission,
        updatedAt: now().toISOString()
      };
      db.run('UPDATE users SET nickname = ?, role = ?, permission = ?, updated_at = ? WHERE id = ?', [
        updated.nickname,
        updated.permission,
        updated.permission,
        updated.updatedAt,
        id
      ]);
      database.persist();
      return updated;
    },

    removeUser(id) {
      const current = getById(id);
      if (!current) return false;
      db.run('DELETE FROM user_sessions WHERE user_id = ?', [id]);
      db.run('DELETE FROM users WHERE id = ?', [id]);
      database.persist();
      return true;
    }
  };
}
