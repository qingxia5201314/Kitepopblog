import { BlogPost, BlogPostDraft, BlogUser, PostComment, PostCommentDraft, PostStatus, UserSession } from './blog';

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

export async function listPostComments(postIdOrSlug: string): Promise<PostComment[]> {
  const payload = await parseResponse<{ comments: PostComment[] }>(
    await fetch(`/api/posts/${encodeURIComponent(postIdOrSlug)}/comments`)
  );

  return payload.comments;
}

export async function createPostComment(postIdOrSlug: string, draft: PostCommentDraft, token: string): Promise<PostComment> {
  const payload = await parseResponse<{ comment: PostComment }>(
    await fetch(`/api/posts/${encodeURIComponent(postIdOrSlug)}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(token)
      },
      body: JSON.stringify(draft)
    })
  );

  return payload.comment;
}

export async function registerUser(draft: {
  username: string;
  password: string;
  nickname: string;
  role: string;
}): Promise<UserSession> {
  return parseResponse<UserSession>(
    await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );
}

export async function loginUser(username: string, password: string): Promise<UserSession> {
  return parseResponse<UserSession>(
    await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
  );
}

export async function getCurrentUser(token: string): Promise<BlogUser> {
  const payload = await parseResponse<{ user: BlogUser }>(
    await fetch('/api/users/me', {
      headers: authHeaders(token)
    })
  );
  return payload.user;
}

export async function listUsers(token: string): Promise<BlogUser[]> {
  const payload = await parseResponse<{ users: BlogUser[] }>(
    await fetch('/api/admin/users', {
      headers: authHeaders(token)
    })
  );
  return payload.users;
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<BlogUser, 'nickname' | 'role' | 'permission'>>,
  token: string
): Promise<BlogUser> {
  const payload = await parseResponse<{ user: BlogUser }>(
    await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(token)
      },
      body: JSON.stringify(patch)
    })
  );
  return payload.user;
}
