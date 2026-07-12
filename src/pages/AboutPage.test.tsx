import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutPage } from './AboutPage';

const completeProfile = {
  avatarUrl: '/custom-avatar.png',
  displayName: 'Kite',
  identityTags: ['安全研究', '写作者'],
  intro: '记录生活与技术。',
  githubUrl: 'https://github.com/kite',
  content: '# 长一点的自我介绍\n\n这里有 **Markdown** 内容。',
  updatedAt: '2026-07-12T00:00:00.000Z'
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('about page', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  function renderPage() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<AboutPage />));
    return host;
  }

  it('moves from loading to a complete profile with one GitHub link and Markdown', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (resolveResponse = resolve))));
    const host = renderPage();

    expect(host.querySelector('[role="status"]')?.textContent).toContain('正在加载');
    resolveResponse(Response.json({ profile: completeProfile }));
    await flush();

    expect(host.querySelector('.about-page')).toBeTruthy();
    expect(host.querySelector('.about-hero.about-reveal')).toBeTruthy();
    expect(host.querySelector('.about-sos-watermark')).toBeTruthy();
    expect(host.querySelector('.about-avatar-ring img')?.getAttribute('src')).toBe('/custom-avatar.png');
    expect(host.querySelector('.about-profile-name')?.textContent).toBe('Kite');
    expect(host.querySelector('.about-identity-tags')?.textContent).toContain('安全研究');
    expect(host.textContent).toContain('记录生活与技术。');
    const githubLinks = host.querySelectorAll('a.about-social-link[href="https://github.com/kite"]');
    expect(githubLinks).toHaveLength(1);
    expect(githubLinks[0].getAttribute('target')).toBe('_blank');
    expect(githubLinks[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(host.querySelector('.about-content.about-reveal h2')?.textContent).toBe('长一点的自我介绍');
    expect(host.querySelector('.about-content strong')?.textContent).toBe('Markdown');
  });

  it('does not render a social link when GitHub is empty and permits an empty Markdown body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: { ...completeProfile, githubUrl: '', content: '' } })));
    const host = renderPage();
    await flush();

    expect(host.querySelector('.about-social-link')).toBeFalsy();
    expect(host.querySelector('.about-content')).toBeFalsy();
    expect(host.querySelector('.about-hero')).toBeTruthy();
  });

  it('shows a friendly empty state when the whole profile is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: {
      avatarUrl: '', displayName: '', identityTags: [], intro: '', githubUrl: '', content: '', updatedAt: ''
    } })));
    const host = renderPage();
    await flush();

    expect(host.querySelector('.about-page [role="status"]')?.textContent).toContain('个人资料还在准备中');
  });

  it('shows an error and retries the request', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ profile: completeProfile }));
    vi.stubGlobal('fetch', fetchMock);
    const host = renderPage();
    await flush();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('无法连接个人资料服务');
    const retry = host.querySelector('button') as HTMLButtonElement;
    act(() => retry.click());
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.about-profile-name')?.textContent).toBe('Kite');
  });

  it('falls back to the brand avatar when the avatar is missing or fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: completeProfile })));
    const host = renderPage();
    await flush();

    const avatar = host.querySelector('.about-avatar-ring img') as HTMLImageElement;
    act(() => avatar.dispatchEvent(new Event('error')));
    expect(host.querySelector('.about-avatar-ring img')?.getAttribute('src')).toMatch(/haruhi-avatar/);
  });
});
