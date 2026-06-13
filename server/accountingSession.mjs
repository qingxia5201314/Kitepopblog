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

function bearerToken(authorizationHeader = '') {
  return authorizationHeader.replace(/^Bearer\s+/i, '').trim();
}

export function createAccountingSessions({ store, now = () => new Date() }) {
  return {
    issue() {
      const token = randomBytes(32).toString('base64url');
      const createdAt = now().toISOString();
      const expiresAt = new Date(now().getTime() + THIRTY_DAYS_MS).toISOString();
      store.createSession({ tokenHash: hashToken(token), createdAt, expiresAt });
      return { token, expiresAt };
    },

    verify(authorizationHeader = '') {
      const token = bearerToken(authorizationHeader);
      if (!token) return false;
      const tokenHash = hashToken(token);
      const session = store.getSession(tokenHash);
      if (!session) return false;
      if (Date.parse(session.expiresAt) <= now().getTime()) {
        store.removeExpiredSessions(now().toISOString());
        return false;
      }
      return safeEqual(session.tokenHash, tokenHash);
    }
  };
}
