import { getConnInfo } from '@hono/node-server/conninfo';
import { readSessionCookie } from '../sessionCookie.mjs';

function peerAddress(c) {
  try {
    const address = getConnInfo(c)?.remote?.address;
    return typeof address === 'string' && address.trim() ? address.trim() : 'direct';
  } catch {
    return 'direct';
  }
}

function isLoopbackAddress(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('127.') ||
    normalized.startsWith('::ffff:127.')
  );
}

function requestIp(c) {
  const peer = peerAddress(c);
  if (c.get('authConfig')?.trustProxy === true && isLoopbackAddress(peer)) {
    const forwarded = String(c.req.header('x-real-ip') ?? '').trim();
    if (forwarded) return forwarded;
  }
  return peer;
}

export function requireAdmin(c, next) {
  const user = currentUser(c);
  if (!user || user.permission !== 'admin') {
    const status = user ? 403 : 401;
    const log = c.get('securityLog');
    if (typeof log === 'function') {
      try {
        log({
          type: 'admin_access_denied',
          result: user ? 'forbidden' : 'unauthorized',
          userId: String(user?.id ?? ''),
          ip: requestIp(c)
        });
      } catch {
        // Authorization must not depend on optional audit logging.
      }
    }
    return c.json({ ok: false, message: user ? 'Forbidden' : 'Unauthorized' }, status);
  }
  return next();
}

export function isAdmin(c) {
  return currentUser(c)?.permission === 'admin';
}

export async function hydrateAuth(c, next) {
  const rawToken = readSessionCookie(c);
  c.set('authToken', rawToken);
  const authSession = (await c.get('userStore').verifySession(rawToken)) ?? null;
  c.set('authSession', authSession);
  await next();
}

export function currentUser(c) {
  return c.get('authSession')?.user ?? null;
}

export function requireUser(c, next) {
  if (!currentUser(c)) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  return next();
}
