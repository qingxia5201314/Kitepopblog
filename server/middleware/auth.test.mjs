import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as auth from './auth.mjs';

const { currentUser, hydrateAuth, isAdmin, requireAdmin, requireUser } = auth;

const reader = { id: 'reader-1', username: 'reader', nickname: 'Reader', permission: 'reader' };
const admin = { id: 'admin-1', username: 'admin', nickname: 'Admin', permission: 'admin' };

let verifySession;
let privateHandler;
let adminHandler;
let securityLog;
let app;

function sessionFor(token) {
  if (token === 'reader-token') return { user: reader, expiresAt: '2026-08-14T00:00:00.000Z' };
  if (token === 'admin-token') return { user: admin, expiresAt: '2026-08-14T00:00:00.000Z' };
  return null;
}

function createAuthApp(authConfig, options = {}) {
  const log = Object.hasOwn(options, 'log') ? options.log : securityLog;
  const authApp = new Hono();
  authApp.onError((error, c) => c.text(error.message, 500));
  authApp.use('*', async (c, next) => {
    if (authConfig !== undefined) c.set('authConfig', authConfig);
    if (log !== undefined) c.set('securityLog', log);
    c.set('userStore', { verifySession });
    await next();
  });
  authApp.use('*', hydrateAuth);
  authApp.get('/context', (c) =>
    c.json({
      authToken: c.get('authToken'),
      authSession: c.get('authSession'),
      user: currentUser(c)
    })
  );
  authApp.get('/private', requireUser, privateHandler);
  authApp.get('/admin', requireAdmin, adminHandler);
  authApp.get('/is-admin', (c) => c.json({ isAdmin: isAdmin(c) }));
  return authApp;
}

beforeEach(() => {
  verifySession = vi.fn(sessionFor);
  privateHandler = vi.fn((c) => c.json({ ok: true, user: currentUser(c) }));
  adminHandler = vi.fn((c) => c.json({ ok: true, user: currentUser(c) }));
  securityLog = vi.fn();
  app = createAuthApp({ secureCookies: false });
});

describe('hydrateAuth', () => {
  it('hydrates an anonymous request and verifies the empty token once', async () => {
    const response = await app.request('/context');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authToken: '', authSession: null, user: null });
    expect(verifySession).toHaveBeenCalledTimes(1);
    expect(verifySession).toHaveBeenCalledWith('');
  });

  it.each([
    ['reader-token', reader],
    ['admin-token', admin]
  ])('hydrates the %s session once and exposes only the user through currentUser', async (token, user) => {
    const response = await app.request('/context', {
      headers: { Cookie: `kitepop_dev_session=${token}` }
    });
    const body = await response.json();

    expect(body.authToken).toBe(token);
    expect(body.authSession).toEqual({ user, expiresAt: '2026-08-14T00:00:00.000Z' });
    expect(body.user).toEqual(user);
    expect(body.user).not.toHaveProperty('token');
    expect(verifySession).toHaveBeenCalledTimes(1);
    expect(verifySession).toHaveBeenCalledWith(token);
  });

  it('does not treat Authorization as a session token', async () => {
    const response = await app.request('/context', {
      headers: { Authorization: 'Bearer admin-token' }
    });

    expect(await response.json()).toEqual({ authToken: '', authSession: null, user: null });
    expect(verifySession).toHaveBeenCalledTimes(1);
    expect(verifySession).toHaveBeenCalledWith('');
  });

  it('does not throw for special or malformed Cookie headers', async () => {
    const response = await app.request('/context', {
      headers: { Cookie: 'broken; kitepop_dev_session=%E0%A4%A; =bad' }
    });

    expect(response.status).toBe(200);
    expect(verifySession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing authConfig', undefined],
    ['empty authConfig', {}],
    ['non-boolean secureCookies', { secureCookies: 'false' }]
  ])('rejects %s before session verification or protected handlers', async (_configLabel, authConfig) => {
    const response = await createAuthApp(authConfig).request('/private', {
      headers: { Cookie: 'kitepop_dev_session=reader-token' }
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('authConfig.secureCookies must be boolean');
    expect(verifySession).not.toHaveBeenCalled();
    expect(privateHandler).not.toHaveBeenCalled();
  });

  it.each([
    ['throws synchronously', () => {
      throw new Error('sync verifier failure');
    }],
    ['rejects asynchronously', () => Promise.reject(new Error('async verifier failure'))]
  ])('returns 500 and skips protected handlers when verifySession %s', async (_label, failure) => {
    verifySession.mockImplementation(failure);

    const response = await app.request('/private', {
      headers: { Cookie: 'kitepop_dev_session=reader-token' }
    });

    expect(response.status).toBe(500);
    expect(privateHandler).not.toHaveBeenCalled();
  });

  it.each([
    ['bad-token; kitepop_dev_session=reader-token', 401, 'bad-token'],
    ['reader-token; kitepop_dev_session=bad-token', 200, 'reader-token']
  ])('uses the first duplicate session cookie value from %s', async (cookieValues, status, expectedToken) => {
    const response = await app.request('/private', {
      headers: { Cookie: `kitepop_dev_session=${cookieValues}` }
    });

    expect(response.status).toBe(status);
    expect(verifySession).toHaveBeenCalledOnce();
    expect(verifySession).toHaveBeenCalledWith(expectedToken);
    if (status === 401) expect(privateHandler).not.toHaveBeenCalled();
    else expect(privateHandler).toHaveBeenCalledOnce();
  });
});

describe('requireUser', () => {
  it('returns the standard 401 response for anonymous requests', async () => {
    const response = await app.request('/private');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, message: 'Unauthorized' });
  });

  it.each([
    ['reader-token', reader],
    ['admin-token', admin]
  ])('allows the %s role through', async (token, user) => {
    const response = await app.request('/private', {
      headers: { Cookie: `kitepop_dev_session=${token}` }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, user });
    expect(verifySession).toHaveBeenCalledTimes(1);
  });
});

describe('requireAdmin', () => {
  it.each([
    ['anonymous', undefined, 401, 'unauthorized', null],
    ['reader', 'reader-token', 403, 'forbidden', reader.id]
  ])('denies %s requests and emits one safe audit event', async (_role, token, status, result, userId) => {
    const response = await app.request('/admin', {
      headers: token ? { Cookie: `kitepop_dev_session=${token}` } : undefined
    });

    expect(response.status).toBe(status);
    expect(adminHandler).not.toHaveBeenCalled();
    expect(securityLog).toHaveBeenCalledOnce();
    expect(securityLog).toHaveBeenCalledWith({
      type: 'admin_access_denied',
      result,
      userId,
      ip: null
    });
  });

  it('allows administrators without emitting a denial event', async () => {
    const response = await app.request('/admin', {
      headers: { Cookie: 'kitepop_dev_session=admin-token' }
    });

    expect(response.status).toBe(200);
    expect(adminHandler).toHaveBeenCalledOnce();
    expect(securityLog).not.toHaveBeenCalled();
  });

  it('does not fail when the optional security logger is missing', async () => {
    const response = await createAuthApp({ secureCookies: false }, { log: undefined }).request('/admin');

    expect(response.status).toBe(401);
  });
});

describe('isAdmin', () => {
  it.each([
    ['anonymous', undefined, false],
    ['reader', 'reader-token', false],
    ['admin', 'admin-token', true]
  ])('uses only currentUser permission for %s requests', async (_role, token, expected) => {
    const response = await app.request('/is-admin', {
      headers: token ? { Cookie: `kitepop_dev_session=${token}` } : undefined
    });

    expect(await response.json()).toEqual({ isAdmin: expected });
  });
});

describe('legacy auth compatibility', () => {
  it('does not export legacy password-session helpers', () => {
    expect(auth).not.toHaveProperty('requireAccounting');
    expect(auth).not.toHaveProperty('getAccountingAuth');
  });
});
