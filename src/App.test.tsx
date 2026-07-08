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

class FakeUploadTarget {
  onprogress: ((event: ProgressEvent) => void) | null = null;
}

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | null = null;

  responseText = '';
  status = 0;
  upload = new FakeUploadTarget();
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open() {}

  setRequestHeader() {}

  send() {}
}

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

  function fillInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
    window.location.hash = '';
    vi.unstubAllGlobals();
    FakeXMLHttpRequest.latest = null;
  });

  it('renders the redesigned home shell with hero and article index areas', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);
    await waitFor(() => host.querySelector('.hero-band'));
    await waitFor(() => host.querySelector('.post-item'));

    expect(host.querySelector('.hero-band')).toBeTruthy();
    expect(host.querySelector('.home-post-section')).toBeTruthy();
    expect(host.querySelector('.post-list')).toBeTruthy();
    expect(host.querySelector('.hero-visual.tilt-card')).toBeTruthy();
    expect(host.querySelector('.post-item.tilt-card')).toBeTruthy();
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

  it('loads persisted comments when opening an article detail page', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts/post-1/comments')) {
        return Response.json({
          comments: [
            {
              id: 'comment-1',
              postId: 'post-1',
              userId: 'user-reader',
              nickname: 'Reader',
              role: '阅读用户',
              content: 'Persisted comment',
              createdAt: '2026-07-06T10:00:00.000Z',
              updatedAt: '2026-07-06T10:00:00.000Z'
            }
          ]
        });
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    window.location.hash = '#/posts/post-1';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => (host.textContent?.includes('Persisted comment') ? host : null))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/posts/post-1/comments');
    expect(host.querySelector('.comment-panel h3')?.textContent).toContain('1');
  });

  it('logs in public users from the home auth form and keeps the session', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/users/login')) {
        return Response.json({
          token: 'user-token',
          expiresAt: '2099-01-01T00:00:00.000Z',
          user: {
            id: 'user-1',
            username: 'kite',
            nickname: 'Kite',
            permission: 'reader',
            createdAt: '2026-07-06T00:00:00.000Z',
            updatedAt: '2026-07-06T00:00:00.000Z'
          }
        });
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const authForm = (await waitFor(() => host.querySelector('.user-auth-card form'))) as HTMLFormElement | null;
    expect(authForm).toBeTruthy();
    const [usernameInput, passwordInput] = Array.from(authForm!.querySelectorAll('input')) as HTMLInputElement[];
    fillInput(usernameInput, 'kite');
    fillInput(passwordInput, 'secret123');
    (authForm!.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(
      await waitFor(() =>
        pageFetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/users/login')) ? host : null
      )
    ).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123' })
    });
    expect((await waitFor(() => host.querySelector('.user-auth-card strong')))?.textContent).toBe('Kite');
    expect(window.localStorage.getItem('kitepop-user-session')).toContain('user-token');
  });

  it('registers public users from the home auth form and keeps the session', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/users/register')) {
        return Response.json(
          {
            token: 'registered-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
            user: {
              id: 'user-2',
              username: 'newkite',
              nickname: 'New Kite',
              permission: 'reader',
              createdAt: '2026-07-06T00:00:00.000Z',
              updatedAt: '2026-07-06T00:00:00.000Z'
            }
          },
          { status: 201 }
        );
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const authForm = (await waitFor(() => host.querySelector('.user-auth-card form'))) as HTMLFormElement | null;
    expect(authForm).toBeTruthy();
    const registerTab = Array.from(authForm!.querySelectorAll('.segmented-control button')).find((button) =>
      button.textContent?.includes('注册')
    ) as HTMLButtonElement | undefined;
    registerTab?.click();

    expect(await waitFor(() => (authForm!.querySelectorAll('input').length === 3 ? authForm : null))).toBeTruthy();
    const [usernameInput, passwordInput, nicknameInput] = Array.from(authForm!.querySelectorAll('input')) as HTMLInputElement[];
    fillInput(usernameInput, 'newkite');
    fillInput(passwordInput, 'secret123');
    fillInput(nicknameInput, 'New Kite');
    (authForm!.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(
      await waitFor(() =>
        pageFetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/users/register')) ? host : null
      )
    ).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'newkite', password: 'secret123', nickname: 'New Kite' })
    });
    expect((await waitFor(() => host.querySelector('.user-auth-card strong')))?.textContent).toBe('New Kite');
    expect(window.localStorage.getItem('kitepop-user-session')).toContain('registered-token');
  });

  it('shows a clear public auth error when registration input is invalid', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => fetchMock(input));
    vi.stubGlobal('fetch', pageFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const authForm = (await waitFor(() => host.querySelector('.user-auth-card form'))) as HTMLFormElement | null;
    expect(authForm).toBeTruthy();
    const registerTab = Array.from(authForm!.querySelectorAll('.segmented-control button')).find((button) =>
      button.textContent?.includes('注册')
    ) as HTMLButtonElement | undefined;
    registerTab?.click();

    expect(await waitFor(() => (authForm!.querySelectorAll('input').length === 3 ? authForm : null))).toBeTruthy();
    const [usernameInput, passwordInput] = Array.from(authForm!.querySelectorAll('input')) as HTMLInputElement[];
    fillInput(usernameInput, '中');
    fillInput(passwordInput, '123');
    (authForm!.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(await waitFor(() => host.querySelector('.auth-feedback'))).toBeTruthy();
    expect(host.querySelector('.auth-feedback')?.textContent).toContain('用户名只能使用');
    expect(pageFetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/users/register'))).toBe(false);
  });

  it('returns from article detail to the article list when the browser goes back', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const postButton = (await waitFor(() => host.querySelector('.post-item'))) as HTMLButtonElement | null;
    expect(postButton).toBeTruthy();
    postButton!.click();

    expect(await waitFor(() => host.querySelector('.article-page'))).toBeTruthy();
    expect(window.location.hash).toBe('#/posts/post-1');

    window.history.back();
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await waitFor(() => (host.querySelector('.article-page') ? null : host))).toBeTruthy();
    expect(host.querySelector('.post-list')).toBeTruthy();
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

  it('shows upload progress tips for image uploads', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/images');
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/images')) return Response.json({ images: [] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const fileInput = (await waitFor(() => host.querySelector('.image-dropzone input[type="file"]'))) as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: [new File(['png'], 'cover.png', { type: 'image/png' })]
    });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    const xhr = await waitFor(() => FakeXMLHttpRequest.latest as unknown as Element | null);
    expect(xhr).toBeTruthy();
    FakeXMLHttpRequest.latest!.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 6 } as ProgressEvent);
    FakeXMLHttpRequest.latest!.status = 200;
    FakeXMLHttpRequest.latest!.responseText = JSON.stringify({ image: { id: 'img-1', path: '/api/images/raw/img-1' } });

    expect(await waitFor(() => host.querySelector('.upload-progress-tip'))).toBeTruthy();
    expect(host.querySelector('.upload-progress-tip')?.textContent).toContain('cover.png');
    expect(
      await waitFor(() => (host.querySelector('.upload-progress-tip')?.textContent?.includes('50%') ? host : null))
    ).toBeTruthy();
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

  it('falls back when copying file links without navigator clipboard', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/files');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand
    });
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/files/file-1/link')) {
        return Response.json({ link: { path: '/api/files/raw/file-1?token=signed-token' } });
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
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const copyButton = (await waitFor(() => host.querySelector('.file-item button'))) as HTMLButtonElement | null;
    expect(copyButton).toBeTruthy();
    copyButton!.click();

    expect(await waitFor(() => (execCommand.mock.calls.length ? host : null))).toBeTruthy();
    expect(host.textContent).toContain('/api/files/raw/file-1?token=signed-token');
  });

  it('shows upload progress tips for file uploads', async () => {
    window.localStorage.setItem(
      'kitepop-admin-session',
      JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/files');
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/admin/session')) return Response.json({ ok: true });
      if (url.startsWith('/api/files')) {
        return Response.json({ folder: null, breadcrumbs: [], folders: [], files: [] });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const fileInput = (await waitFor(() => host.querySelector('.file-dropzone input[type="file"]'))) as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: [new File(['payload'], 'report.pdf', { type: 'application/pdf' })]
    });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    const xhr = await waitFor(() => FakeXMLHttpRequest.latest as unknown as Element | null);
    expect(xhr).toBeTruthy();
    FakeXMLHttpRequest.latest!.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 1024 } as ProgressEvent);
    FakeXMLHttpRequest.latest!.status = 200;
    FakeXMLHttpRequest.latest!.responseText = JSON.stringify({ file: { id: 'file-1' } });

    expect(await waitFor(() => host.querySelector('.upload-progress-tip'))).toBeTruthy();
    expect(host.querySelector('.upload-progress-tip')?.textContent).toContain('report.pdf');
    expect(
      await waitFor(() => (host.querySelector('.upload-progress-tip')?.textContent?.includes('50%') ? host : null))
    ).toBeTruthy();
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

  it('reloads accounting entries when ledger filters change', async () => {
    window.localStorage.setItem(
      'kitepop-accounting-session',
      JSON.stringify({ token: 'accounting-token', expiresAt: '2099-01-01T00:00:00.000Z' })
    );
    window.history.pushState({}, '', '/accounting');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/accounting/month')) {
        return Response.json({
          entries: [
            {
              id: 'entry-1',
              type: 'expense',
              amountCents: 2500,
              category: 'food',
              account: '微信',
              spentAt: '2026-06-26',
              note: '',
              includeInSaving: true,
              createdAt: '2026-06-26T00:00:00.000Z',
              updatedAt: '2026-06-26T00:00:00.000Z'
            }
          ],
          categories: [
            { id: 'food', name: '餐饮', type: 'expense', accent: '#b6423c' },
            { id: 'salary', name: '工资', type: 'income', accent: '#2f7d67' }
          ],
          settings: { monthlyBudgetCents: 0, savingGoal: null },
          summary: {
            incomeCents: 0,
            expenseCents: 2500,
            savingIncomeCents: 0,
            savingExpenseCents: 2500,
            savingNetExpenseCents: 2500,
            balanceCents: -2500,
            dailyExpenseCents: 2500,
            budgetLimitCents: 0,
            plannedAvailableCents: 0,
            targetSavingCents: 0,
            budgetUsedPercent: 0,
            budgetRemainingCents: 0,
            topExpenseCategory: { category: 'food', amountCents: 2500 }
          },
          savingGoal: null
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

    const ledgerCard = (await waitFor(() => host.querySelectorAll('.accounting-layout > .accounting-card')[1])) as HTMLElement | null;
    expect(ledgerCard).toBeTruthy();
    const [typeFilter, categoryFilter] = Array.from(ledgerCard!.querySelectorAll('select')) as HTMLSelectElement[];

    typeFilter.value = 'expense';
    typeFilter.dispatchEvent(new Event('change', { bubbles: true }));
    categoryFilter.value = 'food';
    categoryFilter.dispatchEvent(new Event('change', { bubbles: true }));

    expect(
      await waitFor(() =>
        pageFetchMock.mock.calls.some(([input]) => String(input).includes('/api/accounting/month?month=') && String(input).includes('type=expense'))
          ? host
          : null
      )
    ).toBeTruthy();
    expect(
      pageFetchMock.mock.calls.some(
        ([input]) => String(input).includes('/api/accounting/month?month=') && String(input).includes('category=food')
      )
    ).toBe(true);
  });

  it('opens the in-site media preview shell for uploaded videos', async () => {
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
      if (url.startsWith('/api/files/file-1/preview-link')) {
        return Response.json({ link: { path: '/api/files/raw/file-1?token=preview-token' } });
      }
      if (url.startsWith('/api/files')) {
        return Response.json({
          folder: null,
          breadcrumbs: [],
          folders: [],
          files: [
            {
              id: 'file-1',
              originalName: 'lesson.mp4',
              contentType: 'video/mp4',
              sizeBytes: 1024,
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

    const previewButton = await waitFor(() => host.querySelector('.file-item .ghost'));
    expect(previewButton).toBeTruthy();
    (previewButton as HTMLButtonElement).click();

    expect(await waitFor(() => host.querySelector('.media-preview-page'))).toBeTruthy();
    expect(host.querySelector('.media-preview-shell')?.textContent).toContain('lesson.mp4');
    expect(host.querySelector('video.media-preview-player')).toBeTruthy();
    expect(host.querySelector('video.media-preview-player')?.getAttribute('draggable')).toBe('false');
    expect(host.querySelector('.media-preview-overlay button')?.textContent).toContain('播放');
  });
});
