import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageWithFallback } from './shared';

describe('ImageWithFallback', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  async function waitFor(check: () => Element | null) {
    for (let index = 0; index < 80; index += 1) {
      const result = check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
  });

  it('renders fallback content after the image load fails', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <ImageWithFallback
          alt="broken cover"
          className="cover-thumb"
          src="/api/images/raw/missing"
          fallback={<span className="cover-dot">fallback</span>}
        />
      );
    });

    const image = await waitFor(() => host.querySelector('img.cover-thumb'));
    expect(image).toBeTruthy();

    await act(async () => {
      image?.dispatchEvent(new Event('error'));
    });

    expect(await waitFor(() => host.querySelector('.cover-dot'))).toBeTruthy();
    expect(host.querySelector('img.cover-thumb')).toBeFalsy();
  });
});
