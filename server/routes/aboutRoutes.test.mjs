import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSessions } from '../adminSession.mjs';
import { apiNotFound } from '../middleware/apiNotFound.mjs';
import { adminRoutes } from './admin.mjs';
import { aboutRoutes } from './about.mjs';

const profile = {
  avatarUrl: '/avatar.png',
  displayName: 'Kite',
  identityTags: ['Developer'],
  intro: 'Hello',
  githubUrl: 'https://github.com/kite',
  content: '# About',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

let app;
let aboutStore;
let sessions;
let token;

beforeEach(() => {
  aboutStore = {
    get: vi.fn(() => profile),
    save: vi.fn((input) => ({ ...input, updatedAt: profile.updatedAt })),
  };
  sessions = createAdminSessions();
  token = sessions.issue();
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('aboutStore', aboutStore);
    c.set('sessions', sessions);
    await next();
  });
  app.route('/api/about', aboutRoutes);
  app.route('/api/admin', adminRoutes);
  app.all('/api/*', apiNotFound);
});

describe('about routes', () => {
  it('serves the public profile with shared-cache headers', async () => {
    const response = await app.request('/api/about');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(await response.json()).toEqual({ profile });
  });

  it('rejects unauthenticated admin reads and writes', async () => {
    const getResponse = await app.request('/api/admin/about');
    const putResponse = await app.request('/api/admin/about', { method: 'PUT', body: JSON.stringify(profile) });

    expect(getResponse.status).toBe(401);
    expect(putResponse.status).toBe(401);
  });

  it('returns the profile to an authenticated admin', async () => {
    const response = await app.request('/api/admin/about', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile });
  });

  it('saves and returns an authenticated admin update', async () => {
    const input = { ...profile, displayName: 'Updated', updatedAt: '' };
    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(200);
    expect(aboutStore.save).toHaveBeenCalledWith(input);
    expect(await response.json()).toEqual({ profile: { ...input, updatedAt: profile.updatedAt } });
  });

  it('returns a stable 400 response for malformed JSON without leaking a native TypeError', async () => {
    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, message: 'Invalid request body' });
    expect(body.message).not.toMatch(/TypeError/i);
  });

  it('returns the profile validation message as a 400 response', async () => {
    aboutStore.save.mockImplementation(() => {
      throw new Error('请填写名称');
    });

    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, message: '请填写名称' });
  });

  it('returns a stable 500 response when profile persistence fails', async () => {
    aboutStore.save.mockImplementation(() => {
      throw new Error('SQLITE_IOERR: disk I/O error at C:\\secret\\blog.sqlite');
    });

    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: 'About save failed' });
  });
});

describe('server wiring', () => {
  it('creates, injects, and mounts the about store before the API fallback', async () => {
    const source = await readFile('server/index.mjs', 'utf8');

    expect(source).toContain("import { createAboutStore } from './aboutStore.mjs'");
    expect(source).toContain("import { aboutRoutes } from './routes/about.mjs'");
    expect(source).toMatch(/const aboutStore = createAboutStore\(\{ database \}\)/);
    expect(source).toContain("c.set('aboutStore', aboutStore)");
    expect(source).toContain("app.route('/api/about', aboutRoutes)");
    expect(source.indexOf("app.route('/api/about', aboutRoutes)")).toBeLessThan(source.indexOf("app.all('/api/*', apiNotFound)"));
  });
});
