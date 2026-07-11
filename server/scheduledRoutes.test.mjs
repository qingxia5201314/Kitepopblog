import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from './routes/admin.mjs';

let authenticated;
let service;
let app;

beforeEach(() => {
  authenticated = false;
  service = {
    schedule: vi.fn(() => ({ id: 'post-1', status: 'scheduled', scheduledAt: '2026-07-12T12:00:00.000Z' })),
    cancel: vi.fn(() => ({ id: 'post-1', status: 'draft', scheduledAt: '' })),
    retry: vi.fn(() => ({ id: 'post-1', status: 'published', scheduledAt: '' }))
  };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('sessions', { verify: () => authenticated });
    c.set('scheduledPublishService', service);
    await next();
  });
  app.route('/api/admin', adminRoutes);
});

describe('scheduled publishing admin routes', () => {
  it.each([
    ['PUT', '/api/admin/posts/post-1/schedule'],
    ['DELETE', '/api/admin/posts/post-1/schedule'],
    ['POST', '/api/admin/posts/post-1/schedule/retry']
  ])('requires admin authentication for %s %s', async (method, path) => {
    const response = await app.request(path, { method, body: method === 'PUT' ? JSON.stringify({ scheduledAt: '2026-07-12T12:00:00.000Z' }) : undefined, headers: { 'Content-Type': 'application/json' } });
    expect(response.status).toBe(401);
  });

  it('schedules, cancels, and retries through the service', async () => {
    authenticated = true;
    const schedule = await app.request('/api/admin/posts/post-1/schedule', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt: '2026-07-12T12:00:00.000Z' })
    });
    const cancel = await app.request('/api/admin/posts/post-1/schedule', { method: 'DELETE' });
    const retry = await app.request('/api/admin/posts/post-1/schedule/retry', { method: 'POST' });

    expect((await schedule.json()).post.status).toBe('scheduled');
    expect((await cancel.json()).post.status).toBe('draft');
    expect((await retry.json()).post.status).toBe('published');
  });
});
