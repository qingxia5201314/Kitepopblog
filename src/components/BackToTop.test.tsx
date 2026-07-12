import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackToTop } from './BackToTop';

describe('BackToTop', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function button() {
    return host.querySelector<HTMLButtonElement>('button[aria-label="回到页面顶部"]')!;
  }

  it('stays mounted and hidden at or below the threshold, then becomes visible above it', () => {
    act(() => root.render(<BackToTop />));

    expect(button().className).toContain('is-hidden');
    expect(button().getAttribute('aria-hidden')).toBe('true');
    expect(button().tabIndex).toBe(-1);

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 400 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(button().className).toContain('is-hidden');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 401 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(button().className).toContain('is-visible');
    expect(button().getAttribute('aria-hidden')).toBe('false');
    expect(button().tabIndex).toBe(0);

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(button().className).toContain('is-hidden');
  });

  it('uses the initial scroll position before the first scroll event', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    act(() => root.render(<BackToTop />));

    expect(button().className).toContain('is-visible');
    expect(button().getAttribute('aria-hidden')).toBe('false');
  });

  it('scrolls smoothly when reduced motion is not requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    act(() => root.render(<BackToTop />));
    act(() => button().click());

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('uses automatic scrolling for reduced motion and tolerates missing matchMedia', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    act(() => root.render(<BackToTop />));
    act(() => button().click());
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });

    vi.stubGlobal('matchMedia', undefined);
    act(() => button().click());
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('registers one passive listener and removes the same listener on unmount', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    act(() => root.render(<BackToTop />));

    const scrollRegistration = addEventListener.mock.calls.find(([type]) => type === 'scroll');
    expect(scrollRegistration?.[2]).toEqual({ passive: true });

    act(() => root.unmount());
    const scrollCleanup = removeEventListener.mock.calls.find(([type]) => type === 'scroll');
    expect(scrollCleanup?.[1]).toBe(scrollRegistration?.[1]);

    expect(() => window.dispatchEvent(new Event('scroll'))).not.toThrow();
    root = createRoot(host);
  });
});
