import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearArticleAutosaveDraft,
  createPostComment,
  createUser,
  deletePostComment,
  deleteUser,
  getArticleAutosaveDraft,
  getPost,
  listPostComments,
  listPosts,
  loginUser,
  registerUser,
  saveArticleAutosaveDraft,
  updatePostComment
} from './blogApi';

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

  it('requests compact public lists and loads full article content separately', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [], post: { id: 'p1', slug: 'hello-post', content: 'full content' } })
    });
    vi.stubGlobal('fetch', fetchMock);

    await listPosts({ summary: true });
    await getPost('hello-post');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/posts?summary=1', { headers: {} });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/posts/hello-post', { headers: {} });
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

  it('updates and deletes comments with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ comment: { id: 'c1', content: 'edited' }, ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await updatePostComment('hello-post', 'c1', { content: 'edited' }, 'user-token');
    await deletePostComment('hello-post', 'c1', 'user-token');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/posts/hello-post/comments/c1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer user-token' },
      body: JSON.stringify({ content: 'edited' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/posts/hello-post/comments/c1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer user-token' }
    });
  });

  it('registers and logs in public users', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'user-token', expiresAt: '2026-07-14T00:00:00.000Z', user: { username: 'kite' } })
    });
    vi.stubGlobal('fetch', fetchMock);

    await registerUser({ username: 'kite', password: 'secret123', nickname: 'Kite' });
    await loginUser('kite', 'secret123');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123', nickname: 'Kite' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123' })
    });
  });

  it('creates and deletes admin-managed users', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u1' }, ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await createUser({ username: 'made_user', password: 'secret123', nickname: 'Made', permission: 'reader' }, 'admin-token');
    await deleteUser('u1', 'admin-token');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer admin-token' },
      body: JSON.stringify({ username: 'made_user', password: 'secret123', nickname: 'Made', permission: 'reader' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/users/u1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' }
    });
  });

  it('manages the admin article autosave draft with bearer auth', async () => {
    const draft = {
      editingId: 'post-1',
      draft: {
        title: 'autosave',
        summary: 'summary',
        category: 'notes' as const,
        tags: ['draft'],
        content: 'content',
        status: 'draft' as const,
        cover: 'notes' as const,
        coverImage: ''
      }
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ draft: { ...draft, updatedAt: '2026-07-10T00:00:00.000Z' }, ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await getArticleAutosaveDraft('admin-token');
    await saveArticleAutosaveDraft(draft, 'admin-token');
    await clearArticleAutosaveDraft('admin-token');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/article-draft', {
      headers: { Authorization: 'Bearer admin-token' }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/article-draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer admin-token' },
      body: JSON.stringify(draft)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/admin/article-draft', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' }
    });
  });
});
