import { afterEach, describe, expect, it, vi } from 'vitest';
import { listPosts } from './blogApi';

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
});
