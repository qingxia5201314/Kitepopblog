import { access, readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { apiNotFound } from './middleware/apiNotFound.mjs';
import { hydrateAuth } from './middleware/auth.mjs';
import { createOriginGuard } from './middleware/origin.mjs';

describe('API fallback', () => {
  it('returns a JSON 404 before the SPA fallback handles page routes', async () => {
    const app = new Hono();
    app.all('/api/*', apiNotFound);
    app.get('*', (c) => c.html('<div id="root"></div>'));

    const apiResponse = await app.request('/api/unknown');
    const pageResponse = await app.request('/unknown-page');

    expect(apiResponse.status).toBe(404);
    expect(apiResponse.headers.get('content-type')).toContain('application/json');
    expect(await apiResponse.json()).toEqual({ ok: false, message: 'API route not found' });
    expect(pageResponse.status).toBe(200);
  });
});

describe('server auth wiring', () => {
  it('initializes users before the migration and all remaining stores', async () => {
    const source = await readFile('server/index.mjs', 'utf8');
    const database = source.indexOf('const database = await createSqliteDatabase');
    const userStore = source.indexOf('const userStore = createUserStore({ database })');
    const migration = source.indexOf('runAdminAuthMigration({');
    const postStore = source.indexOf('const store = await createPostStore({ database })');

    expect(source).toContain("import { runAdminAuthMigration } from './migrations/adminAuthMigration.mjs'");
    expect(database).toBeGreaterThanOrEqual(0);
    expect(userStore).toBeGreaterThan(database);
    expect(migration).toBeGreaterThan(userStore);
    expect(postStore).toBeGreaterThan(migration);
    expect(source).toContain("requireSingleAdmin: process.env.NODE_ENV === 'production'");
  });

  it('injects unified auth dependencies before origin, hydration, and API routes', async () => {
    const source = await readFile('server/index.mjs', 'utf8');
    const dependencyInjection = source.indexOf("c.set('authConfig', authConfig)");
    const origin = source.indexOf("app.use('/api/*', originGuard)");
    const hydration = source.indexOf("app.use('/api/*', hydrateAuth)");
    const routes = source.indexOf("app.route('/api/admin', adminRoutes)");

    expect(source).toContain("import { createLoginRateLimiter } from './loginRateLimit.mjs'");
    expect(source).toContain("import { createOriginGuard } from './middleware/origin.mjs'");
    expect(source).toContain("import { hydrateAuth } from './middleware/auth.mjs'");
    expect(source).toContain("import { writeSecurityEvent } from './securityLog.mjs'");
    expect(source).toMatch(/const authConfig = \{[\s\S]*secureCookies: process\.env\.NODE_ENV === 'production',[\s\S]*siteUrl: String\(process\.env\.SITE_URL \|\| ''\),[\s\S]*trustProxy: process\.env\.TRUST_PROXY === '1'[\s\S]*\}/);
    expect(source).toContain('const loginRateLimiter = createLoginRateLimiter()');
    expect(source).toContain('const originGuard = createOriginGuard({ production, siteUrl })');
    expect(source).toContain("c.set('loginRateLimiter', loginRateLimiter)");
    expect(source).toContain("c.set('securityLog', writeSecurityEvent)");
    expect(dependencyInjection).toBeGreaterThanOrEqual(0);
    expect(origin).toBeGreaterThan(dependencyInjection);
    expect(hydration).toBeGreaterThan(origin);
    expect(routes).toBeGreaterThan(hydration);
  });

  it('marks authenticated API responses private without changing public route cache directives', async () => {
    const source = await readFile('server/index.mjs', 'utf8');
    const hydration = source.indexOf("app.use('/api/*', hydrateAuth)");
    const privateCache = source.indexOf("c.header('Cache-Control', 'private, no-store')", hydration);
    const routes = source.indexOf("app.route('/api/admin', adminRoutes)");

    expect(privateCache).toBeGreaterThan(hydration);
    expect(privateCache).toBeLessThan(routes);
    expect(source).toContain("c.header('Cache-Control', PUBLIC_FEED_CACHE)");
    expect(source).toContain("c.header('Cache-Control', PUBLIC_DYNAMIC_CACHE)");
  });

  it('has no legacy auth construction, secrets, or context keys', async () => {
    const source = await readFile('server/index.mjs', 'utf8');

    expect(source).not.toMatch(/createAdminSession|createAdminSessions|createAccountingSessions/);
    expect(source).not.toMatch(/adminPassword|ADMIN_PASSWORD|accountingSessions/);
    await expect(access('server/adminSession.mjs')).rejects.toThrow();
    await expect(access('server/adminSession.test.mjs')).rejects.toThrow();
    await expect(access('server/accountingSession.mjs')).rejects.toThrow();
    await expect(access('server/auth.mjs')).rejects.toThrow();
    await expect(access('server/auth.test.mjs')).rejects.toThrow();
  });

  it('rejects a production cross-origin write before querying the session database', async () => {
    const verifySession = vi.fn(() => null);
    const app = new Hono();
    app.use('/api/*', async (c, next) => {
      c.set('authConfig', { secureCookies: true, trustProxy: true });
      c.set('userStore', { verifySession });
      await next();
    });
    app.use('/api/*', createOriginGuard({ production: true, siteUrl: 'https://blog.example' }));
    app.use('/api/*', hydrateAuth);
    app.post('/api/write', (c) => c.json({ ok: true }));

    const response = await app.request('/api/write', {
      method: 'POST',
      headers: {
        Cookie: '__Host-kitepop_session=secret-token',
        Origin: 'https://evil.example'
      }
    });

    expect(response.status).toBe(403);
    expect(verifySession).not.toHaveBeenCalled();
  });
});

describe('production environment wiring', () => {
  it('documents the production auth and loopback server settings', async () => {
    const source = await readFile('.env.example', 'utf8');
    const lines = source.split(/\r?\n/);

    expect(lines).toContain('NODE_ENV=production');
    expect(lines).toContain('SITE_URL=https://dreamhunter2333.com');
    expect(lines).toContain('TRUST_PROXY=1');
    expect(lines).toContain('HOST=127.0.0.1');
    expect(lines.filter((line) => line.startsWith('HOST='))).toHaveLength(1);
    expect(source).not.toContain('ADMIN_PASSWORD');
  });

  it('pins proxy identity headers and the backend to loopback', async () => {
    const source = await readFile('deploy/nginx-kitepop.conf', 'utf8');

    expect(source).toContain('proxy_pass http://127.0.0.1:3000;');
    expect(source).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(source).toContain('proxy_set_header X-Forwarded-Proto https;');
    expect(source).toContain('proxy_set_header X-Forwarded-Host $host;');
  });
});
