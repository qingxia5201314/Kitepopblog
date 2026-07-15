import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createOriginGuard } from './origin.mjs';

function createApp(options) {
  const app = new Hono();
  app.use('*', createOriginGuard(options));
  app.all('*', (c) => c.json({ ok: true, method: c.req.method }));
  return app;
}

describe('createOriginGuard', () => {
  it.each([undefined, '', 'not a URL', '/relative', 'mailto:admin@example.com'])(
    'rejects invalid production SITE_URL %j when the guard is created',
    (siteUrl) => {
      expect(() => createOriginGuard({ production: true, siteUrl })).toThrow(/SITE_URL.*valid/i);
    }
  );

  it.each(['GET', 'HEAD', 'OPTIONS'])('passes %s through without inspecting Origin', async (method) => {
    const response = await createApp({ production: true, siteUrl: 'https://blog.example/settings' }).request(
      'https://blog.example/resource',
      { method, headers: { Origin: 'not a URL' } }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    if (method !== 'HEAD') expect(await response.json()).toEqual({ ok: true, method });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rejects a missing Origin for production %s requests',
    async (method) => {
      const response = await createApp({ production: true, siteUrl: 'https://blog.example' }).request(
        'https://blog.example/resource',
        { method }
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );

  it.each(['null', 'not a URL', 'https://other.example'])(
    'rejects production Origin %j',
    async (origin) => {
      const response = await createApp({ production: true, siteUrl: 'https://blog.example' }).request(
        'https://blog.example/resource',
        { method: 'POST', headers: { Origin: origin } }
      );

      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );

  it('compares normalized production origins and ignores URL paths', async () => {
    const response = await createApp({
      production: true,
      siteUrl: 'https://BLOG.example:443/admin?from=config'
    }).request('https://unrelated.internal/write', {
      method: 'POST',
      headers: { Origin: 'https://blog.example/request/path' }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, method: 'POST' });
  });

  it('allows a missing Origin outside production even when SITE_URL is invalid', async () => {
    const response = await createApp({ production: false, siteUrl: 'not a URL' }).request(
      'http://localhost:4173/write',
      { method: 'POST' }
    );

    expect(response.status).toBe(200);
  });

  it('accepts a normalized Origin matching the current request origin outside production', async () => {
    const response = await createApp({ production: false }).request('http://LOCALHOST:80/write', {
      method: 'PATCH',
      headers: { Origin: 'http://localhost/some/path' }
    });

    expect(response.status).toBe(200);
  });

  it.each(['null', 'not a URL', 'http://localhost:4174'])(
    'rejects development Origin %j when the request is on another origin',
    async (origin) => {
      const response = await createApp({ production: false }).request('http://localhost:4173/write', {
        method: 'DELETE',
        headers: { Origin: origin }
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );
});
