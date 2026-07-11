import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from './routes/admin.mjs';

let authenticated;
let draftService;
let postService;
let app;

beforeEach(() => {
  authenticated = false;
  draftService = { get: vi.fn(() => ({ editingId: 'post-1', updatedAt: '2026-07-12T00:00:00.000Z', draft: { title: 'Autosave preview', content: '$x^2$' } })) };
  postService = { getPost: vi.fn(() => ({ id: 'post-1', title: 'Stored post', status: 'draft', content: 'stored' })) };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('sessions', { verify: () => authenticated });
    c.set('draftService', draftService);
    c.set('postService', postService);
    await next();
  });
  app.route('/api/admin', adminRoutes);
});

describe('article preview route', () => {
  it('rejects unauthenticated preview reads', async () => {
    const response = await app.request('/api/admin/article-preview/post-1');
    expect(response.status).toBe(401);
  });

  it('returns the matching database autosave without mutating the post', async () => {
    authenticated = true;
    const response = await app.request('/api/admin/article-preview/post-1');
    const body = await response.json();

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(body.post).toMatchObject({ id: 'post-1', title: 'Autosave preview', content: '$x^2$', status: 'draft' });
    expect(postService.getPost).toHaveBeenCalledTimes(1);
    expect(draftService.get).toHaveBeenCalledTimes(1);
  });
});
