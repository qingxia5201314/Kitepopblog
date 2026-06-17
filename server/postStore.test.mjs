import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostStore } from './postStore.mjs';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-posts-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('post store', () => {
  it('seeds published posts into a new sqlite database', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });

    const posts = store.list({ includeDrafts: false });

    expect(posts.length).toBeGreaterThanOrEqual(4);
    expect(posts.every((post) => post.status === 'published')).toBe(true);
  });

  it('creates, updates, and removes a post', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });

    const created = store.create({
      title: '服务端发布测试',
      summary: '电脑和手机应该看到同一篇文章',
      category: 'notes',
      tags: ['同步'],
      content: '正文内容',
      status: 'draft',
      cover: 'notes',
      coverImage: ''
    });

    expect(store.get(created.id)?.slug).toBe('fu-wu-duan-fa-bu-ce-shi');

    const updated = store.update(created.id, { status: 'published', title: '服务端发布测试更新' });

    expect(updated?.status).toBe('published');
    expect(updated?.slug).toBe('fu-wu-duan-fa-bu-ce-shi-geng-xin');
    expect(store.remove(created.id)).toBe(true);
    expect(store.get(created.id)).toBeUndefined();
  });

  it('stores precise timestamps for posts and comments', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });
    const created = store.create({
      title: 'timestamp post',
      summary: 'summary',
      category: 'notes',
      tags: [],
      content: 'content',
      status: 'published',
      cover: 'notes',
      coverImage: ''
    });
    const comment = store.createComment(created.id, { content: 'hello' }, { nickname: 'Kite', permission: 'reader' });

    expect(created.createdAt).toContain('T');
    expect(created.updatedAt).toContain('T');
    expect(comment.createdAt).toContain('T');
  });

  it('stores public comments for each post', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });
    const post = store.list({ includeDrafts: false })[0];

    const comment = store.createComment(post.id, {
      nickname: 'Kite',
      role: '站长',
      content: '这篇文章有用。'
    }, { nickname: '登录昵称', permission: 'reader' });

    expect(comment.postId).toBe(post.id);
    expect(comment.nickname).toBe('登录昵称');
    expect(comment.role).toBe('阅读用户');
    expect(store.listComments(post.slug).map((item) => item.content)).toEqual(['这篇文章有用。']);
    expect(() => store.createComment(post.id, { nickname: '', role: '', content: '' })).toThrow('Comment content is required');
  });
});
