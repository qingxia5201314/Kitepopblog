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
    window.history.pushState({}, '', '/');
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

  it('marks the current top navigation item as active', async () => {
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/images');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);
    await waitFor(() => host.querySelector('.topbar nav'));

    const activeNav = host.querySelector('.topbar nav button.active');
    expect(activeNav?.getAttribute('aria-current')).toBe('page');
    expect(activeNav?.textContent).toContain('图床');
  });

  it('shows inline and display formula controls in the admin editor', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/admin');
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', adminFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(
      await waitFor(() => host.querySelector('button[aria-label="一级标题"], button[aria-label="行内公式"]'))
    ).toBeTruthy();
    expect(host.querySelector('button[aria-label="块级公式"]')).toBeTruthy();
  });

  it('renders readable Chinese labels in the admin content managers', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/admin');
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', adminFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => host.querySelector('.admin-layout'))).toBeTruthy();
    expect(host.querySelector('.admin-content-group .panel-heading h2')?.textContent).toBe('内容管理');
    const expandContentButton = host.querySelector('.admin-content-group .panel-heading button') as HTMLButtonElement | null;
    expect(expandContentButton?.textContent).toBe('展开');
    expandContentButton?.click();
    expect(await waitFor(() => host.querySelector('.admin-create'))).toBeTruthy();
    expect(host.querySelector('.admin-create')?.textContent?.trim()).toBe('新建文章');
    expect(host.querySelector('.admin-user-group .panel-heading h2')?.textContent).toBe('用户管理');
  });

  it('loads draft posts automatically when an admin session already exists', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/admin');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      if (url.startsWith('/api/posts')) {
        const headers = init?.headers as Record<string, string> | undefined;
        const isDraftRequest = url.includes('includeDrafts=1') && headers?.Authorization === 'Bearer admin-token';
        return Response.json({
          posts: isDraftRequest
            ? [
                {
                  id: 'post-draft',
                  slug: 'post-draft',
                  title: 'Draft post',
                  summary: 'draft summary',
                  category: 'life',
                  tags: ['draft'],
                  content: 'draft content',
                  status: 'draft',
                  createdAt: '2026-06-24T10:00:00.000Z',
                  updatedAt: '2026-06-24T10:00:00.000Z',
                  cover: 'life',
                  coverImage: ''
                }
              ]
            : [],
          comments: []
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const expandContentButton = await waitFor(() => host.querySelector('.admin-content-group .panel-heading button'));
    expect(expandContentButton).toBeTruthy();
    (expandContentButton as HTMLButtonElement).click();

    expect(await waitFor(() => (host.textContent?.includes('Draft post') ? host : null))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/posts?includeDrafts=1', {
      headers: { Authorization: 'Bearer admin-token' }
    });
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

  it('loads hosted images automatically when an admin session already exists', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/images');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/images')) {
        return Response.json({
          images: [
            {
              id: 'img-1',
              originalName: 'cover.png',
              contentType: 'image/png',
              sizeBytes: 3,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              path: '/api/images/raw/img-1'
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => host.querySelector('.image-item'))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/images', {
      headers: { Authorization: 'Bearer admin-token' }
    });
  });

  it('loads file storage automatically when an admin session already exists', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/files');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/files')) {
        return Response.json({
          folder: null,
          breadcrumbs: [],
          folders: [],
          files: [
            {
              id: 'file-1',
              originalName: 'rfi.txt',
              contentType: 'text/plain',
              sizeBytes: 7,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              folderId: ''
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => host.querySelector('.file-item'))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/files', {
      headers: { Authorization: 'Bearer admin-token' }
    });
  });

  it('shares admin login across files and images routes without a refresh', async () => {
    window.history.pushState({}, '', '/files');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) {
        return Response.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
      }
      if (url.startsWith('/api/admin/login')) {
        return Response.json({
          ok: true,
          token: 'admin-token',
          expiresAt: '2099-01-01T00:00:00.000Z'
        });
      }
      if (url.startsWith('/api/files')) {
        return Response.json({
          folder: null,
          breadcrumbs: [],
          folders: [],
          files: [
            {
              id: 'file-1',
              originalName: 'rfi.txt',
              contentType: 'text/plain',
              sizeBytes: 7,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              folderId: ''
            }
          ]
        });
      }
      if (url.startsWith('/api/images')) {
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers?.Authorization !== 'Bearer admin-token') {
          return Response.json({ message: 'Unauthorized' }, { status: 401 });
        }
        return Response.json({
          images: [
            {
              id: 'img-1',
              originalName: 'cover.png',
              contentType: 'image/png',
              sizeBytes: 3,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              path: '/api/images/raw/img-1'
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const passwordInput = (await waitFor(() => host.querySelector('.unlock-panel input[type="password"]'))) as HTMLInputElement | null;
    expect(passwordInput).toBeTruthy();
    passwordInput!.value = 'secret';
    passwordInput!.dispatchEvent(new Event('input', { bubbles: true }));

    const unlockForm = host.querySelector('.unlock-panel') as HTMLFormElement | null;
    expect(unlockForm).toBeTruthy();
    unlockForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(await waitFor(() => host.querySelector('.file-item'))).toBeTruthy();

    window.history.pushState({}, '', '/images');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(await waitFor(() => host.querySelector('.image-item'))).toBeTruthy();
  });
});
