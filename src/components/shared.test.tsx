import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageWithFallback, permissionLabel, renderInlineMarkdown, renderMarkdown } from './shared';

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

  it('renders inline formulas without parsing escaped dollars or inline code', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <p>
          {renderInlineMarkdown('公式 $E = mc^2$，价格 \\$100，代码 `$notMath$`。')}
        </p>
      );
    });

    expect(host.querySelector('.math-inline .katex')).toBeTruthy();
    expect(host.querySelector('code')?.textContent).toBe('$notMath$');
    expect(host.textContent).toContain('价格 $100');
    expect(host.querySelectorAll('.math-inline')).toHaveLength(1);
  });

  it('renders parenthesized LaTeX inline formulas', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<p>{renderInlineMarkdown('如果整数 \\(a\\) 可以写成，所以 \\(3\\mid12\\)。')}</p>);
    });

    expect(host.querySelectorAll('.math-inline .katex')).toHaveLength(2);
    expect(host.textContent).not.toContain('\\(a\\)');
    expect(host.textContent).not.toContain('\\(3\\mid12\\)');
  });

  it('returns readable Chinese permission labels', () => {
    expect(permissionLabel('admin')).toBe('管理员');
    expect(permissionLabel('reader')).toBe('读者用户');
  });

  it('renders display formulas through the shared markdown renderer', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<div>{renderMarkdown('$$\n\\frac{a}{b}\n$$')}</div>);
    });

    expect(host.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders standard markdown tables', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <div>
          {renderMarkdown('| 项目 | RIP | OSPF |\n| --- | --- | --- |\n| 分类 | 距离向量 | 链路状态 |')}
        </div>
      );
    });

    expect(host.querySelector('table')).toBeTruthy();
    expect(host.querySelectorAll('th')).toHaveLength(3);
    expect(host.querySelectorAll('td')).toHaveLength(3);
    expect(host.textContent).toContain('链路状态');
  });
});
