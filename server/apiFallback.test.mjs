import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { apiNotFound } from './middleware/apiNotFound.mjs';

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
