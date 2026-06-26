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
});
