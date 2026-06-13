import { BlogPost, BlogPostDraft, PostStatus } from './blog';

interface ListPostOptions {
  includeDrafts?: boolean;
  token?: string;
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload as T;
}

export async function listPosts(options: ListPostOptions = {}): Promise<BlogPost[]> {
  const query = options.includeDrafts ? '?includeDrafts=1' : '';
  const payload = await parseResponse<{ posts: BlogPost[] }>(
    await fetch(`/api/posts${query}`, {
      headers: authHeaders(options.token)
    })
  );

  return payload.posts;
}

export async function createPost(draft: BlogPostDraft, token: string): Promise<BlogPost> {
  const payload = await parseResponse<{ post: BlogPost }>(
    await fetch('/api/posts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(token)
      },
      body: JSON.stringify(draft)
    })
  );

  return payload.post;
}

export async function updatePost(
  id: string,
  patch: Partial<BlogPostDraft> | { status: PostStatus },
  token: string
): Promise<BlogPost> {
  const payload = await parseResponse<{ post: BlogPost }>(
    await fetch(`/api/posts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(token)
      },
      body: JSON.stringify(patch)
    })
  );

  return payload.post;
}

export async function deletePost(id: string, token: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await fetch(`/api/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    })
  );
}
