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
