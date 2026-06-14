import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPostComment, listPostComments, listPosts, loginUser, registerUser } from './blogApi';

describe('blog api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests drafts with a bearer token for admin views', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [] })
    });
    vi.stubGlobal('fetch', fetchMock);

    await listPosts({ includeDrafts: true, token: 'admin-token' });

    expect(fetchMock).toHaveBeenCalledWith('/api/posts?includeDrafts=1', {
      headers: { Authorization: 'Bearer admin-token' }
    });
  });

  it('reads and creates public post comments', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ comments: [], comment: { id: 'c1' } })
    });
    vi.stubGlobal('fetch', fetchMock);

    await listPostComments('hello-post');
    await createPostComment('hello-post', { content: '不错' }, 'user-token');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/posts/hello-post/comments');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/posts/hello-post/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer user-token' },
      body: JSON.stringify({ content: '不错' })
    });
  });

  it('registers and logs in public users', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'user-token', expiresAt: '2026-07-14T00:00:00.000Z', user: { username: 'kite' } })
    });
    vi.stubGlobal('fetch', fetchMock);

    await registerUser({ username: 'kite', password: 'secret123', nickname: 'Kite', role: '读者' });
    await loginUser('kite', 'secret123');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123', nickname: 'Kite', role: '读者' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123' })
    });
  });
});
