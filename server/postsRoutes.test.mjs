import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { postsRoutes } from './routes/posts.mjs';

const publishedPost = {
  id: 'post-1',
  slug: 'published-post',
  title: 'Published post',
  summary: 'Summary',
  category: 'notes',
  tags: [],
  content: 'Full article body',
  status: 'published',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  cover: 'notes',
  coverImage: ''
};

let app;

beforeEach(() => {
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('sessions', { verify: () => false });
    c.set('postService', {
      listPosts: () => [publishedPost],
      getPost: () => publishedPost
    });
    await next();
  });
  app.route('/api/posts', postsRoutes);
});

describe('public post cache policy', () => {
  it('requires revalidation for compact lists and full article responses', async () => {
    const listResponse = await app.request('/api/posts?summary=1');
    const detailResponse = await app.request('/api/posts/published-post');

    expect(listResponse.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(detailResponse.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(listResponse.headers.get('cache-control')).not.toContain('stale-while-revalidate');
    expect(detailResponse.headers.get('cache-control')).not.toContain('stale-while-revalidate');
  });
});
