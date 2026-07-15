import { Hono } from 'hono';
import { clearSessionCookie, writeSessionCookie } from '../sessionCookie.mjs';

const CREDENTIALS_MESSAGE = '用户名或密码错误';
const RATE_LIMIT_MESSAGE = '登录尝试过于频繁，请稍后再试';

const app = new Hono();

function normalizedUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function requestIp(c) {
  return c.get('authConfig')?.trustProxy === true ? c.req.header('x-real-ip') ?? '' : 'direct';
}

function securityLog(c, event) {
  const log = c.get('securityLog');
  if (typeof log === 'function') log(event);
}

app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store');
});

app.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const { token, user, expiresAt } = await c.get('userStore').register(body);
    writeSessionCookie(c, token);
    return c.json({ ok: true, user, expiresAt }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || '注册失败' }, 400);
  }
});

app.post('/login', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, message: '请求格式错误' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ ok: false, message: '请求格式错误' }, 400);
  }

  const username = normalizedUsername(body.username);
  const ip = requestIp(c);
  const limiter = c.get('loginRateLimiter');
  const reservation = limiter.reserve(ip, username);
  if (!reservation.allowed) {
    c.header('Retry-After', String(reservation.retryAfterSeconds));
    securityLog(c, { type: 'login_rate_limited', result: 'blocked', username, ip });
    return c.json({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
  }

  try {
    const { token, user, expiresAt } = await c.get('userStore').login(body);
    limiter.clear(ip, username);
    writeSessionCookie(c, token);
    securityLog(c, {
      type: 'login_success',
      result: 'success',
      userId: user.id,
      username,
      ip,
    });
    return c.json({ ok: true, user, expiresAt });
  } catch (error) {
    if (error?.message === CREDENTIALS_MESSAGE) {
      securityLog(c, { type: 'login_failure', result: 'failure', username, ip });
      return c.json({ ok: false, message: CREDENTIALS_MESSAGE }, 401);
    }

    securityLog(c, { type: 'login_error', result: 'error', username, ip });
    return c.json({ ok: false, message: '登录失败' }, 500);
  }
});

app.get('/me', (c) => {
  const session = c.get('authSession');
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  return c.json({ ok: true, user: session.user, expiresAt: session.expiresAt });
});

app.post('/logout', async (c) => {
  const rawToken = c.get('authToken') || '';
  const session = c.get('authSession');
  if (rawToken) await c.get('userStore').revokeSession(rawToken);
  clearSessionCookie(c);

  if (session?.user) {
    securityLog(c, {
      type: 'logout',
      result: 'success',
      userId: session.user.id,
      username: normalizedUsername(session.user.username),
      ip: requestIp(c),
    });
  }
  return c.json({ ok: true });
});

export const usersRoutes = app;
