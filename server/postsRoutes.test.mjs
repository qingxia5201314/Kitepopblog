import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { postsRoutes } from './routes/posts.mjs';
import { createPostService } from './services/postService.mjs';

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
  coverImage: '',
  publishedAt: '2026-07-01T00:00:00.000Z'
};

let app;

beforeEach(() => {
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('sessions', { verify: () => false });
    c.set('postService', createPostService({ store: {
      listPosts: () => [publishedPost],
      list: () => [publishedPost],
      get: () => publishedPost,
      queryPublic: () => ({
        posts: [{ ...publishedPost, content: undefined, readingMinutes: 2, _score: 0 }],
        total: 1
      })
    } }));
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

  it('returns the cursor contract for public pagination without changing article detail', async () => {
    const listResponse = await app.request('/api/posts?limit=8');
    const detailResponse = await app.request('/api/posts/published-post');
    const listBody = await listResponse.json();
    const detailBody = await detailResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listBody).toMatchObject({ nextCursor: null, hasMore: false, total: 1 });
    expect(listBody.posts[0]).not.toHaveProperty('content');
    expect(detailBody.post.content).toBe('Full article body');
  });

  it('returns 400 for a malformed public cursor', async () => {
    const response = await app.request('/api/posts?cursor=broken');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('keeps legacy full-list calls compatible and makes summary rows honest', async () => {
    const fullResponse = await app.request('/api/posts');
    const summaryResponse = await app.request('/api/posts?summary=1');
    const fullBody = await fullResponse.json();
    const summaryBody = await summaryResponse.json();

    expect(fullBody).toEqual({ posts: [publishedPost] });
    expect(summaryBody.posts[0]).not.toHaveProperty('content');
    expect(summaryBody).not.toHaveProperty('nextCursor');
  });
});
