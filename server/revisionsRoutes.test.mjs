import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revisionsRoutes } from './routes/revisions.mjs';

const revision = { id: 'revision-1', postId: 'post-1', title: 'Snapshot', isProtected: false };
let authenticated;
let service;
let app;

beforeEach(() => {
  authenticated = false;
  service = {
    list: vi.fn(() => [revision]),
    get: vi.fn(() => revision),
    compare: vi.fn(() => ({ revision, current: { id: 'post-1' }, changes: [] })),
    restore: vi.fn(() => ({ id: 'post-1', status: 'draft' })),
    remove: vi.fn(() => true)
  };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('sessions', { verify: () => authenticated });
    c.set('postRevisionService', service);
    await next();
  });
  app.route('/api/admin/posts', revisionsRoutes);
});

describe('revision admin routes', () => {
  it.each([
    ['GET', '/api/admin/posts/post-1/revisions'],
    ['GET', '/api/admin/posts/post-1/revisions/revision-1'],
    ['GET', '/api/admin/posts/post-1/revisions/revision-1/compare'],
    ['POST', '/api/admin/posts/post-1/revisions/revision-1/restore'],
    ['DELETE', '/api/admin/posts/post-1/revisions/revision-1']
  ])('requires admin authentication for %s %s', async (method, path) => {
    const response = await app.request(path, { method });
    expect(response.status).toBe(401);
  });

  it('lists, compares, restores, and deletes revisions for an administrator', async () => {
    authenticated = true;
    const list = await app.request('/api/admin/posts/post-1/revisions');
    const compare = await app.request('/api/admin/posts/post-1/revisions/revision-1/compare');
    const restore = await app.request('/api/admin/posts/post-1/revisions/revision-1/restore', { method: 'POST' });
    const remove = await app.request('/api/admin/posts/post-1/revisions/revision-1', { method: 'DELETE' });

    expect(await list.json()).toEqual({ revisions: [revision] });
    expect((await compare.json()).changes).toEqual([]);
    expect(await restore.json()).toEqual({ post: { id: 'post-1', status: 'draft' } });
    expect(await remove.json()).toEqual({ ok: true });
    expect(service.restore).toHaveBeenCalledWith('post-1', 'revision-1', { editorUserId: 'admin' });
  });

  it('returns 409 when a protected revision cannot be deleted', async () => {
    authenticated = true;
    service.remove.mockReturnValue(false);

    const response = await app.request('/api/admin/posts/post-1/revisions/revision-1', { method: 'DELETE' });

    expect(response.status).toBe(409);
  });
});
