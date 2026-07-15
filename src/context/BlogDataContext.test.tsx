import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlogPost } from '../lib/blog';
import { BlogDataProvider, useBlogData } from './BlogDataContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { listPosts } = vi.hoisted(() => ({ listPosts: vi.fn() }));
let appState = { isAdmin: true, notify: vi.fn() };

vi.mock('./AppContext', () => ({ useApp: () => appState }));
vi.mock('../lib/blogApi', () => ({ listPosts }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

const post = (id: string, status: BlogPost['status']): BlogPost => ({
  id,
  slug: id,
  title: id,
  summary: id,
  category: 'life',
  tags: [],
  content: id,
  status,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
  cover: 'life',
  coverImage: ''
});

describe('BlogDataProvider auth transitions', () => {
  let root: Root;
  let host: HTMLDivElement;

  function Probe() {
    const { posts } = useBlogData();
    return <output>{posts.map((item) => item.id).join(',')}</output>;
  }

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    listPosts.mockReset();
  });

  it('ignores a stale draft response after the identity becomes non-admin', async () => {
    const draftRequest = deferred<BlogPost[]>();
    const publicRequest = deferred<BlogPost[]>();
    listPosts
      .mockReturnValueOnce(draftRequest.promise)
      .mockReturnValueOnce(publicRequest.promise);
    appState = { isAdmin: true, notify: vi.fn() };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<BlogDataProvider><Probe /></BlogDataProvider>));

    appState = { isAdmin: false, notify: appState.notify };
    await act(async () => root.render(<BlogDataProvider><Probe /></BlogDataProvider>));
    await act(async () => publicRequest.resolve([post('public-post', 'published')]));
    expect(host.textContent).toBe('public-post');

    await act(async () => draftRequest.resolve([post('draft-post', 'draft')]));

    expect(host.textContent).toBe('public-post');
    expect(listPosts).toHaveBeenNthCalledWith(1, { includeDrafts: true, summary: false });
    expect(listPosts).toHaveBeenNthCalledWith(2, { includeDrafts: false, summary: true });
  });
});
