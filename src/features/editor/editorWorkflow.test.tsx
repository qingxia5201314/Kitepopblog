import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevisionPanel } from './components/RevisionPanel';
import { PublishScheduleControl } from './components/PublishScheduleControl';

describe('editor workflow components', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

  it('renders newest-first revision controls and disables protected deletion', async () => {
    await act(async () => root.render(<RevisionPanel
      comparison={null} error="" loading={false} onCloseComparison={vi.fn()} onCompare={vi.fn()}
      onRemove={vi.fn()} onRestore={vi.fn()}
      revisions={[
        { id: 'new', postId: 'p1', title: 'New', summary: '', content: '', category: 'notes', tags: [], cover: 'notes', coverImage: '', status: 'published', editorUserId: 'admin', source: 'publish', isProtected: true, createdAt: '2026-07-12T10:00:00Z' },
        { id: 'old', postId: 'p1', title: 'Old', summary: '', content: '', category: 'notes', tags: [], cover: 'notes', coverImage: '', status: 'draft', editorUserId: 'admin', source: 'manual-save', isProtected: false, createdAt: '2026-07-11T10:00:00Z' }
      ]}
    />));
    expect(Array.from(host.querySelectorAll('article strong')).map((node) => node.textContent)).toEqual(['发布', '手动保存']);
    expect((host.querySelectorAll('article button')[2] as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows scheduled status, failure retry, and cancellation controls', async () => {
    await act(async () => root.render(<PublishScheduleControl
      onCancel={vi.fn().mockResolvedValue(undefined)} onRetry={vi.fn().mockResolvedValue(undefined)} onSchedule={vi.fn().mockResolvedValue(undefined)}
      post={{ id: 'p1', slug: 'p1', title: 'P', summary: '', category: 'notes', tags: [], content: '', status: 'scheduled', createdAt: '', updatedAt: '', cover: 'notes', coverImage: '', scheduledAt: '2026-07-13T10:00:00Z', scheduleError: 'failed' }}
    />));
    expect(host.textContent).toContain('已计划');
    expect(host.textContent).toContain('发布失败：failed');
    expect(host.textContent).toContain('取消定时');
    expect(host.textContent).toContain('立即重试');
  });
});
