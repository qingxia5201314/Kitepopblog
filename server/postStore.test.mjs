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

  it('stores public comments for each post', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });
    const post = store.list({ includeDrafts: false })[0];

    const comment = store.createComment(post.id, {
      nickname: 'Kite',
      role: '站长',
      content: '这篇文章有用。'
    });

    expect(comment.postId).toBe(post.id);
    expect(comment.nickname).toBe('Kite');
    expect(comment.role).toBe('站长');
    expect(store.listComments(post.slug).map((item) => item.content)).toEqual(['这篇文章有用。']);
    expect(() => store.createComment(post.id, { nickname: '', role: '', content: '' })).toThrow('Comment content is required');
  });
});
