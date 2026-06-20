import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./assets/accounting-hero.webp', () => ({ default: '/accounting-hero.webp' }));
vi.mock('./assets/haruhi-favicon.png', () => ({ default: '/haruhi-favicon.png' }));
vi.mock('./assets/haruhi-avatar.png', () => ({ default: '/haruhi-avatar.png' }));
vi.mock('./assets/haruhi-cutout.png', () => ({ default: '/haruhi-cutout.png' }));
vi.mock('./assets/haruhi-cutout.webp', () => ({ default: '/haruhi-cutout.webp' }));

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.startsWith('/api/posts')) {
    return {
      ok: true,
      json: async () => ({
        posts: [
          {
            id: 'post-1',
            slug: 'post-1',
            title: 'Test post',
            summary: 'summary',
            category: 'life',
            tags: ['one'],
            content: 'content',
            status: 'published',
            createdAt: '2026-06-18T10:00:00.000Z',
            updatedAt: '2026-06-18T10:00:00.000Z',
            cover: 'life',
            coverImage: ''
          }
        ],
        comments: []
      })
    } as Response;
  }

  if (url.startsWith('/api/users/me') || url.startsWith('/api/admin/session')) {
    return {
      ok: false,
      json: async () => ({ message: 'Unauthorized' })
    } as Response;
  }

  return {
    ok: true,
    json: async () => ({ ok: true })
  } as Response;
});

describe('App layout shells', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  async function waitFor(check: () => Element | null, attempts = 80) {
    for (let index = 0; index < attempts; index += 1) {
      const result = check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.location.hash = '';
    vi.unstubAllGlobals();
  });

  it('renders the redesigned home shell with hero and article index areas', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);
    await waitFor(() => host.querySelector('.hero-band'));

    expect(host.querySelector('.hero-band')).toBeTruthy();
    expect(host.querySelector('.home-post-section')).toBeTruthy();
    expect(host.querySelector('.post-list')).toBeTruthy();
  });

  it('renders article detail shell when hash points to a post', async () => {
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/posts/post-1';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);
    await waitFor(() => host.querySelector('.article-page'));

    expect(host.querySelector('.article-page')).toBeTruthy();
    expect(host.querySelector('.article-page-shell')).toBeTruthy();
    expect(host.querySelector('.article-header-card')).toBeTruthy();
    expect(host.querySelector('.article-body-card')).toBeTruthy();
    expect(host.querySelector('.comment-panel')).toBeTruthy();
  });
});
