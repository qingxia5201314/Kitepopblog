import { randomBytes, timingSafeEqual } from 'node:crypto';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAdminSessions() {
  const tokens = new Set();

  return {
    issue() {
      const token = randomBytes(32).toString('base64url');
      tokens.add(token);
      return token;
    },

    verify(authorizationHeader = '') {
      const token = authorizationHeader.replace(/^Bearer\s+/i, '');
      if (!token) return false;

      for (const knownToken of tokens) {
        if (safeEqual(token, knownToken)) return true;
      }

      return false;
    }
  };
}
