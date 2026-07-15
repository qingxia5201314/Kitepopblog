import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentUser,
  getAccountingAuth,
  hydrateAuth,
  isAdmin,
  requireAccounting,
  requireAdmin,
  requireUser
} from './auth.mjs';

const reader = { id: 'reader-1', username: 'reader', nickname: 'Reader', permission: 'reader' };
const admin = { id: 'admin-1', username: 'admin', nickname: 'Admin', permission: 'admin' };

let verifySession;
let app;

function sessionFor(token) {
  if (token === 'reader-token') return { user: reader, expiresAt: '2026-08-14T00:00:00.000Z' };
  if (token === 'admin-token') return { user: admin, expiresAt: '2026-08-14T00:00:00.000Z' };
  return null;
}

beforeEach(() => {
  verifySession = vi.fn(sessionFor);
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authConfig', { secureCookies: false });
    c.set('userStore', { verifySession });
    await next();
  });
  app.use('*', hydrateAuth);
  app.get('/context', (c) =>
    c.json({
      authToken: c.get('authToken'),
      authSession: c.get('authSession'),
      user: currentUser(c)
    })
  );
  app.get('/private', requireUser, (c) => c.json({ ok: true, user: currentUser(c) }));
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

describe('legacy auth compatibility', () => {
  it('continues to export the legacy middleware helpers', () => {
    expect(requireAdmin).toBeTypeOf('function');
    expect(isAdmin).toBeTypeOf('function');
    expect(requireAccounting).toBeTypeOf('function');
    expect(getAccountingAuth).toBeTypeOf('function');
  });
});
