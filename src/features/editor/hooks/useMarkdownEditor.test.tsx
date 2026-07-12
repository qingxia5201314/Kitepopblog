import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarkdownEditor } from './useMarkdownEditor';

function Harness() {
  const [content, setContent] = useState('- one\n- two');
  const editor = useMarkdownEditor({
    adminToken: 'admin-token',
    content,
    updateForm: (patch) => {
      if (patch.content !== undefined) setContent(patch.content);
    },
    notify: vi.fn()
  });
  return <textarea onChange={(event) => setContent(event.target.value)} onKeyDown={editor.handleEditorKeyDown} ref={editor.contentEditorRef} value={content} />;
}

describe('useMarkdownEditor', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('handles Tab inside the textarea instead of moving browser focus', async () => {
    await act(async () => root.render(<Harness />));
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(textarea.value).toBe('  - one\n  - two');
    expect(document.activeElement).toBe(textarea);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([2, 15]);
  });
});
