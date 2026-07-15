import { readSessionCookie } from '../sessionCookie.mjs';

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
          userId: user?.id ?? null,
          ip: null
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
