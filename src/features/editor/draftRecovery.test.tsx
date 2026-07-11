import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogPostDraft } from '../../lib/blog';
import { useDraftAutosave } from './hooks/useDraftAutosave';
import { DraftRecoveryDialog } from './components/DraftRecoveryDialog';

const emptyDraft: BlogPostDraft = {
  title: '', summary: '', category: 'life', tags: [], content: '', status: 'draft', cover: 'life', coverImage: ''
};

function Harness({ onBound }: { onBound: (id: string) => void }) {
  const [draft, setDraft] = useState(emptyDraft);
  const autosave = useDraftAutosave({
    enabled: true,
    token: 'admin-token',
    editingId: null,
    draft,
    onBoundEditingId: onBound
  });
  return (
    <div>
      <button onClick={() => setDraft((current) => ({ ...current, title: `${current.title}自动保存标题` }))}>write</button>
      <span data-note>{autosave.note}</span>
    </div>
  );
}

describe('draft autosave hook', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('silently saves after ten seconds and binds a server-created draft post', async () => {
    const onBound = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        draft: { editingId: 'draft-post-1', draft: { ...emptyDraft, title: '自动保存标题' }, updatedAt: '2026-07-12T00:00:00.000Z' }
      })
    );
    await act(async () => root.render(<Harness onBound={onBound} />));
    await act(async () => container.querySelector('button')?.click());

    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/article-draft');
    expect(onBound).toHaveBeenCalledWith('draft-post-1');
    expect(container.querySelector('[data-note]')?.textContent).toContain('已自动保存');
  });

  it('keeps at most one request in flight and flushes the newer generation afterward', async () => {
    const resolvers: Array<(response: Response) => void> = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise<Response>((resolve) => {
        resolvers.push((response) => {
          concurrent -= 1;
          resolve(response);
        });
      });
    });
    await act(async () => root.render(<Harness onBound={vi.fn()} />));
    await act(async () => container.querySelector('button')?.click());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await act(async () => container.querySelector('button')?.click());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(maxConcurrent).toBe(1);
    expect(resolvers).toHaveLength(1);

    await act(async () => resolvers[0](Response.json({ draft: { editingId: 'post-1', draft: emptyDraft, updatedAt: new Date().toISOString() } })));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(resolvers).toHaveLength(2);
  });
});

describe('draft recovery dialog', () => {
  it('lets the editor inspect, restore, or discard a newer snapshot', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    await act(async () => root.render(
      <DraftRecoveryDialog
        onDiscard={onDiscard}
        onRestore={onRestore}
        snapshot={{ editingId: 'post-1', updatedAt: '2026-07-12T00:00:00.000Z', draft: { ...emptyDraft, title: '恢复标题', content: '恢复正文' } }}
      />
    ));

    await act(async () => (Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '查看草稿') as HTMLButtonElement).click());
    expect(host.textContent).toContain('恢复正文');
    await act(async () => (Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '恢复草稿') as HTMLButtonElement).click());
    await act(async () => (Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '放弃草稿') as HTMLButtonElement).click());
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    host.remove();
  });
});
