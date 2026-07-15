import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoginRateLimiter } from '../loginRateLimit.mjs';
import { hydrateAuth } from '../middleware/auth.mjs';
import { createOriginGuard } from '../middleware/origin.mjs';
import { createSqliteDatabase } from '../sqliteDatabase.mjs';
import { createUserStore } from '../userStore.mjs';
import { usersRoutes } from './users.mjs';

const CREDENTIALS_MESSAGE = '用户名或密码错误';
const RATE_LIMIT_MESSAGE = '登录尝试过于频繁，请稍后再试';
const PRIVATE_NO_STORE = 'private, no-store';

let database;
let events;
let store;
let tempDir;

function createFixture({
  authConfig = { secureCookies: false, trustProxy: false },
  limiter = createLoginRateLimiter({ now: () => 1_000 }),
  securityLog = (event) => events.push(event),
  userStore = store,
} = {}) {
  const app = new Hono();
  app.use('/api/users/*', async (c, next) => {
    c.set('authConfig', authConfig);
    c.set('loginRateLimiter', limiter);
    c.set('securityLog', securityLog);
    c.set('userStore', userStore);
    await next();
  });
  app.use('/api/users/*', createOriginGuard({ production: false }));
  app.use('/api/users/*', hydrateAuth);
  app.route('/api/users', usersRoutes);
  return app;
}

function jsonRequest(path, body, { headers = {}, method = 'POST' } = {}) {
  return [
    `http://localhost${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
  ];
}

function cookiePair(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0] || '';
}

function expectPrivateNoStore(response) {
  expect(response.headers.get('cache-control')).toBe(PRIVATE_NO_STORE);
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-user-routes-'));
  database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createUserStore({ database, now: () => new Date('2026-07-15T00:00:00.000Z') });
  events = [];
});

afterEach(async () => {
  database.db.close();
  await rm(tempDir, { force: true, recursive: true });
});

describe('users routes', () => {
  it('registers through the async store and returns only the public session shape in a hardened cookie', async () => {
    const app = createFixture();
    const response = await app.request(
      ...jsonRequest('/api/users/register', {
        username: 'Reader_01',
        password: 'registration-secret',
        nickname: 'Reader',
      }),
    );

    expect(response.status).toBe(201);
    expectPrivateNoStore(response);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie');
    const rawToken = cookiePair(response).split('=')[1];
    expect(body).toEqual({
      ok: true,
      user: expect.objectContaining({ username: 'Reader_01', nickname: 'Reader', permission: 'reader' }),
      expiresAt: '2026-08-14T00:00:00.000Z',
    });
    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain(rawToken);
    expect(setCookie).toMatch(/^kitepop_dev_session=[^;]+;/);
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');
  });

  it('returns 400 for malformed registration JSON and invalid registration input', async () => {
    const app = createFixture();
    const malformed = await app.request(...jsonRequest('/api/users/register', '{'));
    const invalid = await app.request(
      ...jsonRequest('/api/users/register', { username: 'x', password: 'short' }),
    );

    expect(malformed.status).toBe(400);
    expect(invalid.status).toBe(400);
    expectPrivateNoStore(malformed);
    expectPrivateNoStore(invalid);
    expect(malformed.headers.get('set-cookie')).toBeNull();
    expect(invalid.headers.get('set-cookie')).toBeNull();
  });

  it('logs in with a cookie without returning the raw token', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const response = await app.request(
      ...jsonRequest('/api/users/login', { username: ' READER01 ', password: 'secret123' }),
    );

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    const body = await response.json();
    const rawToken = cookiePair(response).split('=')[1];
    expect(body).toEqual({
      ok: true,
      user: expect.objectContaining({ username: 'reader01', nickname: 'Reader' }),
      expiresAt: '2026-08-14T00:00:00.000Z',
    });
    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain(rawToken);
    expect(events).toContainEqual({
      type: 'login_success',
      result: 'success',
      userId: body.user.id,
      username: 'reader01',
      ip: 'direct',
    });
  });

  it('restores /me from the session cookie and ignores Authorization-only sessions', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const fromCookie = await app.request('http://localhost/api/users/me', {
      headers: { Cookie: `kitepop_dev_session=${session.token}` },
    });
    const fromAuthorization = await app.request('http://localhost/api/users/me', {
      headers: { Authorization: `Bearer ${session.token}` },
    });

    expect(fromCookie.status).toBe(200);
    expect(await fromCookie.json()).toEqual({ ok: true, user: session.user, expiresAt: session.expiresAt });
    expect(fromAuthorization.status).toBe(401);
    expect(await fromAuthorization.json()).toEqual({ ok: false, message: 'Unauthorized' });
    expectPrivateNoStore(fromCookie);
    expectPrivateNoStore(fromAuthorization);
  });

  it('revokes logout sessions, rejects replay, and keeps anonymous logout idempotent', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const cookie = `kitepop_dev_session=${session.token}`;
    const logout = await app.request('http://localhost/api/users/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    const replay = await app.request('http://localhost/api/users/me', { headers: { Cookie: cookie } });
    const anonymous = await app.request('http://localhost/api/users/logout', { method: 'POST' });

    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });
    expect(logout.headers.get('set-cookie')).toMatch(/^kitepop_dev_session=;/);
    expect(replay.status).toBe(401);
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toEqual({ ok: true });
    expect(anonymous.headers.get('set-cookie')).toMatch(/^kitepop_dev_session=;/);
    expectPrivateNoStore(logout);
    expectPrivateNoStore(replay);
    expectPrivateNoStore(anonymous);
    expect(events.filter((event) => event.type === 'logout')).toEqual([
      {
        type: 'logout',
        result: 'success',
        userId: session.user.id,
        username: 'reader01',
        ip: 'direct',
      },
    ]);
  });

  it('uses the same 401 response and failure log for unknown users and wrong passwords', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const unknown = await app.request(
      ...jsonRequest('/api/users/login', { username: 'missing', password: 'secret123' }),
    );
    const wrong = await app.request(
      ...jsonRequest('/api/users/login', { username: ' READER01 ', password: 'wrong-password' }),
    );

    for (const response of [unknown, wrong]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
      expectPrivateNoStore(response);
    }
    expect(events).toEqual([
      { type: 'login_failure', result: 'failure', username: 'missing', ip: 'direct' },
      { type: 'login_failure', result: 'failure', username: 'reader01', ip: 'direct' },
    ]);
  });

  it('returns 400 for malformed login JSON and generic 401 for missing fields', async () => {
    const app = createFixture();
    const malformed = await app.request(...jsonRequest('/api/users/login', '{'));
    const missing = await app.request(...jsonRequest('/api/users/login', { nickname: 'not-credentials' }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ ok: false, message: '请求格式错误' });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
    expectPrivateNoStore(malformed);
    expectPrivateNoStore(missing);
  });

  it('reserves five failed attempts and blocks the sixth with Retry-After', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.request(
        ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
      );
      expect(failed.status).toBe(401);
    }
    const blocked = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('900');
    expect(await blocked.json()).toEqual({ ok: false, message: RATE_LIMIT_MESSAGE });
    expectPrivateNoStore(blocked);
    expect(events.at(-1)).toEqual({
      type: 'login_rate_limited',
      result: 'blocked',
      username: 'reader01',
      ip: 'direct',
    });
  }, 15_000);

  it('clears the successful login reservation immediately', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const limiter = createLoginRateLimiter({ now: () => 1_000, maxFailures: 1 });
    const app = createFixture({ limiter });
    const success = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'secret123' }),
    );
    const firstFailure = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
    );
    const blocked = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
    );

    expect(success.status).toBe(200);
    expect(firstFailure.status).toBe(401);
    expect(blocked.status).toBe(429);
  });

  it('allows only one of three concurrent requests to enter password verification', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    let loginCalls = 0;
    const countedStore = {
      ...store,
      async login(draft) {
        loginCalls += 1;
        return store.login(draft);
      },
    };
    const app = createFixture({
      limiter: createLoginRateLimiter({ now: () => 1_000, maxFailures: 1 }),
      userStore: countedStore,
    });

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        app.request(...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' })),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([401, 429, 429]);
    expect(loginCalls).toBe(1);
  });

  it.each([
    [false, 'direct'],
    [true, '203.0.113.44'],
  ])('uses only the configured client IP source when trustProxy=%s', async (trustProxy, expectedIp) => {
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const app = createFixture({
      authConfig: { secureCookies: false, trustProxy },
      limiter: { reserve, clear: vi.fn() },
    });
    const response = await app.request(
      ...jsonRequest(
        '/api/users/login',
        { username: ' Mixed_User ', password: 'not-a-secret' },
        {
          headers: {
            'X-Real-IP': '203.0.113.44',
            'X-Forwarded-For': '198.51.100.8',
          },
        },
      ),
    );

    expect(response.status).toBe(401);
    expect(reserve).toHaveBeenCalledWith(expectedIp, 'mixed_user');
    expect(events.at(-1)).toMatchObject({ username: 'mixed_user', ip: expectedIp });
  });

  it('uses an empty trusted IP when x-real-ip is absent', async () => {
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const app = createFixture({
      authConfig: { secureCookies: false, trustProxy: true },
      limiter: { reserve, clear: vi.fn() },
    });

    await app.request(...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }));

    expect(reserve).toHaveBeenCalledWith('', 'reader01');
  });

  it('keeps failed reservations and hides unexpected login errors behind a generic 500', async () => {
    const clear = vi.fn();
    const failingStore = {
      ...store,
      async login() {
        throw new Error('database exploded: internal-secret');
      },
    };
    const app = createFixture({
      limiter: { reserve: () => ({ allowed: true, retryAfterSeconds: 0 }), clear },
      userStore: failingStore,
    });
    const response = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'password-secret' }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: '登录失败' });
    expectPrivateNoStore(response);
    expect(clear).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'login_error', result: 'error', username: 'reader01', ip: 'direct' },
    ]);
    expect(JSON.stringify(events)).not.toContain('internal-secret');
    expect(JSON.stringify(events)).not.toContain('password-secret');
  });

  it('passes only allowlisted, non-sensitive fields to the security logger', async () => {
    const registered = await store.register({
      username: 'reader01',
      password: 'secret123',
      nickname: 'Reader',
    });
    const app = createFixture();
    await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'log-password-marker' }),
    );
    const login = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'secret123' }),
    );
    await app.request('http://localhost/api/users/logout', {
      method: 'POST',
      headers: { Cookie: cookiePair(login) },
    });

    const allowedFields = new Set(['type', 'result', 'userId', 'username', 'ip']);
    expect(events.map((event) => event.type)).toEqual(['login_failure', 'login_success', 'logout']);
    for (const event of events) {
      expect(Object.keys(event).every((key) => allowedFields.has(key))).toBe(true);
    }
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('log-password-marker');
    expect(serialized).not.toContain('secret123');
    expect(serialized).not.toContain(registered.token);
    expect(serialized).not.toContain(cookiePair(login));
  });
});
