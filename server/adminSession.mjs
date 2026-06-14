import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAdminSessionStore({ database }) {
  const { db } = database;
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  database.persist();

  function rows(sql, params = []) {
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

  return {
    createSession({ tokenHash, createdAt, expiresAt }) {
      db.run('INSERT OR REPLACE INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)', [
        tokenHash,
        createdAt,
        expiresAt
      ]);
      database.persist();
    },

    getSession(tokenHash) {
      return rows('SELECT token_hash AS tokenHash, created_at AS createdAt, expires_at AS expiresAt FROM admin_sessions WHERE token_hash = ?', [
        tokenHash
      ])[0];
    },

    removeExpiredSessions(nowIso) {
      db.run('DELETE FROM admin_sessions WHERE expires_at <= ?', [nowIso]);
      database.persist();
    },

    debugListSessions() {
      return rows('SELECT token_hash AS tokenHash, created_at AS createdAt, expires_at AS expiresAt FROM admin_sessions');
    }
  };
}

export function createAdminSessions({ store, now = () => new Date() } = {}) {
  const tokens = new Set();

  return {
    issue() {
      const token = randomBytes(32).toString('base64url');
      if (store) {
        const createdAt = now().toISOString();
        const expiresAt = new Date(now().getTime() + THIRTY_DAYS_MS).toISOString();
        store.createSession({ tokenHash: hashToken(token), createdAt, expiresAt });
        return { token, expiresAt };
      }
      tokens.add(token);
      return token;
    },

    verify(authorizationHeader = '') {
      const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return false;

      if (store) {
        const tokenHash = hashToken(token);
        const session = store.getSession(tokenHash);
        if (!session) return false;
        if (Date.parse(session.expiresAt) <= now().getTime()) {
          store.removeExpiredSessions(now().toISOString());
          return false;
        }
        return safeEqual(session.tokenHash, tokenHash);
      }

      for (const knownToken of tokens) {
        if (safeEqual(token, knownToken)) return true;
      }

      return false;
    }
  };
}
