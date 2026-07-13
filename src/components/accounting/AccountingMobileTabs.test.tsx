import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountingMobileTabs } from './AccountingMobileTabs';

describe('AccountingMobileTabs', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('exposes the controlled selection and requests the ledger panel on click', () => {
    const onChange = vi.fn();

    act(() => root.render(<AccountingMobileTabs active="entry" onChange={onChange} />));

    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const entryTab = tabs.find((tab) => tab.textContent === '记一笔');
    const ledgerTab = tabs.find((tab) => tab.textContent === '流水');

    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('记账工作区');
    expect(tabs).toHaveLength(4);
    expect(entryTab?.getAttribute('aria-selected')).toBe('true');
    expect(entryTab?.tabIndex).toBe(0);
    expect(ledgerTab?.getAttribute('aria-selected')).toBe('false');
    expect(ledgerTab?.tabIndex).toBe(-1);

    act(() => ledgerTab?.click());

    expect(onChange).toHaveBeenCalledWith('ledger');
  });

  it('moves focus and requests the next panel with horizontal arrow keys', () => {
    const onChange = vi.fn();

    act(() => root.render(<AccountingMobileTabs active="entry" onChange={onChange} />));

    const entryTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="entry"]')!;
    const ledgerTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="ledger"]')!;
    act(() => {
      entryTab.focus();
      entryTab.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    expect(onChange).toHaveBeenCalledWith('ledger');
    expect(document.activeElement).toBe(ledgerTab);
  });
});
