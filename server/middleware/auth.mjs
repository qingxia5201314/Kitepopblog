import { readSessionCookie } from '../sessionCookie.mjs';

export function requireAdmin(c, next) {
  const sessions = c.get('sessions');
  const token = c.req.header('Authorization')?.replace('Bearer ', '') || '';
  if (!sessions.verify(token)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }
  return next();
}

export function isAdmin(c) {
  const sessions = c.get('sessions');
  const token = c.req.header('Authorization')?.replace('Bearer ', '') || '';
  return sessions.verify(token);
}

export function requireAccounting(c, next) {
  const accountingSessions = c.get('accountingSessions');
  const token = c.req.header('Authorization') || '';
  if (!accountingSessions.verify(token)) {
    return c.json({ ok: false, message: 'Accounting session expired' }, 401);
  }
  return next();
}

export function getAccountingAuth(c) {
  const accountingSessions = c.get('accountingSessions');
  const token = c.req.header('Authorization') || '';
  return accountingSessions.verify(token);
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
